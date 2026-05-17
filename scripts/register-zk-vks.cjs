const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const envPath = path.join(repoRoot, "frontend", ".env.local");
const hexDir = path.join(repoRoot, "circuits", "target", "hex");
const vkHashesPath = path.join(repoRoot, "frontend", "src", "lib", "zk", "vkHashes.json");
const circuits = ["ranking", "settlement"];

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const env = {
    ...readEnvFile(envPath),
    ...process.env
  };

  const apiKey = env.KURIER_API_KEY || env.NEXT_PUBLIC_KURIER_API_KEY;
  const apiBase = env.KURIER_API_URL || env.NEXT_PUBLIC_KURIER_API_URL || "https://api-testnet.kurier.xyz/api/v1";

  if (!apiKey) {
    throw new Error("KURIER_API_KEY or NEXT_PUBLIC_KURIER_API_KEY is required to register VKs.");
  }

  const hashes = {};

  for (const circuitName of circuits) {
    const hexPath = path.join(hexDir, `${circuitName}_vk.hex`);
    if (!fs.existsSync(hexPath)) {
      throw new Error(`Missing ${hexPath}. Run npm run zk:build first.`);
    }

    const vk = fs.readFileSync(hexPath, "utf8").trim();
    const response = await fetch(`${apiBase}/register-vk/${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proofType: "ultrahonk",
        vk,
        proofOptions: {
          variant: "Plain",
          version: "V0_84"
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.error || `VK registration failed for ${circuitName}.`);
    }

    hashes[circuitName] = data.vkHash || "";
    console.log(`Registered ${circuitName} VK.`);
  }

  fs.writeFileSync(vkHashesPath, `${JSON.stringify(hashes, null, 2)}\n`);
  console.log("vkHashes.json updated.");
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
        return [key, value];
      })
  );
}
