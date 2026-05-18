"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { formatEther, isAddress, parseEther, type Address } from "viem";
import type { Placement, Snake } from "@/lib/game/core";
import {
  getExplorerTransactionUrl,
  settleEscrowMatch,
  type WalletProvider
} from "@/lib/escrow/client";
import {
  generateRankingProof,
  generateSettlementProof,
  verifyProofLocally,
  type SupportedCircuitName
} from "@/lib/zk/proofService";
import {
  getOnChainVerifierAddress,
  verifyOnChainWithTransaction
} from "@/lib/zk/onChainVerifier";
import type { ZKProof } from "@/lib/zk/types";
import {
  getVerificationStatus,
  submitProofToZkVerify,
  waitForVerification,
  type KurierVerificationStatus
} from "@/lib/zk/zkVerifyService";

interface ZkProofPanelProps {
  mode: "practice" | "stake";
  matchEnded?: boolean;
  matchId?: string;
  placements: Placement[];
  players: Snake[];
  stakeEth?: string;
  escrowAddress?: `0x${string}` | null;
  walletProvider?: WalletProvider | null;
  joinedPlayerAddresses?: `0x${string}`[];
}

type ProofStage = "idle" | "generating" | "ready" | "verifying" | "submitting" | "tracking" | "complete" | "error";
type BusyAction = "generate" | "local" | "zkverify" | "onchain" | "refresh" | "settle";

interface ProofRunState {
  stage: ProofStage;
  message: string;
  localVerification?: "pass" | "fail";
  onChainVerification?: "pass" | "fail";
  jobId?: string;
  zkStatus?: KurierVerificationStatus["status"];
  txExplorerUrl?: string;
  updatedAt?: string;
  proofBytes?: number;
  settledOnChain?: boolean;
  warnings?: string[];
}

const KURIER_ENABLED = Boolean(process.env.NEXT_PUBLIC_KURIER_API_KEY);
const SETTLEMENT_SPLIT_BPS = [6500, 2500, 1000] as const;

export function ZkProofPanel({
  mode,
  matchEnded = false,
  matchId,
  placements,
  players,
  stakeEth,
  escrowAddress,
  walletProvider,
  joinedPlayerAddresses
}: ZkProofPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [busy, setBusy] = useState<{ circuit: SupportedCircuitName; action: BusyAction } | null>(null);
  const proofCacheRef = useRef<Partial<Record<SupportedCircuitName, ZKProof>>>({});
  const [runs, setRuns] = useState<Record<SupportedCircuitName, ProofRunState>>({
    ranking: createInitialRun("ranking", true),
    settlement: createInitialRun("settlement", mode === "stake")
  });

  useEffect(() => {
    if (matchEnded && mode === "stake") {
      setIsExpanded(true);
    }
  }, [matchEnded, mode]);

  const topThreeMasses = useMemo(
    () =>
      [0, 1, 2].map((index) => {
        const placement = placements[index];
        return BigInt(Math.max(0, Math.round(placement?.mass ?? 0)));
      }),
    [placements]
  );

  const settlementPayload = useMemo(() => {
    if (mode !== "stake" || !stakeEth) {
      return null;
    }

    const playerCount = BigInt(Math.max(3, players.length));
    const totalPool = parseEther(stakeEth) * playerCount;
    const platformFee = (totalPool * 300n) / 10_000n;
    const prizePool = totalPool - platformFee;

    return {
      total_pool: totalPool,
      platform_fee: platformFee,
      first: (prizePool * BigInt(SETTLEMENT_SPLIT_BPS[0])) / 10_000n,
      second: (prizePool * BigInt(SETTLEMENT_SPLIT_BPS[1])) / 10_000n,
      third:
        prizePool -
        (prizePool * BigInt(SETTLEMENT_SPLIT_BPS[0])) / 10_000n -
        (prizePool * BigInt(SETTLEMENT_SPLIT_BPS[1])) / 10_000n
    };
  }, [mode, players.length, stakeEth]);

  const winnerAddresses = useMemo(
    () => deriveWinnerAddresses(placements, players, joinedPlayerAddresses),
    [joinedPlayerAddresses, placements, players]
  );
  const settlementPreview = useMemo(() => {
    if (!settlementPayload) {
      return null;
    }

    const payoutAmounts = [settlementPayload.first, settlementPayload.second, settlementPayload.third];

    return {
      totalPool: settlementPayload.total_pool,
      platformFee: settlementPayload.platform_fee,
      prizePool: settlementPayload.total_pool - settlementPayload.platform_fee,
      payouts: placements.slice(0, 3).map((placement, index) => {
        const snake = players.find((candidate) => candidate.id === placement.playerId);
        return {
          rank: index + 1,
          name: snake?.name ?? placement.playerId,
          playerId: placement.playerId,
          address: winnerAddresses?.[index] ?? null,
          mass: placement.mass,
          amount: payoutAmounts[index] ?? 0n
        };
      })
    };
  }, [placements, players, settlementPayload, winnerAddresses]);
  const canSettleOnChain =
    mode === "stake" &&
    Boolean(matchId && /^\d+$/.test(matchId) && escrowAddress && walletProvider && winnerAddresses);

  const proofsReady = Number(Boolean(proofCacheRef.current.ranking)) + Number(Boolean(proofCacheRef.current.settlement));
  const headerTone =
    busy !== null ? "busy" : runs.settlement.settledOnChain ? "complete" : proofsReady > 0 ? "ready" : "idle";
  const headerLabel =
    busy !== null
      ? `${busy.circuit} ${busy.action}`
      : runs.settlement.settledOnChain
        ? "settled"
        : proofsReady > 0
          ? `${proofsReady} ready`
          : "idle";

  function patchRun(circuitName: SupportedCircuitName, patch: Partial<ProofRunState>) {
    setRuns((current) => ({
      ...current,
      [circuitName]: {
        ...current[circuitName],
        ...patch
      }
    }));
  }

  async function handleGenerate(circuitName: SupportedCircuitName) {
    setBusy({ circuit: circuitName, action: "generate" });
    patchRun(circuitName, {
      stage: "generating",
      message: `Generating ${circuitName} proof...`,
      localVerification: undefined,
      onChainVerification: undefined,
      jobId: undefined,
      zkStatus: undefined,
      txExplorerUrl: undefined,
      updatedAt: undefined,
      warnings: undefined,
      settledOnChain: circuitName === "settlement" ? false : undefined
    });

    try {
      const proof =
        circuitName === "ranking"
          ? await generateRankingProof({
              first_mass: topThreeMasses[0] ?? 0n,
              second_mass: topThreeMasses[1] ?? 0n,
              third_mass: topThreeMasses[2] ?? 0n
            })
          : await generateSettlementProof(
              settlementPayload ?? {
                total_pool: 0n,
                platform_fee: 0n,
                first: 0n,
                second: 0n,
                third: 0n
              }
            );

      proofCacheRef.current[circuitName] = proof;
      patchRun(circuitName, {
        stage: "ready",
        message: `${circuitName === "ranking" ? "Ranking" : "Settlement"} proof ready.`,
        proofBytes: proof.proof.byteLength,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      patchRun(circuitName, {
        stage: "error",
        message: error instanceof Error ? error.message : `Failed to generate ${circuitName} proof.`,
        updatedAt: new Date().toISOString()
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleLocalVerify(circuitName: SupportedCircuitName) {
    const proof = proofCacheRef.current[circuitName];
    if (!proof) {
      patchRun(circuitName, {
        stage: "error",
        localVerification: "fail",
        message: "Generate the proof first.",
        updatedAt: new Date().toISOString()
      });
      return;
    }

    setBusy({ circuit: circuitName, action: "local" });
    patchRun(circuitName, {
      stage: "verifying",
      message: "Running local verification..."
    });

    try {
      const result = await verifyProofLocally(circuitName, proof);
      patchRun(circuitName, {
        stage: result.valid ? "ready" : "error",
        localVerification: result.valid ? "pass" : "fail",
        message: result.valid ? "Local verification passed." : result.error ?? "Local verification failed.",
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      patchRun(circuitName, {
        stage: "error",
        localVerification: "fail",
        message: error instanceof Error ? error.message : "Local verification failed.",
        updatedAt: new Date().toISOString()
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmitZkVerify(circuitName: SupportedCircuitName) {
    const proof = proofCacheRef.current[circuitName];
    if (!proof) {
      patchRun(circuitName, {
        stage: "error",
        message: "Generate the proof first.",
        updatedAt: new Date().toISOString()
      });
      return;
    }

    if (!KURIER_ENABLED) {
      patchRun(circuitName, {
        stage: "error",
        message: "Set NEXT_PUBLIC_KURIER_API_KEY to submit to zkVerify.",
        updatedAt: new Date().toISOString()
      });
      return;
    }

    setBusy({ circuit: circuitName, action: "zkverify" });
    patchRun(circuitName, {
      stage: "submitting",
      message: "Submitting to zkVerify..."
    });

    try {
      const submission = await submitProofToZkVerify({ circuitName, proof });
      patchRun(circuitName, {
        stage: "tracking",
        jobId: submission.jobId,
        zkStatus: submission.optimisticVerify === "success" ? "Submitted" : undefined,
        message: submission.warnings?.length
          ? `Waiting for zkVerify aggregation. ${submission.warnings[0]}`
          : "Waiting for zkVerify aggregation...",
        updatedAt: new Date().toISOString(),
        warnings: submission.warnings
      });

      const status = await waitForVerification(submission.jobId, (nextStatus) => {
        patchRun(circuitName, {
          stage: resolveStageFromKurier(nextStatus.status),
          jobId: nextStatus.jobId,
          zkStatus: nextStatus.status,
          txExplorerUrl: nextStatus.txExplorerUrl,
          message: formatKurierStatusMessage(nextStatus),
          updatedAt: new Date().toISOString()
        });
      });
      patchRun(circuitName, {
        stage: resolveStageFromKurier(status.status),
        jobId: status.jobId,
        zkStatus: status.status,
        txExplorerUrl: status.txExplorerUrl,
        message: formatKurierStatusMessage(status),
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      patchRun(circuitName, {
        stage: "error",
        message: error instanceof Error ? error.message : "zkVerify submission failed.",
        updatedAt: new Date().toISOString()
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleRefreshStatus(circuitName: SupportedCircuitName) {
    const currentRun = runs[circuitName];
    if (!currentRun.jobId) {
      return;
    }

    setBusy({ circuit: circuitName, action: "refresh" });
    patchRun(circuitName, {
      stage: "tracking",
      message: "Refreshing zkVerify status..."
    });

    try {
      const status = await getVerificationStatus(currentRun.jobId);
      patchRun(circuitName, {
        stage: resolveStageFromKurier(status.status),
        jobId: status.jobId,
        zkStatus: status.status,
        txExplorerUrl: status.txExplorerUrl,
        message: status.status === "Failed" ? status.error ?? "zkVerify marked this proof as failed." : formatKurierStatusMessage(status),
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      patchRun(circuitName, {
        stage: "error",
        message: error instanceof Error ? error.message : "Unable to refresh zkVerify status.",
        updatedAt: new Date().toISOString()
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleVerifyOnChain(circuitName: SupportedCircuitName) {
    const proof = proofCacheRef.current[circuitName];
    if (!proof) {
      patchRun(circuitName, {
        stage: "error",
        onChainVerification: "fail",
        message: "Generate the proof first.",
        updatedAt: new Date().toISOString()
      });
      return;
    }

    if (mode !== "stake" || !walletProvider) {
      patchRun(circuitName, {
        stage: "error",
        onChainVerification: "fail",
        message: "On-chain verification is only available from funded stake rooms.",
        updatedAt: new Date().toISOString()
      });
      return;
    }

    setBusy({ circuit: circuitName, action: "onchain" });
    patchRun(circuitName, {
      stage: "verifying",
      message: "Opening your wallet for on-chain verification..."
    });

    try {
      const result = await verifyOnChainWithTransaction(circuitName, proof, walletProvider);
      patchRun(circuitName, {
        stage: result.verified ? "ready" : "error",
        onChainVerification: result.verified ? "pass" : "fail",
        txExplorerUrl: result.txHash ? getExplorerTransactionUrl(result.txHash) : undefined,
        message: result.verified
          ? "On-chain verification transaction confirmed."
          : result.error ?? "On-chain verification failed.",
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      patchRun(circuitName, {
        stage: "error",
        onChainVerification: "fail",
        message: error instanceof Error ? error.message : "On-chain verification failed.",
        updatedAt: new Date().toISOString()
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleSettleOnChain() {
    const rankingProof = proofCacheRef.current.ranking;
    const settlementProof = proofCacheRef.current.settlement;

    if (!rankingProof || !settlementProof) {
      patchRun("settlement", {
        stage: "error",
        message: "Generate both ranking and settlement proofs first.",
        updatedAt: new Date().toISOString()
      });
      return;
    }

    if (!canSettleOnChain || !matchId || !escrowAddress || !walletProvider || !winnerAddresses) {
      patchRun("settlement", {
        stage: "error",
        message: "Join the locked room with a funded wallet before settling on-chain.",
        updatedAt: new Date().toISOString()
      });
      return;
    }

    setBusy({ circuit: "settlement", action: "settle" });
    patchRun("settlement", {
      stage: "submitting",
      message: "Submitting settlement transaction..."
    });

    try {
      const result = await settleEscrowMatch({
        provider: walletProvider,
        contractAddress: escrowAddress,
        matchId: BigInt(matchId),
        winners: winnerAddresses,
        winnerBps: SETTLEMENT_SPLIT_BPS,
        rankingProof,
        settlementProof
      });

      patchRun("settlement", {
        stage: "complete",
        settledOnChain: true,
        txExplorerUrl: getExplorerTransactionUrl(result.hash),
        message: "Settlement recorded on-chain. Payouts are now claimable from the escrow transaction.",
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      patchRun("settlement", {
        stage: "error",
        message: error instanceof Error ? error.message : "Settlement transaction failed.",
        updatedAt: new Date().toISOString()
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`zk-panel ${isExpanded ? "zk-panel--expanded" : ""}`}>
      <button className="zk-panel__toggle" onClick={() => setIsExpanded((value) => !value)} type="button">
        <div className="zk-panel__toggle-copy">
          <span className={`zk-panel__icon zk-panel__icon--${headerTone}`}>ZK</span>
          <div>
            <strong>ZK Proofs</strong>
            <span>{headerLabel}</span>
          </div>
        </div>
        <span className="zk-panel__toggle-badge">{isExpanded ? "Hide" : "Open"}</span>
      </button>

      {isExpanded ? (
        <div className="zk-panel__body">
          <CircuitProofCard
            busy={busy}
            circuitName="ranking"
            description={`Masses ${topThreeMasses.map((value) => value.toString()).join(" / ")}`}
            onGenerate={handleGenerate}
            onRefresh={handleRefreshStatus}
            onSubmitZkVerify={handleSubmitZkVerify}
            onVerifyLocal={handleLocalVerify}
            onVerifyOnChain={handleVerifyOnChain}
            showOnChain={mode === "stake" && Boolean(walletProvider)}
            run={runs.ranking}
            title="Ranking"
          />

          <CircuitProofCard
            allowSettle={mode === "stake"}
            busy={busy}
            canSettle={canSettleOnChain && Boolean(proofCacheRef.current.ranking && proofCacheRef.current.settlement)}
            circuitName="settlement"
            description={
              settlementPayload
                ? `${formatEth(settlementPayload.total_pool)} ETH pool · 65 / 25 / 10 split`
                : "Stake mode required."
            }
            details={
              settlementPreview ? (
                <SettlementBreakdown
                  preview={settlementPreview}
                  settledOnChain={Boolean(runs.settlement.settledOnChain)}
                />
              ) : null
            }
            disabledReason={!settlementPayload ? "Stake mode required." : undefined}
            onGenerate={handleGenerate}
            onRefresh={handleRefreshStatus}
            onSettle={handleSettleOnChain}
            onSubmitZkVerify={handleSubmitZkVerify}
            onVerifyLocal={handleLocalVerify}
            onVerifyOnChain={handleVerifyOnChain}
            showOnChain={mode === "stake" && Boolean(walletProvider)}
            run={runs.settlement}
            title="Settlement"
          />
        </div>
      ) : null}
    </div>
  );
}

interface CircuitProofCardProps {
  circuitName: SupportedCircuitName;
  title: string;
  description: string;
  details?: ReactNode;
  run: ProofRunState;
  busy: { circuit: SupportedCircuitName; action: BusyAction } | null;
  onGenerate: (circuitName: SupportedCircuitName) => Promise<void>;
  onVerifyLocal: (circuitName: SupportedCircuitName) => Promise<void>;
  onSubmitZkVerify: (circuitName: SupportedCircuitName) => Promise<void>;
  onVerifyOnChain: (circuitName: SupportedCircuitName) => Promise<void>;
  onRefresh: (circuitName: SupportedCircuitName) => Promise<void>;
  onSettle?: () => Promise<void>;
  allowSettle?: boolean;
  canSettle?: boolean;
  disabledReason?: string;
  showOnChain?: boolean;
}

function CircuitProofCard({
  circuitName,
  title,
  description,
  details,
  run,
  busy,
  onGenerate,
  onVerifyLocal,
  onSubmitZkVerify,
  onVerifyOnChain,
  onRefresh,
  onSettle,
  allowSettle = false,
  canSettle = false,
  disabledReason,
  showOnChain = true
}: CircuitProofCardProps) {
  const proofReady = Boolean(run.proofBytes);
  const busyForCircuit = busy?.circuit === circuitName;
  const busyAction = busyForCircuit ? busy?.action : null;
  const verifierAddress = getOnChainVerifierAddress(circuitName);

  return (
    <section className="zk-proof-card">
      <div className="zk-proof-card__header">
        <div>
          <span className="zk-proof-card__eyebrow">{title}</span>
          <h3>{title}</h3>
        </div>
        <span className={`zk-proof-card__pill zk-proof-card__pill--${run.stage}`}>{formatStageLabel(run.stage)}</span>
      </div>

      <p className="zk-proof-card__description">{disabledReason ?? description}</p>
      <p className="zk-proof-card__message">{run.message}</p>
      {details}
      {run.warnings?.length ? (
        <div className="zk-proof-card__warnings">
          {run.warnings.map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
        </div>
      ) : null}

      <div className="zk-proof-card__meta">
        <span>{formatMetaStatus("Local", run.localVerification)}</span>
        <span>{formatMetaStatus("On-chain", run.onChainVerification)}</span>
        <span>{run.zkStatus ? `zkVerify ${run.zkStatus}` : KURIER_ENABLED ? "zkVerify ready" : "zkVerify off"}</span>
        {run.jobId ? <span>{truncateMiddle(run.jobId, 8, 6)}</span> : null}
      </div>

      <div className="zk-proof-card__actions">
        <button
          className="button button-primary"
          disabled={busy !== null || Boolean(disabledReason)}
          onClick={() => void onGenerate(circuitName)}
          type="button"
        >
          {busyAction === "generate" ? "Generating..." : "Generate"}
        </button>
        <button
          className="button"
          disabled={busy !== null || !proofReady}
          onClick={() => void onVerifyLocal(circuitName)}
          type="button"
        >
          {busyAction === "local" ? "Checking..." : "Local"}
        </button>
        <button
          className="button"
          disabled={busy !== null || !proofReady || !KURIER_ENABLED}
          onClick={() => void onSubmitZkVerify(circuitName)}
          type="button"
        >
          {busyAction === "zkverify" ? "Submitting..." : "zkVerify"}
        </button>
        {showOnChain ? (
          <button
            className="button"
            disabled={busy !== null || !proofReady || !verifierAddress}
            onClick={() => void onVerifyOnChain(circuitName)}
            type="button"
          >
            {busyAction === "onchain" ? "Sending..." : "On-chain"}
          </button>
        ) : null}
        {allowSettle ? (
          <button
            className="button"
            disabled={busy !== null || !canSettle || !proofReady || !onSettle}
            onClick={() => void onSettle?.()}
            type="button"
          >
            {busyAction === "settle" ? "Settling..." : "Settle"}
          </button>
        ) : null}
        {run.jobId ? (
          <button
            className="button"
            disabled={busy !== null}
            onClick={() => void onRefresh(circuitName)}
            type="button"
          >
            {busyAction === "refresh" ? "Refreshing..." : "Refresh"}
          </button>
        ) : null}
        {run.txExplorerUrl ? (
          <a
            aria-label="Open explorer"
            className="button zk-proof-card__icon-button"
            href={run.txExplorerUrl}
            rel="noreferrer"
            target="_blank"
            title="Open in explorer"
          >
            ↗
          </a>
        ) : null}
      </div>
    </section>
  );
}

function createInitialRun(circuitName: SupportedCircuitName, enabled: boolean): ProofRunState {
  return {
    stage: "idle",
    message: enabled ? `Ready to generate the ${circuitName} proof.` : "Stake mode required.",
    proofBytes: undefined
  };
}

function resolveStageFromKurier(status: KurierVerificationStatus["status"]): ProofStage {
  if (status === "Failed") {
    return "error";
  }

  if (status === "Finalized" || status === "Aggregated" || status === "AggregationPublished") {
    return "complete";
  }

  return "tracking";
}

function formatStageLabel(stage: ProofStage) {
  switch (stage) {
    case "idle":
      return "Idle";
    case "generating":
      return "Generating";
    case "ready":
      return "Ready";
    case "verifying":
      return "Checking";
    case "submitting":
      return "Submitting";
    case "tracking":
      return "Tracking";
    case "complete":
      return "Complete";
    case "error":
      return "Error";
    default:
      return stage;
  }
}

function truncateMiddle(value: string, start: number, end: number) {
  if (value.length <= start + end + 3) {
    return value;
  }

  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function formatEth(value: bigint) {
  const [whole, fraction = ""] = formatEther(value).split(".");
  const trimmedFraction = fraction.replace(/0+$/, "").slice(0, 4);
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
}

function deriveWinnerAddresses(
  placements: Placement[],
  players: Snake[],
  joinedPlayerAddresses?: readonly Address[]
): [Address, Address, Address] | null {
  if (!joinedPlayerAddresses || joinedPlayerAddresses.length < 3 || placements.length < 3) {
    return null;
  }

  const joinedLookup = new Set(joinedPlayerAddresses.map((address) => address.toLowerCase()));
  const winners = placements.slice(0, 3).map((placement) => {
    if (isAddress(placement.playerId) && joinedLookup.has(placement.playerId.toLowerCase())) {
      return placement.playerId as Address;
    }

    const snake = players.find((candidate) => candidate.id === placement.playerId);
    if (snake && isAddress(snake.id) && joinedLookup.has(snake.id.toLowerCase())) {
      return snake.id as Address;
    }

    return null;
  });

  return winners.every(Boolean) ? (winners as [Address, Address, Address]) : null;
}

function formatMetaStatus(label: string, status?: "pass" | "fail") {
  if (status === "pass") {
    return `${label} ok`;
  }
  if (status === "fail") {
    return `${label} failed`;
  }
  return `${label} pending`;
}

interface SettlementBreakdownProps {
  preview: {
    totalPool: bigint;
    platformFee: bigint;
    prizePool: bigint;
    payouts: Array<{
      rank: number;
      name: string;
      playerId: string;
      address: Address | null;
      mass: number;
      amount: bigint;
    }>;
  };
  settledOnChain: boolean;
}

function SettlementBreakdown({ preview, settledOnChain }: SettlementBreakdownProps) {
  return (
    <div className="zk-proof-card__payouts">
      <div className="zk-proof-card__summary-grid">
        <span>
          <strong>{formatEth(preview.totalPool)} ETH</strong>
          <small>Total pool</small>
        </span>
        <span>
          <strong>{formatEth(preview.platformFee)} ETH</strong>
          <small>Platform fee</small>
        </span>
        <span>
          <strong>{formatEth(preview.prizePool)} ETH</strong>
          <small>Prize pool</small>
        </span>
      </div>
      <ol className="zk-proof-card__payout-list">
        {preview.payouts.map((payout) => (
          <li key={`${payout.rank}-${payout.playerId}`}>
            <div>
              <strong>{`#${payout.rank}`}</strong>
              <span>{payout.name}</span>
              <small>{truncateMiddle(payout.address ?? payout.playerId, 8, 6)}</small>
            </div>
            <div>
              <strong>{`${formatEth(payout.amount)} ETH`}</strong>
              <small>{`Mass ${Math.round(payout.mass)}`}</small>
            </div>
          </li>
        ))}
      </ol>
      <p className="zk-proof-card__settlement-note">
        {settledOnChain
          ? "Settlement tx confirmed."
          : "Generate both proofs, submit them, then settle to write the split on-chain."}
      </p>
    </div>
  );
}

function formatKurierStatusMessage(status: KurierVerificationStatus) {
  switch (status.status) {
    case "Queued":
      return "zkVerify queued the proof.";
    case "Valid":
      return "zkVerify accepted the proof and is preparing submission.";
    case "Submitted":
      return "Proof submitted to zkVerify.";
    case "IncludedInBlock":
      return "Proof included in a zkVerify block.";
    case "AggregationPending":
      return "Proof submitted on zkVerify. Waiting for aggregation.";
    case "Aggregated":
      return "Proof aggregated on zkVerify.";
    case "AggregationPublished":
      return "Aggregation published on zkVerify.";
    case "Finalized":
      return "Proof finalized on zkVerify.";
    case "Failed":
      return status.error ?? "zkVerify verification failed.";
    default:
      return `zkVerify: ${status.status}.`;
  }
}
