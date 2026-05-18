"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { formatEther, isAddress, parseEther, type Address } from "viem";
import { playerTieBreakKey, type MatchConfig, type Placement, type Snake } from "@/lib/game/core";
import {
  getExplorerTransactionUrl,
  settleEscrowMatch,
  type WalletProvider
} from "@/lib/escrow/client";
import {
  generateArenaScheduleProof,
  generateEliminationProof,
  generateRankingProof,
  generateRngCommitmentProof,
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
  playerCount?: number;
  placements: Placement[];
  players: Snake[];
  stakeEth?: string;
  escrowAddress?: `0x${string}` | null;
  walletProvider?: WalletProvider | null;
  joinedPlayerAddresses?: `0x${string}`[];
  matchSeed?: string;
  matchConfig?: MatchConfig;
  elapsedMs?: number;
  deathWitnesses?: Record<
    string,
    {
      deathMode: "boundary" | "collision";
      headDistanceSq: number;
      threatDistanceSq: number;
      referenceElapsedMs: number;
      referenceSafeRadius: number;
    }
  >;
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
const FNV64_PRIME = 0x100000001b3n;
const FNV64_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV64_OFFSET_BASIS_ALT = 0x84222325cbf29cen;

export function ZkProofPanel({
  mode,
  matchEnded = false,
  matchId,
  playerCount,
  placements,
  players,
  stakeEth,
  escrowAddress,
  walletProvider,
  joinedPlayerAddresses,
  matchSeed,
  matchConfig,
  elapsedMs = 0,
  deathWitnesses
}: ZkProofPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [busy, setBusy] = useState<{ circuit: SupportedCircuitName; action: BusyAction } | null>(null);
  const proofCacheRef = useRef<Partial<Record<SupportedCircuitName, ZKProof>>>({});
  const [runs, setRuns] = useState<Record<SupportedCircuitName, ProofRunState>>({
    ranking: createInitialRun("ranking", true),
    settlement: createInitialRun("settlement", mode === "stake"),
    rng_commitment: createInitialRun("rng_commitment", Boolean(matchSeed && matchConfig)),
    arena_schedule: createInitialRun("arena_schedule", Boolean(matchConfig)),
    elimination: createInitialRun("elimination", Boolean(matchEnded && matchConfig && placements.length >= 3))
  });

  useEffect(() => {
    if (matchEnded && mode === "stake") {
      setIsExpanded(true);
    }
  }, [matchEnded, mode]);

  const matchIdField = useMemo(() => (matchId && /^\d+$/.test(matchId) ? BigInt(matchId) : 0n), [matchId]);
  const playerCountField = useMemo(
    () => BigInt(Math.max(3, Math.round(playerCount ?? players.length))),
    [playerCount, players.length]
  );

  const rankingPayload = useMemo(() => {
    const topThree = [0, 1, 2].map((index) => placements[index]);
    return {
      match_id: matchIdField,
      player_count: playerCountField,
      first_mass: BigInt(Math.max(0, Math.round(topThree[0]?.mass ?? 0))),
      first_survived_ms: BigInt(Math.max(0, Math.round(topThree[0]?.survivedMs ?? 0))),
      first_tiebreak_key: playerTieBreakKey(topThree[0]?.playerId ?? "first"),
      second_mass: BigInt(Math.max(0, Math.round(topThree[1]?.mass ?? 0))),
      second_survived_ms: BigInt(Math.max(0, Math.round(topThree[1]?.survivedMs ?? 0))),
      second_tiebreak_key: playerTieBreakKey(topThree[1]?.playerId ?? "second"),
      third_mass: BigInt(Math.max(0, Math.round(topThree[2]?.mass ?? 0))),
      third_survived_ms: BigInt(Math.max(0, Math.round(topThree[2]?.survivedMs ?? 0))),
      third_tiebreak_key: playerTieBreakKey(topThree[2]?.playerId ?? "third")
    };
  }, [matchIdField, placements, playerCountField]);

  const topThreeMasses = useMemo(
    () => [rankingPayload.first_mass, rankingPayload.second_mass, rankingPayload.third_mass],
    [rankingPayload]
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
      match_id: matchIdField,
      total_pool: totalPool,
      platform_fee: platformFee,
      first_bps: BigInt(SETTLEMENT_SPLIT_BPS[0]),
      second_bps: BigInt(SETTLEMENT_SPLIT_BPS[1]),
      third_bps: BigInt(SETTLEMENT_SPLIT_BPS[2]),
      first: (prizePool * BigInt(SETTLEMENT_SPLIT_BPS[0])) / 10_000n,
      second: (prizePool * BigInt(SETTLEMENT_SPLIT_BPS[1])) / 10_000n,
      third:
        prizePool -
        (prizePool * BigInt(SETTLEMENT_SPLIT_BPS[0])) / 10_000n -
        (prizePool * BigInt(SETTLEMENT_SPLIT_BPS[1])) / 10_000n
    };
  }, [matchIdField, mode, players.length, stakeEth]);

  const rngPayload = useMemo(() => {
    if (!matchSeed || !matchConfig) {
      return null;
    }

    return {
      match_id: matchIdField,
      player_count: playerCountField,
      initial_food_count: BigInt(Math.max(0, Math.round(matchConfig.initialFood))),
      revealed_seed: fieldFromString(matchSeed)
    };
  }, [matchConfig, matchIdField, matchSeed, playerCountField]);

  const arenaPayload = useMemo(() => {
    if (!matchConfig) {
      return null;
    }

    const boundedElapsedMs = Math.max(0, Math.min(Math.round(elapsedMs), Math.round(matchConfig.durationMs)));
    const currentSafeRadius = computeProofSafeRadius(boundedElapsedMs, matchConfig);

    return {
      match_id: matchIdField,
      duration_ms: BigInt(Math.max(1, Math.round(matchConfig.durationMs))),
      elapsed_ms: BigInt(boundedElapsedMs),
      initial_safe_radius: BigInt(Math.max(0, Math.round(matchConfig.initialSafeRadius))),
      final_safe_radius: BigInt(Math.max(0, Math.round(matchConfig.finalSafeRadius))),
      current_safe_radius: BigInt(Math.max(0, Math.round(currentSafeRadius))),
      arena_damage_per_second: BigInt(Math.max(0, Math.round(matchConfig.arenaDamagePerSecond)))
    };
  }, [elapsedMs, matchConfig, matchIdField]);

  const eliminationSetup = useMemo(() => {
    if (!matchEnded) {
      return { payload: null, reason: "Match must end before elimination verification." };
    }

    if (!matchConfig) {
      return { payload: null, reason: "Match config required." };
    }

    if (placements.length < 3) {
      return { payload: null, reason: "Final placement data is required." };
    }

    const slots = [];

    for (const placement of placements.slice(0, Math.min(players.length, 12))) {
      const snake = players.find((candidate) => candidate.id === placement.playerId);
      if (!snake) {
        return { payload: null, reason: `Missing live state for ${placement.playerId}.` };
      }

      const witness = deathWitnesses?.[placement.playerId];
      const deathType = snake.alive
        ? 0n
        : witness?.deathMode === "boundary"
          ? 1n
          : witness?.deathMode === "collision"
            ? 2n
            : snake.segments[0] && Math.hypot(snake.segments[0].x, snake.segments[0].y) > matchConfig.finalSafeRadius
              ? 1n
              : 2n;

      slots.push({
        mass: BigInt(Math.max(0, Math.round(placement.mass))),
        survived_ms: BigInt(Math.max(0, Math.round(placement.survivedMs))),
        tiebreak_key: playerTieBreakKey(placement.playerId),
        alive: snake.alive ? 1n : 0n,
        death_type: deathType
      });
    }

    while (slots.length < 12) {
      slots.push({
        mass: 0n,
        survived_ms: 0n,
        tiebreak_key: 0n,
        alive: 0n,
        death_type: 0n
      });
    }

    return {
        payload: {
          match_id: matchIdField,
          player_count: playerCountField,
        duration_ms: BigInt(Math.max(1, Math.round(matchConfig.durationMs))),
        initial_safe_radius: BigInt(Math.max(0, Math.round(matchConfig.initialSafeRadius))),
        final_safe_radius: BigInt(Math.max(0, Math.round(matchConfig.finalSafeRadius))),
        collision_radius: BigInt(Math.max(1, Math.round(matchConfig.collisionRadius))),
        slots
      },
      reason: null as string | null
    };
  }, [deathWitnesses, matchConfig, matchEnded, matchIdField, placements, playerCountField, players]);

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

  const proofsReady = Object.values(proofCacheRef.current).filter(Boolean).length;
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

  useEffect(() => {
    setRuns((current) =>
      syncIdleAvailability(current, proofCacheRef.current, {
        ranking: { enabled: true },
        settlement: { enabled: Boolean(settlementPayload), unavailableMessage: "Stake mode required." },
        rng_commitment: {
          enabled: Boolean(rngPayload),
          unavailableMessage: "Match seed and config required."
        },
        arena_schedule: { enabled: Boolean(arenaPayload), unavailableMessage: "Match config required." },
        elimination: {
          enabled: Boolean(eliminationSetup.payload),
          unavailableMessage: eliminationSetup.reason ?? "Death witnesses and full placement data required."
        }
      })
    );
  }, [arenaPayload, eliminationSetup.payload, eliminationSetup.reason, rngPayload, settlementPayload]);

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
      let proof: ZKProof;
      switch (circuitName) {
        case "ranking":
          proof = await generateRankingProof(rankingPayload);
          break;
        case "settlement":
          proof = await generateSettlementProof(
            settlementPayload ?? {
              match_id: matchIdField,
              total_pool: 0n,
              platform_fee: 0n,
              first_bps: BigInt(SETTLEMENT_SPLIT_BPS[0]),
              second_bps: BigInt(SETTLEMENT_SPLIT_BPS[1]),
              third_bps: BigInt(SETTLEMENT_SPLIT_BPS[2]),
              first: 0n,
              second: 0n,
              third: 0n
            }
          );
          break;
        case "rng_commitment":
          if (!rngPayload) {
            throw new Error("Match seed or config is unavailable for RNG commitment generation.");
          }
          proof = await generateRngCommitmentProof(rngPayload);
          break;
        case "arena_schedule":
          if (!arenaPayload) {
            throw new Error("Match config is unavailable for arena schedule generation.");
          }
          proof = await generateArenaScheduleProof(arenaPayload);
          break;
        case "elimination":
          if (!eliminationSetup.payload) {
            throw new Error(eliminationSetup.reason ?? "Elimination witness data is unavailable.");
          }
          proof = await generateEliminationProof(eliminationSetup.payload);
          break;
        default:
          throw new Error(`Unsupported circuit ${circuitName}.`);
      }

      proofCacheRef.current[circuitName] = proof;
      patchRun(circuitName, {
        stage: "ready",
        message: `${formatCircuitLabel(circuitName)} proof ready.`,
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
            circuitName="rng_commitment"
            description={
              rngPayload
                ? `${Number(rngPayload.player_count)} players · ${Number(rngPayload.initial_food_count)} initial food`
                : "Match seed and config required."
            }
            disabledReason={!rngPayload ? "Match seed and config required." : undefined}
            onGenerate={handleGenerate}
            onRefresh={handleRefreshStatus}
            onSubmitZkVerify={handleSubmitZkVerify}
            onVerifyLocal={handleLocalVerify}
            onVerifyOnChain={handleVerifyOnChain}
            run={runs.rng_commitment}
            showOnChain={mode === "stake" && Boolean(walletProvider)}
            title="RNG commitment"
          />

          <CircuitProofCard
            busy={busy}
            circuitName="arena_schedule"
            description={
              arenaPayload
                ? `Safe radius ${arenaPayload.current_safe_radius.toString()} / ${arenaPayload.initial_safe_radius.toString()}`
                : "Match config required."
            }
            disabledReason={!arenaPayload ? "Match config required." : undefined}
            onGenerate={handleGenerate}
            onRefresh={handleRefreshStatus}
            onSubmitZkVerify={handleSubmitZkVerify}
            onVerifyLocal={handleLocalVerify}
            onVerifyOnChain={handleVerifyOnChain}
            run={runs.arena_schedule}
            showOnChain={mode === "stake" && Boolean(walletProvider)}
            title="Arena schedule"
          />

          <CircuitProofCard
            busy={busy}
            circuitName="elimination"
            description={
              eliminationSetup.payload
                ? `${playerCountField.toString()} snakes · elimination summary committed`
                : "Final placement data required."
            }
            disabledReason={eliminationSetup.reason ?? undefined}
            onGenerate={handleGenerate}
            onRefresh={handleRefreshStatus}
            onSubmitZkVerify={handleSubmitZkVerify}
            onVerifyLocal={handleLocalVerify}
            onVerifyOnChain={handleVerifyOnChain}
            run={runs.elimination}
            showOnChain={mode === "stake" && Boolean(walletProvider)}
            title="Elimination"
          />

          <CircuitProofCard
            busy={busy}
            circuitName="ranking"
            description={`Masses ${topThreeMasses.map((value) => value.toString()).join(" / ")} · match ${matchIdField.toString()}`}
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
    message: enabled ? `Ready to generate the ${formatCircuitLabel(circuitName)} proof.` : "Required match data unavailable.",
    proofBytes: undefined
  };
}

function formatCircuitLabel(circuitName: SupportedCircuitName) {
  switch (circuitName) {
    case "ranking":
      return "Ranking";
    case "settlement":
      return "Settlement";
    case "rng_commitment":
      return "RNG commitment";
    case "arena_schedule":
      return "Arena schedule";
    case "elimination":
      return "Elimination";
    default:
      return circuitName;
  }
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

function computeProofSafeRadius(elapsedMs: number, config: MatchConfig) {
  const durationMs = Math.max(1, Math.round(config.durationMs));
  const boundedElapsedMs = Math.max(0, Math.min(Math.round(elapsedMs), durationMs));
  const initialSafeRadius = Math.max(0, Math.round(config.initialSafeRadius));
  const finalSafeRadius = Math.max(0, Math.round(config.finalSafeRadius));
  const radiusDelta = Math.max(0, initialSafeRadius - finalSafeRadius);
  const roundedDelta = Math.floor((radiusDelta * boundedElapsedMs + durationMs / 2) / durationMs);
  return initialSafeRadius - roundedDelta;
}

function fieldFromString(value: string): bigint {
  const low = fnv1a64(value, FNV64_OFFSET_BASIS);
  const high = fnv1a64(`${value}#seed`, FNV64_OFFSET_BASIS_ALT);
  return (high << 64n) | low;
}

function syncIdleAvailability(
  current: Record<SupportedCircuitName, ProofRunState>,
  proofCache: Partial<Record<SupportedCircuitName, ZKProof>>,
  availability: Record<SupportedCircuitName, { enabled: boolean; unavailableMessage?: string }>
) {
  let changed = false;
  const next = { ...current };

  for (const circuitName of Object.keys(availability) as SupportedCircuitName[]) {
    const run = current[circuitName];
    if (run.stage !== "idle" || proofCache[circuitName]) {
      continue;
    }

    const details = availability[circuitName];
    const message = details.enabled
      ? `Ready to generate the ${formatCircuitLabel(circuitName)} proof.`
              : details.unavailableMessage ?? "Required match data unavailable.";

    if (run.message === message) {
      continue;
    }

    next[circuitName] = {
      ...run,
      message
    };
    changed = true;
  }

  return changed ? next : current;
}

function fnv1a64(value: string, offsetBasis: bigint): bigint {
  let hash = offsetBasis;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * FNV64_PRIME);
  }

  return hash;
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
