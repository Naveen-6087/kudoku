# TODO

## Completed

- Read project docs, game specification, agent rules, and `zkv-uno` compatibility reference.
- Created initial monorepo scaffold for web, server, shared game logic, contracts, and circuits.
- Implemented deterministic TypeScript game-core scaffold with unit tests.
- Added a local Phaser practice scene and Colyseus room scaffold.
- Added Foundry escrow scaffold and passing Solidity tests.
- Aligned the web workspace to the `zkv-uno`-compatible Next.js 14 / React 18 baseline and restored a working lint command.
- Replaced the Colyseus plain-object room scaffold with schema-backed lobby, countdown, authoritative sync, and reconnection handling.
- Wired the web client to the authoritative Colyseus room with live state sync, input streaming, roster display, and offline practice fallback.
- Expanded `KudokuEscrow` lifecycle coverage with passing WSL Foundry tests for join/lock, cancel refunds, and settlement payouts.
- Added Base Sepolia wallet + escrow helpers and a web escrow panel for contract address configuration, wallet connect, match creation, joining, loading, and cancellation.
- Deployed `KudokuEscrow` to Base Sepolia at `0x8a4a6ac17F90E9b603Eb97732A8807585ea9A9a1`, recorded the deployment under `contracts/deployments`, and wired the local web app to that address.
- Stabilized the web client against empty Colyseus schema snapshots and refreshed the Next workspace install so the dev server no longer throws the prior runtime crash / lockfile patch warning.
- Added a container-ready authoritative server runtime with `HOST` / `PORT` env binding, a `/healthz` endpoint, `backend/Dockerfile`, and `compose.server.yaml` for Phala deployment prep.
- Added Phala deployment wiring with a dedicated Cloud compose template, optional `dstack-ingress` override, and server metadata/public-endpoint reporting for CVM networking.
- Repaired the WSL Noir toolchain with `noirup -v 1.0.0-beta.6`, reran `nargo test`, and rebuilt the `ranking` / `settlement` circuit artifacts.
- Replaced the old `apps/` + `packages/` workspace with standalone `frontend/` and `backend/` folders, refreshed lockfiles, and retired the stale workspace directories.
- Wired the new frontend to Privy, Base Sepolia room setup, copied Noir artifacts, initial browser proof generation, and zkVerify/Kurier submission scaffolding.
- Fixed the cutover validation blockers by restoring frontend ESLint config, removing stray self-dependencies, re-adding the Privy Farcaster stub, and switching the bb.js patch loader back to CommonJS for Next.js builds.
- Added persistent player identity, snake skins, HUD polish, and richer arena run summaries across the home, play, practice, and room flows.
- Upgraded the room proof panel with artifact visibility, local verification reporting, and zkVerify/Kurier job tracking.
- Deployed live Base Sepolia ranking and settlement verifiers, redeployed `KudokuEscrow` against them, and updated local env files with the new verifier + escrow addresses.
- Reworked the in-game HUD to a slither-style layout with subtle leaderboard text at the top-right, compact player stats at the bottom-left, and a non-blocking proof drawer in the bottom-right.
- Replaced the old paid-room preview with a slimmer `zkv-uno`-style paid lobby that uses public-room browsing, private join-by-code, and creator-owned room lists instead of invite links.
- Wired the settlement proof flow to the real escrow `settleMatch` transaction so a finished stake match can now submit the verified payout bundle on-chain from the frontend.
- Rebuilt `KudokuEscrow` around explicit public/private lobbies with room hashes, creator-started matches, safe not-found handling, room-code lookup for private joins, and index queries for public rooms + wallet-owned rooms.
- Reworked `/play` into a more compact `zkv-uno`-style room dashboard with an auto-generated 6-character private code modal, public room list, private join-by-code flow, and a "your games" section with delete/cancel controls.
- Updated `/room` to use the new lobby lifecycle (`Lobby -> Ready -> InProgress`) with creator start controls, private code entry/display, and wallet-signed on-chain verifier actions in the proof drawer.
- Redeployed `KudokuEscrow` to Base Sepolia at `0xc26ac6ae99f4bf028A440076CBd8560139b1d6A6` and updated the local frontend env to the new address.
- Reworked the paid room flow so public/private join actions now execute the real on-chain stake transaction from the lobby, and "your games" pulls wallet-participated matches instead of creator-only rooms.
- Upgraded `KudokuEscrow` to supported room sizes `3/4/6/12`, added the full-room ready timestamp/countdown gate, and allowed any joined player to start after the short ready window.
- Replaced the started paid-room local simulation with backend-authoritative Colyseus sync keyed by on-chain `matchId`, including roster syncing, countdown-based auto-start, and live authoritative input streaming from the frontend.
- Synced the backend snake game-core with the current frontend boost mechanics and wired the frontend room client to the real backend port (`NEXT_PUBLIC_GAME_SERVER_URL=http://localhost:2567`).
- Repaired the zkVerify/Kurier runtime by pinning the UltraHonk proof version, re-registering VK payloads with the same proof options, auto-expanding the post-game ZK drawer, and surfacing the exact payout split plus settlement transaction link in the live room UI.
- Fixed the ranking-proof regression without changing Noir artifacts: final standings and the room UI now rank by mass/survival time consistently, the authoritative backend again ignores self-collisions as intended, and the settlement panel shows the full clickable BaseScan transaction URL.

## In Progress

- Expanding the Noir proof surface beyond ranking / settlement into fuller replay and match-validation circuits.

## Pending

- Expand the Noir circuits beyond ranking / settlement into RNG, arena, and replay validation.
- Add verification-key registration flow and proof-history persistence on top of the new zkVerify status UI.
- Add deterministic replay and dispute/audit tooling.
