type NoirType = typeof import("@noir-lang/noir_js").Noir;
type UltraHonkBackendType = typeof import("@aztec/bb.js").UltraHonkBackend;
type CompiledCircuitType = import("@noir-lang/types").CompiledCircuit;
type InputMapType = import("@noir-lang/types").InputMap;

import {
  CIRCUIT_ARTIFACTS,
  type RankingCircuitInput,
  type SettlementCircuitInput,
  type VerificationResult,
  type ZKProof
} from "./types";

export type SupportedCircuitName = keyof typeof CIRCUIT_ARTIFACTS;

let Noir: NoirType | null = null;
let UltraHonkBackend: UltraHonkBackendType | null = null;
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

    const [noirModule, bbModule] = await Promise.all([
      import("@noir-lang/noir_js"),
      import("@aztec/bb.js")
    ]);

    Noir = noirModule.Noir as NoirType;
    UltraHonkBackend = bbModule.UltraHonkBackend as UltraHonkBackendType;
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
    first_mass: input.first_mass.toString(),
    second_mass: input.second_mass.toString(),
    third_mass: input.third_mass.toString()
  });
}

export async function generateSettlementProof(input: SettlementCircuitInput) {
  return generateProof("settlement", {
    total_pool: input.total_pool.toString(),
    platform_fee: input.platform_fee.toString(),
    first: input.first.toString(),
    second: input.second.toString(),
    third: input.third.toString()
  });
}

export function proofToHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
}

export function formatPublicInputsAsBytes32(publicInputs: ZKProof["publicInputs"]): `0x${string}`[] {
  return publicInputs.map((input) => {
    const stringValue = String(input);
    return stringValue.startsWith("0x")
      ? (stringValue.padEnd(66, "0") as `0x${string}`)
      : (`0x${BigInt(stringValue).toString(16).padStart(64, "0")}` as `0x${string}`);
  });
}
