type NoirType = typeof import("@noir-lang/noir_js").Noir;
type UltraHonkBackendType = typeof import("@aztec/bb.js").UltraHonkBackend;
type BarretenbergType = typeof import("@aztec/bb.js").Barretenberg;
type FrType = typeof import("@aztec/bb.js").Fr;
type CompiledCircuitType = import("@noir-lang/types").CompiledCircuit;
type InputMapType = import("@noir-lang/types").InputMap;

import {
  CIRCUIT_ARTIFACTS,
  type ArenaScheduleCircuitInput,
  type EliminationCircuitInput,
  type EliminationSlotInput,
  type RankingCircuitInput,
  type RngCommitmentCircuitInput,
  type SettlementCircuitInput,
  type VerificationResult,
  type ZKProof
} from "./types";

export type SupportedCircuitName = keyof typeof CIRCUIT_ARTIFACTS;

let Noir: NoirType | null = null;
let UltraHonkBackend: UltraHonkBackendType | null = null;
let Barretenberg: BarretenbergType | null = null;
let Fr: FrType | null = null;
let modulesLoaded = false;
let initializationPromise: Promise<void> | null = null;
let wasmInitialized = false;
let interceptorInstalled = false;
let operationQueue: Promise<unknown> = Promise.resolve();

interface CachedCircuit {
  compiled: CompiledCircuitType;
  noir: InstanceType<NoirType>;
  vk: Uint8Array | null;
}

const circuitCache = new Map<string, CachedCircuit>();

function serializeOperation<T>(fn: () => Promise<T>): Promise<T> {
  const result = operationQueue.then(fn, fn);
  operationQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function initializeWasm() {
  if (wasmInitialized) {
    return;
  }

  const [initAbi, initAcvm] = await Promise.all([
    import("@noir-lang/noirc_abi").then((module) => module.default),
    import("@noir-lang/acvm_js").then((module) => module.default)
  ]);

  await Promise.all([initAbi(), initAcvm()]);
  wasmInitialized = true;
}

function installCrsInterceptor() {
  if (interceptorInstalled || typeof window === "undefined") {
    return;
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      input instanceof URL
        ? input.toString()
        : input instanceof Request
          ? input.url
          : input;

    if (url.includes("crs.aztec.network")) {
      const parsed = new URL(url);
      return originalFetch(`/api/crs${parsed.pathname}${parsed.search}`, {
        ...init,
        mode: "same-origin"
      });
    }

    return originalFetch(input, init);
  };

  interceptorInstalled = true;
}

async function loadModules() {
  if (modulesLoaded) {
    return;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    if (typeof window === "undefined") {
      throw new Error("ZK modules can only be loaded in the browser.");
    }

    installCrsInterceptor();
    await initializeWasm();

    const [noirModule, bbModule] = await Promise.all([import("@noir-lang/noir_js"), import("@aztec/bb.js")]);

    Noir = noirModule.Noir as NoirType;
    UltraHonkBackend = bbModule.UltraHonkBackend as UltraHonkBackendType;
    Barretenberg = bbModule.Barretenberg as BarretenbergType;
    Fr = bbModule.Fr as FrType;
    modulesLoaded = true;
  })();

  return initializationPromise;
}

async function loadCircuit(circuitName: SupportedCircuitName) {
  await loadModules();
  if (!Noir) {
    throw new Error("Noir failed to load.");
  }

  const cached = circuitCache.get(circuitName);
  if (cached) {
    return cached;
  }

  const artifact = CIRCUIT_ARTIFACTS[circuitName];
  const compiledResponse = await fetch(artifact.circuitPath);
  if (!compiledResponse.ok) {
    throw new Error(`Missing circuit artifact at ${artifact.circuitPath}.`);
  }

  const compiled = (await compiledResponse.json()) as CompiledCircuitType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const noir = new (Noir as any)(compiled);
  let vk: Uint8Array | null = null;

  if (artifact.vkPath) {
    try {
      const vkResponse = await fetch(artifact.vkPath);
      if (vkResponse.ok) {
        vk = new Uint8Array(await vkResponse.arrayBuffer());
      }
    } catch {
      vk = null;
    }
  }

  const nextCircuit = { compiled, noir, vk };
  circuitCache.set(circuitName, nextCircuit);
  return nextCircuit;
}

async function generateProof(circuitName: SupportedCircuitName, inputs: InputMapType): Promise<ZKProof> {
  return serializeOperation(async () => {
    await loadModules();
    if (!UltraHonkBackend) {
      throw new Error("UltraHonk backend failed to load.");
    }

    const circuit = await loadCircuit(circuitName);
    const { witness } = await circuit.noir.execute(inputs);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backend = new (UltraHonkBackend as any)(circuit.compiled.bytecode, { threads: 1 });

    try {
      const proof = await backend.generateProof(witness, { keccak: true });
      const vk = circuit.vk ?? (await backend.getVerificationKey({ keccak: true }));
      circuit.vk = vk;

      return {
        proof: proof.proof,
        publicInputs: proof.publicInputs as string[],
        verificationKey: vk
      };
    } finally {
      try {
        backend.destroy?.();
      } catch {
        // Ignore WASM cleanup failures.
      }
    }
  });
}

export async function computePedersenHash(inputs: readonly bigint[]): Promise<bigint> {
  return serializeOperation(async () => {
    await loadModules();
    if (!Barretenberg || !Fr) {
      throw new Error("Barretenberg pedersen helpers failed to load.");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = await (Barretenberg as any).new({ threads: 1 });
    try {
      const frInputs = inputs.map((value) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new (Fr as any)(BigInt(value));
      });
      const hash = await api.pedersenHash(frInputs, 0);
      return BigInt(hash.toString());
    } finally {
      try {
        await api.destroy?.();
      } catch {
        // Ignore WASM cleanup failures.
      }
    }
  });
}

export async function verifyProofLocally(
  circuitName: SupportedCircuitName,
  proof: ZKProof
): Promise<VerificationResult> {
  return serializeOperation(async () => {
    await loadModules();
    if (!UltraHonkBackend) {
      return { valid: false, error: "UltraHonk backend failed to load." };
    }

    const circuit = await loadCircuit(circuitName);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backend = new (UltraHonkBackend as any)(circuit.compiled.bytecode, { threads: 1 });
    try {
      const valid = await backend.verifyProof(
        {
          proof: proof.proof,
          publicInputs: proof.publicInputs as string[]
        },
        { keccak: true }
      );

      return { valid };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Local verification failed."
      };
    } finally {
      try {
        backend.destroy?.();
      } catch {
        // Ignore WASM cleanup failures.
      }
    }
  });
}

export async function generateRankingProof(input: RankingCircuitInput) {
  return generateProof("ranking", {
    match_id: input.match_id.toString(),
    player_count: input.player_count.toString(),
    first_mass: input.first_mass.toString(),
    first_survived_ms: input.first_survived_ms.toString(),
    first_tiebreak_key: input.first_tiebreak_key.toString(),
    second_mass: input.second_mass.toString(),
    second_survived_ms: input.second_survived_ms.toString(),
    second_tiebreak_key: input.second_tiebreak_key.toString(),
    third_mass: input.third_mass.toString(),
    third_survived_ms: input.third_survived_ms.toString(),
    third_tiebreak_key: input.third_tiebreak_key.toString()
  });
}

export async function generateSettlementProof(input: SettlementCircuitInput) {
  return generateProof("settlement", {
    match_id: input.match_id.toString(),
    total_pool: input.total_pool.toString(),
    platform_fee: input.platform_fee.toString(),
    first_bps: input.first_bps.toString(),
    second_bps: input.second_bps.toString(),
    third_bps: input.third_bps.toString(),
    first: input.first.toString(),
    second: input.second.toString(),
    third: input.third.toString()
  });
}

export async function generateRngCommitmentProof(input: RngCommitmentCircuitInput) {
  const seedCommitment =
    input.seed_commitment ??
    (await computePedersenHash([input.revealed_seed, input.match_id, input.player_count]));
  const foodCommitment =
    input.food_commitment ??
    (await computePedersenHash([input.revealed_seed, input.initial_food_count, input.match_id]));

  return generateProof("rng_commitment", {
    match_id: input.match_id.toString(),
    player_count: input.player_count.toString(),
    initial_food_count: input.initial_food_count.toString(),
    seed_commitment: seedCommitment.toString(),
    food_commitment: foodCommitment.toString(),
    revealed_seed: input.revealed_seed.toString()
  });
}

export async function generateArenaScheduleProof(input: ArenaScheduleCircuitInput) {
  return generateProof("arena_schedule", {
    match_id: input.match_id.toString(),
    duration_ms: input.duration_ms.toString(),
    elapsed_ms: input.elapsed_ms.toString(),
    initial_safe_radius: input.initial_safe_radius.toString(),
    final_safe_radius: input.final_safe_radius.toString(),
    current_safe_radius: input.current_safe_radius.toString(),
    arena_damage_per_second: input.arena_damage_per_second.toString()
  });
}

function eliminationSlotHashInputs(input: EliminationSlotInput): bigint[] {
  return [input.mass, input.survived_ms, input.tiebreak_key, input.alive, input.death_type];
}

function eliminationSlotProofInputs(slotNumber: number, input: EliminationSlotInput): InputMapType {
  const prefix = `slot_${slotNumber}`;
  return {
    [`${prefix}_mass`]: input.mass.toString(),
    [`${prefix}_survived_ms`]: input.survived_ms.toString(),
    [`${prefix}_tiebreak_key`]: input.tiebreak_key.toString(),
    [`${prefix}_alive`]: input.alive.toString(),
    [`${prefix}_death_type`]: input.death_type.toString()
  };
}

export async function generateEliminationProof(input: EliminationCircuitInput) {
  const slots = input.slots.slice(0, 12);
  while (slots.length < 12) {
    slots.push({
      mass: 0n,
      survived_ms: 0n,
      tiebreak_key: 0n,
      alive: 0n,
      death_type: 0n
    });
  }

  const slotHashes = await Promise.all(slots.map((slot) => computePedersenHash(eliminationSlotHashInputs(slot))));
  const eliminationCommitment =
    input.elimination_commitment ??
    (await computePedersenHash([
      input.match_id,
      input.player_count,
      ...slotHashes
    ]));
  const configCommitment =
    input.config_commitment ??
    (await computePedersenHash([
      input.duration_ms,
      input.initial_safe_radius,
      input.final_safe_radius,
      input.collision_radius
    ]));

  const slotInputs = slots.reduce<InputMapType>((result, slot, index) => {
    return {
      ...result,
      ...eliminationSlotProofInputs(index + 1, slot)
    };
  }, {});

  return generateProof("elimination", {
    match_id: input.match_id.toString(),
    player_count: input.player_count.toString(),
    elimination_commitment: eliminationCommitment.toString(),
    config_commitment: configCommitment.toString(),
    duration_ms: input.duration_ms.toString(),
    initial_safe_radius: input.initial_safe_radius.toString(),
    final_safe_radius: input.final_safe_radius.toString(),
    collision_radius: input.collision_radius.toString(),
    ...slotInputs
  });
}

export function proofToHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
}

export function normalizeFieldAsBytes32(input: ZKProof["publicInputs"][number]): `0x${string}` {
  const stringValue = String(input);
  if (stringValue.startsWith("0x")) {
    const hex = stringValue.slice(2);
    return `0x${hex.padStart(64, "0")}` as `0x${string}`;
  }

  return `0x${BigInt(stringValue).toString(16).padStart(64, "0")}` as `0x${string}`;
}

export function formatPublicInputsAsBytes32(publicInputs: ZKProof["publicInputs"]): `0x${string}`[] {
  return publicInputs.map((input) => normalizeFieldAsBytes32(input));
}
