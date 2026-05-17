export type Field = string | bigint;

export interface ZKProof {
  proof: Uint8Array;
  publicInputs: Field[];
  verificationKey?: Uint8Array;
}

export interface VerificationResult {
  valid: boolean;
  error?: string;
}

export interface CircuitArtifact {
  name: "ranking" | "settlement";
  circuitPath: string;
  vkPath?: string;
}

export interface RankingCircuitInput {
  first_mass: bigint;
  second_mass: bigint;
  third_mass: bigint;
}

export interface SettlementCircuitInput {
  total_pool: bigint;
  platform_fee: bigint;
  first: bigint;
  second: bigint;
  third: bigint;
}

export const CIRCUIT_ARTIFACTS: Record<"ranking" | "settlement", CircuitArtifact> = {
  ranking: {
    name: "ranking",
    circuitPath: "/circuits/ranking.json",
    vkPath: "/circuits/ranking.vk"
  },
  settlement: {
    name: "settlement",
    circuitPath: "/circuits/settlement.json",
    vkPath: "/circuits/settlement.vk"
  }
};
