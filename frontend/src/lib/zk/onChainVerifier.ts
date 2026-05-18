import { createPublicClient, createWalletClient, custom, decodeErrorResult, http, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import type { WalletProvider } from "@/lib/escrow/client";
import type { ZKProof } from "./types";
import { formatPublicInputsAsBytes32, proofToHex } from "./proofService";
import type { SupportedCircuitName } from "./proofService";

export type VerifierCircuitName = SupportedCircuitName;

export interface OnChainVerificationResult {
  verified: boolean;
  verifierAddress?: `0x${string}`;
  error?: string;
  txHash?: Hex;
}

const verifierAbi = [
  { type: "error", name: "ProofLengthWrong", inputs: [] },
  { type: "error", name: "PublicInputsLengthWrong", inputs: [] },
  { type: "error", name: "SumcheckFailed", inputs: [] },
  { type: "error", name: "ShpleminiFailed", inputs: [] },
  {
    type: "function",
    name: "verify",
    stateMutability: "view",
    inputs: [
      { name: "_proof", type: "bytes" },
      { name: "_publicInputs", type: "bytes32[]" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;

export function getOnChainVerifierAddress(circuitName: SupportedCircuitName): `0x${string}` | null {
  const value =
    circuitName === "ranking"
      ? process.env.NEXT_PUBLIC_RANKING_VERIFIER_ADDRESS
      : circuitName === "settlement"
        ? process.env.NEXT_PUBLIC_SETTLEMENT_VERIFIER_ADDRESS
        : circuitName === "rng_commitment"
          ? process.env.NEXT_PUBLIC_RNG_COMMITMENT_VERIFIER_ADDRESS
          : circuitName === "arena_schedule"
            ? process.env.NEXT_PUBLIC_ARENA_SCHEDULE_VERIFIER_ADDRESS
            : circuitName === "elimination"
              ? process.env.NEXT_PUBLIC_ELIMINATION_VERIFIER_ADDRESS
              : null;

  return value?.startsWith("0x") ? (value as `0x${string}`) : null;
}

function extractRevertData(error: unknown): `0x${string}` | null {
  const candidates = [
    error,
    error && typeof error === "object" ? (error as { cause?: unknown }).cause : undefined
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const walk = [candidate as Record<string, unknown>];
    while (walk.length > 0) {
      const value = walk.pop();
      if (!value) {
        continue;
      }

      for (const nested of Object.values(value)) {
        if (typeof nested === "string" && nested.startsWith("0x")) {
          return nested as `0x${string}`;
        }
        if (nested && typeof nested === "object") {
          walk.push(nested as Record<string, unknown>);
        }
      }
    }
  }

  return null;
}

function decodeVerifierError(error: unknown): string {
  const revertData = extractRevertData(error);
  if (revertData) {
    try {
      const decoded = decodeErrorResult({
        abi: verifierAbi,
        data: revertData
      });

      switch (decoded.errorName) {
        case "ProofLengthWrong":
          return "Verifier rejected the proof because the proof length is wrong.";
        case "PublicInputsLengthWrong":
          return "Verifier rejected the proof because the public-input length is wrong.";
        case "SumcheckFailed":
          return "Verifier rejected the proof during sumcheck.";
        case "ShpleminiFailed":
          return "Verifier rejected the proof during Shplemini. This usually means the verifier address or formatted public inputs do not match the proof.";
        default:
          break;
      }
    } catch {
      // Fall through to generic message.
    }
  }

  return error instanceof Error ? error.message : "On-chain verification failed.";
}

export async function verifyOnChainReadOnly(
  circuitName: SupportedCircuitName,
  proof: ZKProof
): Promise<OnChainVerificationResult> {
  const verifierAddress = getOnChainVerifierAddress(circuitName);
  if (!verifierAddress) {
    return {
      verified: false,
      error: `NEXT_PUBLIC_${circuitName.toUpperCase()}_VERIFIER_ADDRESS is not configured.`
    };
  }

  try {
    const client = createPublicClient({
      chain: baseSepolia,
      transport: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org")
    });

    const result = await client.readContract({
      address: verifierAddress,
      abi: verifierAbi,
      functionName: "verify",
      args: [proofToHex(proof.proof), formatPublicInputsAsBytes32(proof.publicInputs)]
    });

    return {
      verified: Boolean(result),
      verifierAddress
    };
  } catch (error) {
    return {
      verified: false,
      verifierAddress,
      error: decodeVerifierError(error)
    };
  }
}

export async function verifyOnChainWithTransaction(
  circuitName: SupportedCircuitName,
  proof: ZKProof,
  provider: WalletProvider
): Promise<OnChainVerificationResult> {
  const verifierAddress = getOnChainVerifierAddress(circuitName);
  if (!verifierAddress) {
    return {
      verified: false,
      error: `NEXT_PUBLIC_${circuitName.toUpperCase()}_VERIFIER_ADDRESS is not configured.`
    };
  }

  try {
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org")
    });
    const walletClient = createWalletClient({
      chain: baseSepolia,
      transport: custom(provider)
    });
    const [account] = await walletClient.getAddresses();
    if (!account) {
      throw new Error("Connect a wallet before sending the verification transaction.");
    }

    const { request } = await publicClient.simulateContract({
      account,
      address: verifierAddress,
      abi: verifierAbi,
      functionName: "verify",
      args: [proofToHex(proof.proof), formatPublicInputsAsBytes32(proof.publicInputs)]
    });
    const txHash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    return {
      verified: receipt.status === "success",
      verifierAddress,
      txHash
    };
  } catch (error) {
    return {
      verified: false,
      verifierAddress,
      error: decodeVerifierError(error)
    };
  }
}
