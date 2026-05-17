#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
FORGE_BIN="${FORGE_BIN:-$HOME/.foundry/bin/forge}"
CAST_BIN="${CAST_BIN:-$HOME/.foundry/bin/cast}"
DEPLOYMENTS_DIR="${CONTRACTS_DIR}/deployments"

if [[ ! -x "${FORGE_BIN}" ]]; then
  echo "forge not found at ${FORGE_BIN}" >&2
  exit 1
fi

if [[ ! -x "${CAST_BIN}" ]]; then
  echo "cast not found at ${CAST_BIN}" >&2
  exit 1
fi

: "${BASE_SEPOLIA_RPC_URL:?BASE_SEPOLIA_RPC_URL is required}"
: "${PRIVATE_KEY:?PRIVATE_KEY is required}"
: "${RANKING_VERIFIER_ADDRESS:?RANKING_VERIFIER_ADDRESS is required}"
: "${SETTLEMENT_VERIFIER_ADDRESS:?SETTLEMENT_VERIFIER_ADDRESS is required}"

DEPLOYER_ADDRESS="$("${CAST_BIN}" wallet address --private-key "${PRIVATE_KEY}")"
FEE_RECIPIENT="${FEE_RECIPIENT:-${DEPLOYER_ADDRESS}}"

echo "Deploying KudokuEscrow to Base Sepolia"
echo "Deployer: ${DEPLOYER_ADDRESS}"
echo "Fee recipient: ${FEE_RECIPIENT}"
echo "Ranking verifier: ${RANKING_VERIFIER_ADDRESS}"
echo "Settlement verifier: ${SETTLEMENT_VERIFIER_ADDRESS}"

cd "${CONTRACTS_DIR}"

if ! DEPLOY_OUTPUT="$("${FORGE_BIN}" create \
  --broadcast \
  --rpc-url "${BASE_SEPOLIA_RPC_URL}" \
  --private-key "${PRIVATE_KEY}" \
  src/KudokuEscrow.sol:KudokuEscrow \
  --constructor-args "${FEE_RECIPIENT}" "${RANKING_VERIFIER_ADDRESS}" "${SETTLEMENT_VERIFIER_ADDRESS}" 2>&1)"; then
  printf '%s\n' "${DEPLOY_OUTPUT}" >&2
  exit 1
fi

mkdir -p "${DEPLOYMENTS_DIR}"
printf '%s\n' "${DEPLOY_OUTPUT}" > "${DEPLOYMENTS_DIR}/base-sepolia-kudoku-escrow.log"

DEPLOYED_TO="$(python3 -c 'import re,sys; match = re.search(r"Deployed to:\s*(0x[a-fA-F0-9]{40})", sys.stdin.read()); print(match.group(1) if match else "")' <<< "${DEPLOY_OUTPUT}")"
TX_HASH="$(python3 -c 'import re,sys; match = re.search(r"Transaction hash:\s*(0x[a-fA-F0-9]{64})", sys.stdin.read()); print(match.group(1) if match else "")' <<< "${DEPLOY_OUTPUT}")"

if [[ -z "${DEPLOYED_TO}" || -z "${TX_HASH}" ]]; then
  printf '%s\n' "${DEPLOY_OUTPUT}" >&2
  echo "Failed to parse deployment output." >&2
  exit 1
fi

python3 - <<PY
import json
from pathlib import Path

output_path = Path(r"${DEPLOYMENTS_DIR}") / "base-sepolia-kudoku-escrow.json"
payload = {
    "chainId": 84532,
    "deployer": "${DEPLOYER_ADDRESS}",
    "feeRecipient": "${FEE_RECIPIENT}",
    "rankingVerifier": "${RANKING_VERIFIER_ADDRESS}",
    "settlementVerifier": "${SETTLEMENT_VERIFIER_ADDRESS}",
    "escrowAddress": "${DEPLOYED_TO}",
    "transactionHash": "${TX_HASH}",
}
output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY

echo "Contract deployed to: ${DEPLOYED_TO}"
echo "Transaction hash: ${TX_HASH}"
echo "Set NEXT_PUBLIC_ESCROW_ADDRESS=${DEPLOYED_TO}"
