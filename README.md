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

Set frontend env vars in `frontend/.env.local`.

`frontend/.env.local` is **gitignored** and should stay local-only. Do not commit API keys, app secrets, or private keys.

```bash
NEXT_PUBLIC_PRIVY_APP_ID=
NEXT_PUBLIC_PRIVY_CLIENT_ID=
NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
NEXT_PUBLIC_ESCROW_ADDRESS=0xdC78065ad6307d2F316DcE774E45c2388F9Fe556
NEXT_PUBLIC_KURIER_API_URL=https://api-testnet.kurier.xyz/api/v1
NEXT_PUBLIC_KURIER_API_KEY=
PRIVY_APP_SECRET=
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
- `rng_commitment.json`
- `arena_schedule.json`
- `elimination.json`

The browser proof pipeline mirrors the `zkv-uno` compatibility line:

- `@aztec/bb.js`: `0.84.0`
- `@noir-lang/noir_js`: `1.0.0-beta.6`
- `@noir-lang/acvm_js`: `1.0.0-beta.6`
- Kurier submissions use `proofOptions.variant = "Plain"`

See [circuits.md](./circuits.md) for the full circuit breakdown, metrics, and cost notes.

### Circuit summary

Metrics below come from:

```bash
wsl bash -lc "cd /mnt/c/Users/hemav/OneDrive/Desktop/kudoku/circuits && ~/.nargo/bin/nargo info --workspace"
```

| Circuit | Role | ACIR | Brillig | Browser JSON | Notes |
| --- | --- | ---: | ---: | ---: | --- |
| `rng_commitment` | Seed + food commitment reveal | 15 | 30 | 23.91 KiB | Smallest proving circuit |
| `arena_schedule` | Shrinking-zone schedule check | 44 | 17 | 3.75 KiB | Small |
| `settlement` | Payout arithmetic | 59 | 8 | 3.75 KiB | Small |
| `ranking` | Top-3 ordering | 75 | 8 | 4.79 KiB | Small |
| `elimination` | All-player elimination summary | 982 | 47 | 65.37 KiB | By far the heaviest circuit |

### Current Base Sepolia deployment

| Contract | Address |
| --- | --- |
| Escrow | `0xdC78065ad6307d2F316DcE774E45c2388F9Fe556` |
| Ranking verifier | `0xA85F102Ac56595B53a91d3D419F8e5C8B51A1537` |
| Settlement verifier | `0xF20acE448F740043232226065191Fff599418836` |
| RNG commitment verifier | `0x6d138f48d83f40C8A35d3FAA6d11e6193CFcbCeA` |
| Arena schedule verifier | `0x390414DeEf86B348aA63BcE4C5C882855177c671` |
| Elimination verifier | `0xa2F289D301819Acba53638a991610b07FD68a9f6` |

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
0xdC78065ad6307d2F316DcE774E45c2388F9Fe556
```

## WSL rule

All Foundry, Noir, Barretenberg, and proof-generation commands must run in WSL. Examples:

```bash
wsl forge build
wsl forge test
wsl bash -lc "~/.nargo/bin/nargo test"
wsl bash -lc "~/.nargo/bin/nargo compile --workspace"
```
