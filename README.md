# Kudoku

Kudoku is a real-money snake battle royale inspired by Slither.io. The active app layout now mirrors the local `zkv-uno` reference more closely: a standalone `frontend/` Next.js app, a standalone `backend/` Node server, plus kept-in-place `contracts/` and `circuits/`.

## Stack

| Layer | Stack |
| --- | --- |
| Frontend | Next.js 14, React 18, Privy, React Query, Viem |
| Backend | Node.js, TypeScript, Colyseus room server |
| Contracts | Foundry, Solidity, Base Sepolia |
| ZK | Noir `1.0.0-beta.6`, bb.js `0.84.0`, UltraHonk, zkVerify/Kurier |

## Project Structure

```txt
frontend          standalone Next.js app
backend           standalone room / metadata server
contracts         Foundry escrow and settlement contracts
circuits          Noir workspace and compiled ACIR artifacts
docs              architecture, product, and agent rules
```

## Commands

Run from the repo root:

```bash
npm run dev
npm run dev:backend
npm run build
npm run test
npm run typecheck
npm run lint
```

## Frontend env

Set frontend env vars in `frontend/.env.local`:

```bash
NEXT_PUBLIC_PRIVY_APP_ID=
NEXT_PUBLIC_PRIVY_CLIENT_ID=
NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
NEXT_PUBLIC_ESCROW_ADDRESS=0x8a4a6ac17F90E9b603Eb97732A8807585ea9A9a1
NEXT_PUBLIC_KURIER_API_URL=https://api-testnet.kurier.xyz/api/v1
NEXT_PUBLIC_KURIER_API_KEY=
```

Privy setup notes:

- enable Google, GitHub, Discord, email, and wallet login methods
- enable Ethereum embedded wallets for users without wallets
- keep Base Sepolia as the paid-flow chain

## Current frontend flow

1. `/` stays minimal: title, practice, and paid flow.
2. `/play` handles Privy login, Base Sepolia switching, buy-in selection, and room sizing.
3. `/room` opens the local arena shell with stake context plus ranking/settlement proof controls and zkVerify status tracking.
4. `/practice` opens the same arena without wallet or stake requirements.

## ZK flow

The frontend ships the current Noir artifacts directly under `frontend/public/circuits`:

- `ranking.json`
- `settlement.json`

The browser proof pipeline mirrors the `zkv-uno` compatibility line:

- `@aztec/bb.js`: `0.84.0`
- `@noir-lang/noir_js`: `1.0.0-beta.6`
- `@noir-lang/acvm_js`: `1.0.0-beta.6`
- Kurier submissions use `proofOptions.variant = "Plain"`

## Backend container

Build and run the backend container locally:

```bash
docker build -f backend/Dockerfile -t kudoku-server .
docker run --rm -p 2567:2567 -e HOST=0.0.0.0 -e PORT=2567 kudoku-server
```

Or use Compose:

```bash
docker compose -f compose.server.yaml up --build
```

## Base Sepolia escrow deployment

Deploy `KudokuEscrow` with Foundry in WSL:

```bash
wsl bash -lc "cd /mnt/c/Users/hemav/OneDrive/Desktop/kudoku/contracts && BASE_SEPOLIA_RPC_URL=... PRIVATE_KEY=... bash scripts/deploy_escrow_base_sepolia.sh"
```

The current deployed escrow address is:

```txt
0x8a4a6ac17F90E9b603Eb97732A8807585ea9A9a1
```

## WSL rule

All Foundry, Noir, Barretenberg, and proof-generation commands must run in WSL. Examples:

```bash
wsl forge build
wsl forge test
wsl bash -lc "~/.nargo/bin/nargo test"
wsl bash -lc "~/.nargo/bin/nargo compile --workspace"
```
