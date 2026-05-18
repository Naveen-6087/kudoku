const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const circuitsDir = path.join(repoRoot, "circuits");
const targetDir = path.join(circuitsDir, "target");
const hexDir = path.join(targetDir, "hex");
const frontendCircuitsDir = path.join(repoRoot, "frontend", "public", "circuits");
const verifierDir = path.join(repoRoot, "contracts", "src", "verifiers");
const vkHashesPath = path.join(repoRoot, "frontend", "src", "lib", "zk", "vkHashes.json");

const circuits = [
  { name: "ranking", verifierName: "RankingVerifier" },
  { name: "settlement", verifierName: "SettlementVerifier" },
  { name: "rng_commitment", verifierName: "RngCommitmentVerifier" },
  { name: "arena_schedule", verifierName: "ArenaScheduleVerifier" },
  { name: "elimination", verifierName: "EliminationVerifier" }
];

main();

function main() {
  ensureDir(hexDir);
  ensureDir(frontendCircuitsDir);
  ensureDir(verifierDir);
  removeStaleArtifacts();

  runWsl(`cd '${toWslPath(circuitsDir)}' && ~/.nargo/bin/nargo compile --workspace`);

  for (const circuit of circuits) {
    buildCircuitArtifacts(circuit);
  }

  ensureVkHashShape();
  console.log("ZK artifacts generated and synced.");
}

function removeStaleArtifacts() {
  const stalePaths = [
    path.join(targetDir, "gameplay_v1.json"),
    path.join(targetDir, "gameplay_v1.vk"),
    path.join(hexDir, "gameplay_v1_vk.hex"),
    path.join(frontendCircuitsDir, "gameplay_v1.json"),
    path.join(frontendCircuitsDir, "gameplay_v1.vk"),
    path.join(verifierDir, "GameplayV1Verifier.sol")
  ];

  for (const stalePath of stalePaths) {
    fs.rmSync(stalePath, { force: true, recursive: true });
  }
}

function buildCircuitArtifacts(circuit) {
  const bytecodePath = path.join(targetDir, `${circuit.name}.json`);
  const vkPath = path.join(targetDir, `${circuit.name}.vk`);
  const vkOutputDir = path.join(targetDir, `${circuit.name}_vk`);
  const verifierPath = path.join(verifierDir, `${circuit.verifierName}.sol`);

  fs.rmSync(vkOutputDir, { recursive: true, force: true });

  runWsl(
    [
      `cd '${toWslPath(circuitsDir)}'`,
      `mkdir -p './target/${circuit.name}_vk'`,
      `~/.bb/bb write_vk -s ultra_honk --oracle_hash keccak --verifier_type standalone -b './target/${circuit.name}.json' -o './target/${circuit.name}_vk'`
    ].join(" && ")
  );

  fs.copyFileSync(path.join(vkOutputDir, "vk"), vkPath);

  runWsl(
    [
      `cd '${toWslPath(circuitsDir)}'`,
      `~/.bb/bb write_solidity_verifier -s ultra_honk -k './target/${circuit.name}.vk' -o '${toWslPath(verifierPath)}'`
    ].join(" && ")
  );

  const vkBytes = fs.readFileSync(vkPath);
  const vkHex = `0x${vkBytes.toString("hex")}`;

  fs.writeFileSync(path.join(hexDir, `${circuit.name}_vk.hex`), `${vkHex}\n`);
  fs.copyFileSync(bytecodePath, path.join(frontendCircuitsDir, `${circuit.name}.json`));
  fs.copyFileSync(vkPath, path.join(frontendCircuitsDir, `${circuit.name}.vk`));
  fs.rmSync(vkOutputDir, { recursive: true, force: true });
}

function ensureVkHashShape() {
  const current = fs.existsSync(vkHashesPath)
    ? JSON.parse(fs.readFileSync(vkHashesPath, "utf8"))
    : {};

  const next = {
    ranking: typeof current.ranking === "string" ? current.ranking : "",
    settlement: typeof current.settlement === "string" ? current.settlement : "",
    rng_commitment: typeof current.rng_commitment === "string" ? current.rng_commitment : "",
    arena_schedule: typeof current.arena_schedule === "string" ? current.arena_schedule : "",
    elimination: typeof current.elimination === "string" ? current.elimination : ""
  };

  fs.writeFileSync(vkHashesPath, `${JSON.stringify(next, null, 2)}\n`);
}

function runWsl(command) {
  execFileSync("wsl", ["bash", "-lc", command], {
    cwd: repoRoot,
    stdio: "inherit"
  });
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function toWslPath(windowsPath) {
  const normalized = path.resolve(windowsPath).replace(/\\/g, "/");
  return normalized.replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`);
}
