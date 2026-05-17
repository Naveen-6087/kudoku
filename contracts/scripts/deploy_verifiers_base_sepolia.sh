#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
FORGE_BIN="${FORGE_BIN:-$HOME/.foundry/bin/forge}"
DEPLOYMENTS_DIR="${CONTRACTS_DIR}/deployments"

if [[ ! -x "${FORGE_BIN}" ]]; then
  echo "forge not found at ${FORGE_BIN}" >&2
  exit 1
fi

: "${BASE_SEPOLIA_RPC_URL:?BASE_SEPOLIA_RPC_URL is required}"
: "${PRIVATE_KEY:?PRIVATE_KEY is required}"

cd "${CONTRACTS_DIR}"
mkdir -p "${DEPLOYMENTS_DIR}"

deploy_verifier() {
  local source_file="$1"
  local label="$2"
  local log_file="${DEPLOYMENTS_DIR}/base-sepolia-${label}.log"
  local output

  echo "Deploying ${label}..."
  if ! output="$("${FORGE_BIN}" create \
    --broadcast \
    --rpc-url "${BASE_SEPOLIA_RPC_URL}" \
    --private-key "${PRIVATE_KEY}" \
    "${source_file}:HonkVerifier" 2>&1)"; then
    printf '%s\n' "${output}" >&2
    exit 1
  fi

  printf '%s\n' "${output}" > "${log_file}"
  python3 - <<PY
import json, re
from pathlib import Path

text = Path(r"${log_file}").read_text(encoding="utf-8")
address_match = re.search(r"Deployed to:\s*(0x[a-fA-F0-9]{40})", text)
tx_match = re.search(r"Transaction hash:\s*(0x[a-fA-F0-9]{64})", text)
if not address_match or not tx_match:
    raise SystemExit("Failed to parse forge output for ${label}")
payload = {
    "name": "${label}",
    "address": address_match.group(1),
    "transactionHash": tx_match.group(1),
}
Path(r"${DEPLOYMENTS_DIR}") .joinpath("base-sepolia-${label}.json").write_text(
    json.dumps(payload, indent=2) + "\n",
    encoding="utf-8",
)
print(payload["address"])
PY
}

RANKING_ADDRESS="$(deploy_verifier "src/verifiers/RankingVerifier.sol" "ranking-verifier" | tail -n 1)"
SETTLEMENT_ADDRESS="$(deploy_verifier "src/verifiers/SettlementVerifier.sol" "settlement-verifier" | tail -n 1)"

python3 - <<PY
import json
from pathlib import Path

payload = {
    "chainId": 84532,
    "rankingVerifier": "${RANKING_ADDRESS}",
    "settlementVerifier": "${SETTLEMENT_ADDRESS}",
}
Path(r"${DEPLOYMENTS_DIR}").joinpath("base-sepolia-kudoku-verifiers.json").write_text(
    json.dumps(payload, indent=2) + "\n",
    encoding="utf-8",
)
PY

echo "Ranking verifier: ${RANKING_ADDRESS}"
echo "Settlement verifier: ${SETTLEMENT_ADDRESS}"
echo "Set RANKING_VERIFIER_ADDRESS=${RANKING_ADDRESS}"
echo "Set SETTLEMENT_VERIFIER_ADDRESS=${SETTLEMENT_ADDRESS}"
