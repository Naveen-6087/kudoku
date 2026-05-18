import vkHashes from "./vkHashes.json";
import { normalizeFieldAsBytes32, proofToHex } from "./proofService";
import type { ZKProof } from "./types";

export type KurierJobStatus =
  | "Queued"
  | "Valid"
  | "Submitted"
  | "IncludedInBlock"
  | "Finalized"
  | "AggregationPending"
  | "Aggregated"
  | "AggregationPublished"
  | "Failed";

export interface KurierSubmitResponse {
  jobId: string;
  optimisticVerify?: "success" | "failed";
  warnings?: string[];
  error?: string;
}

export interface KurierVerificationStatus {
  jobId: string;
  status: KurierJobStatus;
  txHash?: string;
  txExplorerUrl?: string;
  attestationId?: string;
  aggregatorUrl?: string;
  error?: string;
}

interface KurierSubmitPayload {
  proofType: "ultrahonk";
  proofOptions: {
    variant: "Plain";
    version: "V0_84";
  };
  vkRegistered: boolean;
  chainId: number;
  proofData: {
    proof: string;
    publicSignals: string[];
    vk: string;
  };
}

const KURIER_API_BASE =
  process.env.NEXT_PUBLIC_KURIER_API_URL ?? "https://api-testnet.kurier.xyz/api/v1";
const KURIER_API_KEY = process.env.NEXT_PUBLIC_KURIER_API_KEY ?? "";
const TARGET_CHAIN_ID = 84532;
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 60;
const ULTRAHONK_VERSION = "V0_84" as const;

function zkLog(message: string, data?: unknown) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [zkVerify] ${message}`, data ?? "");
}

function zkError(message: string, error?: unknown) {
  const ts = new Date().toISOString().slice(11, 19);
  console.error(`[${ts}] [zkVerify] ${message}`, error ?? "");
}

function formatPublicSignals(proof: ZKProof) {
  return proof.publicInputs.map((input) => normalizeFieldAsBytes32(input));
}

function isSuccessfulStatus(status: KurierJobStatus) {
  return status === "Finalized" || status === "Aggregated" || status === "AggregationPublished";
}

export function getRegisteredVkHash(circuitName: string) {
  return (vkHashes as Record<string, string>)[circuitName] ?? null;
}

export async function submitProofToZkVerify(options: {
  circuitName: string;
  proof: ZKProof;
}): Promise<KurierSubmitResponse> {
  if (!KURIER_API_KEY) {
    throw new Error("NEXT_PUBLIC_KURIER_API_KEY is not configured.");
  }

  const registeredHash = getRegisteredVkHash(options.circuitName);
  const useRegisteredVk = Boolean(registeredHash);

  if (!useRegisteredVk && !options.proof.verificationKey) {
    throw new Error("Verification key is required for zkVerify submission.");
  }

  const payload: KurierSubmitPayload = {
    proofType: "ultrahonk",
    proofOptions: { variant: "Plain", version: ULTRAHONK_VERSION },
    vkRegistered: useRegisteredVk,
    chainId: TARGET_CHAIN_ID,
    proofData: {
      proof: proofToHex(options.proof.proof),
      publicSignals: formatPublicSignals(options.proof),
      vk:
        useRegisteredVk && registeredHash
          ? registeredHash
          : proofToHex(options.proof.verificationKey ?? new Uint8Array())
    }
  };

  zkLog(`Submitting ${options.circuitName} proof`, {
    chainId: payload.chainId,
    vkRegistered: payload.vkRegistered,
    proofVersion: payload.proofOptions.version
  });

  try {
    const response = await fetch(`${KURIER_API_BASE}/submit-proof/${KURIER_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!response.ok) {
      const details = Array.isArray(data.details)
        ? data.details
            .map((detail: { path?: string; message?: string }) =>
              [detail.path, detail.message].filter(Boolean).join(": ")
            )
            .filter(Boolean)
            .join("; ")
        : "";
      throw new Error(
        [data.message, data.error, details, `HTTP ${response.status}`].filter(Boolean).join(" - ")
      );
    }

    zkLog(`Job accepted: ${data.jobId}`, { optimisticVerify: data.optimisticVerify, warnings: data.warnings });
    return data as KurierSubmitResponse;
  } catch (error) {
    zkError("Submit failed", error);
    throw error;
  }
}

export async function getVerificationStatus(jobId: string): Promise<KurierVerificationStatus> {
  if (!KURIER_API_KEY) {
    throw new Error("NEXT_PUBLIC_KURIER_API_KEY is not configured.");
  }

  try {
    const response = await fetch(`${KURIER_API_BASE}/job-status/${KURIER_API_KEY}/${jobId}`, {
      headers: { "Content-Type": "application/json" }
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message ?? data.error ?? `zkVerify status failed with ${response.status}.`);
    }

    return data as KurierVerificationStatus;
  } catch (error) {
    zkError(`Status lookup failed for ${jobId}`, error);
    throw error;
  }
}

export async function waitForVerification(
  jobId: string,
  onStatusUpdate?: (status: KurierVerificationStatus) => void
): Promise<KurierVerificationStatus> {
  let attempt = 0;

  while (attempt < MAX_POLL_ATTEMPTS) {
    const status = await getVerificationStatus(jobId);
    onStatusUpdate?.(status);

    if (isSuccessfulStatus(status.status)) {
      zkLog(`Job finalized: ${jobId}`, { status: status.status, txHash: status.txHash });
      return status;
    }

    if (status.status === "Failed") {
      throw new Error(status.error ?? "zkVerify verification failed.");
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    attempt += 1;
  }

  throw new Error("zkVerify verification timed out.");
}
