const { spawn } = require("node:child_process");
const { existsSync, rmSync } = require("node:fs");
const { resolve } = require("node:path");

const nextBin = resolve(__dirname, "..", "node_modules", "next", "dist", "bin", "next");
const devDistDir = resolve(__dirname, "..", ".next-dev");

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function cleanDevArtifacts() {
  if (!existsSync(devDistDir)) {
    return;
  }

  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(devDistDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
      return;
    } catch (error) {
      lastError = error;
      sleep(150);
    }
  }

  if (lastError) {
    console.error(`Failed to remove ${devDistDir}. Stop any existing frontend dev server and try again.`);
    throw lastError;
  }
}

cleanDevArtifacts();

const child = spawn(process.execPath, [nextBin, "dev"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "development",
    KUDOKU_DEV_BUILD: "1"
  }
});

function forward(signal) {
  if (!child.killed) {
    child.kill(signal);
  }
}

process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
