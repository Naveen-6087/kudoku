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
- Fixed the ranking-proof regression without changing Noir artifacts: final standings and the room UI now rank by mass/survival time consistently, and the authoritative backend again ignores self-collisions as intended.
- Added the next slither-style paid-room polish pass: joined players can now pick and sync snake colors into the live room, the in-game settlement link is reduced to a compact explorer icon, paid lobby surfaces now use the crimson/gold theme, and nearby food has slight magnetic pull in both practice and authoritative play.
- Reworked the active match presentation toward the `slither.io-clone` reference without copying its source/assets: the default deterministic world is now a larger long-form field, movement/boost tuning is closer to slither-style pacing, and the live/practice canvas now renders a darker tiled arena, brighter pellets, smoother snake bodies, and flatter slither-style HUD overlays while keeping the existing contract/ZK flow intact.
- Added dynamic room-size gameplay tuning across `3/4/6/12` player modes: smaller rooms now use smaller arenas with faster closing circles, live room sync patches faster for smoother motion, snakes start with no boost reserve until they collect food, boost ramps up gradually based on collected food, speeding snakes get a stronger neon body glow, and food now renders as multicolor circles with much stronger magnetic pull near the head.
- Refined the homepage much closer to the `landing.png` direction: the background is now pure black, `landing.png` is no longer rendered directly, the snake hero art is larger and more asymmetric, the headline is reduced to `SURVIVE. OUTGROW. WIN BIG` with the final line in bright gold, and the CTA/buttons/cards use brighter yellow treatment with less explanatory copy.
- Applied the `ui1.md` brand pass across the live site surfaces: the real `favicon.png` metadata is wired in, the landing page now uses `logo-text.png`, the global palette/buttons were shifted to the molten-gold/obsidian system, and `/play` now uses a livelier two-column pre-match lobby with an arena preview plus richer create-room cards.
- Applied the `ui2.md` refinement pass without changing the overall direction: the homepage hero is tighter with the logo integrated directly into the composition, the inert `Live arena` pill is gone, the snake art now enters from the top edge more cinematically, the favicon now renders through a square `/icon` pipeline derived from `favicon.png`, `/play` uses the real `arena.png` preview image, and the create-game modal is back to a compact fast-setup layout.
- Applied the `ui3.md` cleanup pass: the hero snake now sits slightly lower while keeping the top-entry cinematic crop, the stray homepage class was removed, and the favicon pipeline was replaced with properly cropped `16x16` / `32x32` / `48x48` / `180x180` assets generated from `frontend/public/favicon.png` so the tab icon reads clearly.
- Fixed the follow-up runtime issues around the new paid-lobby pass: `/favicon.ico` now resolves from `frontend/src/app/favicon.ico` instead of conflicting with a duplicate `public` file, `/play` room refreshes now batch match reads with viem multicall and poll less aggressively/only while visible to avoid Base Sepolia rate limits, and Privy no longer boots embedded/Coinbase-specific wallet flows that were producing the extra console noise.
- Removed the active Phala/dstack deployment wiring after dropping the TEE approach: deleted the dedicated Phala compose files, simplified the backend server metadata/url handling back to generic public URLs only, and cleaned the top-level docs/package copy to stop advertising Phala-specific deployment.
- Expanded the summary ZK stack for the next milestone: `ranking` and `settlement` now bind to richer match-context public inputs, new `rng_commitment` and `arena_schedule` circuits are part of the Noir workspace/build pipeline, the proof drawer can generate and track all four summary proofs, and the escrow contract/tests now validate the upgraded ranking/settlement public-input bundles.
- Replaced the rejected top-3 gameplay snapshot prototype with a universal `elimination` circuit that summarizes deaths, kills, boundary exits, and final ordering across up to 12 snakes, rebuilt all Noir artifacts/verifiers, registered the new VK set, redeployed the Base Sepolia verifier stack plus escrow, and rewired the frontend env to the new addresses.
- Fixed the current proof regressions by widening settlement arithmetic to avoid wei overflow, wiring live-room seed/player-count data back into the proof drawer, aligning gameplay tie-break ordering with the ZK payload order, refreshing the generated circuit artifacts/VKs/verifiers, re-registering VK hashes, and cleaning the stale `gameplay_v1` generated outputs.
- Redeployed the refreshed Base Sepolia verifier stack and escrow for the proof-regression fix, updated the deployment records, and rewired `frontend/.env.local` to the new verifier + escrow addresses.
- Fixed the elimination proof constraint mismatch by correcting boundary-death witness encoding, preventing late-match safe-radius inference from overriding recorded collision deaths, relaxing the elimination circuit to ignore irrelevant boundary threat distance, stress-testing the witness path across simulated matches, regenerating artifacts/VKs/verifiers, re-registering VKs, and redeploying the full Base Sepolia stack again.
- Fixed the remaining elimination verification/submission path issue on the frontend: on-chain verifier calls and zkVerify submissions now normalize public inputs as left-padded `bytes32`, verifier revert selectors are decoded into readable errors, and the RNG / arena schedule cards now expose the on-chain verification action in stake rooms.
- Replaced the brittle geometry-heavy elimination proof with a universal summary-based elimination circuit across up to 12 snakes, regenerated artifacts/VKs/verifiers, re-registered the new elimination VK, redeployed the full Base Sepolia verifier stack plus escrow, and rewired `frontend/.env.local` to the latest live addresses.

## In Progress

- Add verification-key registration flow and proof-history persistence on top of the new zkVerify status UI.

## Pending

- Add deterministic replay and dispute/audit tooling.
