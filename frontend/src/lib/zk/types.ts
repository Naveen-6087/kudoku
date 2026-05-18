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
  name: "ranking" | "settlement" | "rng_commitment" | "arena_schedule" | "elimination";
  circuitPath: string;
  vkPath?: string;
}

export interface RankingCircuitInput {
  match_id: bigint;
  player_count: bigint;
  first_mass: bigint;
  first_survived_ms: bigint;
  first_tiebreak_key: bigint;
  second_mass: bigint;
  second_survived_ms: bigint;
  second_tiebreak_key: bigint;
  third_mass: bigint;
  third_survived_ms: bigint;
  third_tiebreak_key: bigint;
}

export interface SettlementCircuitInput {
  match_id: bigint;
  total_pool: bigint;
  platform_fee: bigint;
  first_bps: bigint;
  second_bps: bigint;
  third_bps: bigint;
  first: bigint;
  second: bigint;
  third: bigint;
}

export interface RngCommitmentCircuitInput {
  match_id: bigint;
  player_count: bigint;
  initial_food_count: bigint;
  revealed_seed: bigint;
  seed_commitment?: bigint;
  food_commitment?: bigint;
}

export interface ArenaScheduleCircuitInput {
  match_id: bigint;
  duration_ms: bigint;
  elapsed_ms: bigint;
  initial_safe_radius: bigint;
  final_safe_radius: bigint;
  current_safe_radius: bigint;
  arena_damage_per_second: bigint;
}

export interface EliminationSlotInput {
  mass: bigint;
  survived_ms: bigint;
  tiebreak_key: bigint;
  alive: bigint;
  death_type: bigint;
}

export interface EliminationCircuitInput {
  match_id: bigint;
  player_count: bigint;
  duration_ms: bigint;
  initial_safe_radius: bigint;
  final_safe_radius: bigint;
  collision_radius: bigint;
  slots: EliminationSlotInput[];
  elimination_commitment?: bigint;
  config_commitment?: bigint;
}

export const CIRCUIT_ARTIFACTS: Record<
  "ranking" | "settlement" | "rng_commitment" | "arena_schedule" | "elimination",
  CircuitArtifact
> = {
  ranking: {
    name: "ranking",
    circuitPath: "/circuits/ranking.json",
    vkPath: "/circuits/ranking.vk"
  },
  settlement: {
    name: "settlement",
    circuitPath: "/circuits/settlement.json",
    vkPath: "/circuits/settlement.vk"
  },
  rng_commitment: {
    name: "rng_commitment",
    circuitPath: "/circuits/rng_commitment.json",
    vkPath: "/circuits/rng_commitment.vk"
  },
  arena_schedule: {
    name: "arena_schedule",
    circuitPath: "/circuits/arena_schedule.json",
    vkPath: "/circuits/arena_schedule.vk"
  },
  elimination: {
    name: "elimination",
    circuitPath: "/circuits/elimination.json",
    vkPath: "/circuits/elimination.vk"
  }
};
