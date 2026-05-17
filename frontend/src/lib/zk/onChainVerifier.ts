import { createPublicClient, createWalletClient, custom, http, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import type { WalletProvider } from "@/lib/escrow/client";
import type { ZKProof } from "./types";
import { formatPublicInputsAsBytes32, proofToHex } from "./proofService";

export type VerifierCircuitName = "ranking" | "settlement";

export interface OnChainVerificationResult {
  verified: boolean;
  verifierAddress?: `0x${string}`;
  error?: string;
  txHash?: Hex;
}

const verifierAbi = [
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

export function getOnChainVerifierAddress(circuitName: VerifierCircuitName): `0x${string}` | null {
  const value =
    circuitName === "ranking"
      ? process.env.NEXT_PUBLIC_RANKING_VERIFIER_ADDRESS
      : process.env.NEXT_PUBLIC_SETTLEMENT_VERIFIER_ADDRESS;

  return value?.startsWith("0x") ? (value as `0x${string}`) : null;
}

export async function verifyOnChainReadOnly(
  circuitName: VerifierCircuitName,
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
      error: error instanceof Error ? error.message : "On-chain verification failed."
    };
  }
}

export async function verifyOnChainWithTransaction(
  circuitName: VerifierCircuitName,
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
      error: error instanceof Error ? error.message : "On-chain verification failed."
    };
  }
}
