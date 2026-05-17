# ZK Snake Battle Royale — Master Game & Architecture Specification
# The game is called kudoku
## Purpose

This document defines the complete product, gameplay, trust model, architecture, cryptographic assumptions, multiplayer systems, TEE integration, settlement flow, and implementation roadmap for a real-money multiplayer snake battle royale game.

This specification is designed for:

- advanced AI coding agents
- engineers
- hackathon teams
- production system planning

The objective is to provide a complete implementation blueprint while still allowing architectural flexibility.

This document prioritizes:

1. Fun gameplay
2. Fairness
3. Anti-cheat
4. Real-money trust minimization
5. Scalability
6. Maintainability
7. Practical implementation

---

# Game Vision

Build a competitive multiplayer snake battle royale inspired by Slither.io with:

- real-money buy-ins
- shrinking arena
- deterministic fair RNG
- TEE-protected authoritative game logic
- cryptographic settlement verification
- on-chain payouts

Core philosophy:

Players should trust the game without needing to trust the operator.

The game should feel:

- skill-based
- fair
- replayable
- competitive
- fast-paced
- spectator-friendly

The trust guarantees should feel invisible.

---

# High-Level Concept

Players enter a snake arena.

Each player stakes money.

Players:

- eat food
- grow larger
- outmaneuver opponents
- eliminate snakes
- consume dropped mass
- survive shrinking arena pressure

The game ends when:

1. only one snake remains
OR
2. match timer ends

Winning players receive prize distribution.

---

# Core Gameplay Rules

## Snake Mechanics

The game uses:

**Pure Slither.io mechanics**.

No experimental combat system should be introduced in MVP.

### Collision Logic

Classic snake collision only.

If a snake head touches:

- another snake body
- arena death condition

That snake dies.

Skill expression must come from:

- positioning
- cutting off opponents
- baiting movement
- movement precision
- risk management

Not stat advantages.

Smaller snakes must always retain the ability to outplay larger snakes.

This preserves competitiveness.

---

## Snake Growth

Snakes grow by:

1. eating food
2. consuming dropped mass from dead snakes

Dead snakes convert into collectible food.

This creates:

- comeback mechanics
- risk/reward combat
- momentum swings
- hot zones after eliminations

---

## Arena Design

Arena type:

**Open arena with shrinking boundary.**

No walls.

No obstacles in MVP.

The shrinking circle exists to:

- prevent passive farming
- force encounters
- avoid infinite matches
- create tension

Recommended logic:

Players outside safe radius receive damage over time.

Damage should scale gradually.

The shrinking circle must always guarantee:

Increasing player interaction.

---

# Match Configuration

The player creating a room may configure:

## Match Duration

Allowed range:

```txt
1 minute → 5 minutes
```

Recommended defaults:

```txt
3 minutes
5 minutes
```

Hard maximum:

```txt
5 minutes
```

Reason:

Matches should remain:

- fast
- replayable
- engaging
- suitable for betting

---

## Match Size

Players may choose:

```txt
4
8
16
24
```

Maximum:

```txt
24 players
```

Custom room range:

```txt
3 → 24 players
```

No bots in MVP.

Reason:

Poor bots reduce competitiveness.

Bot development introduces unnecessary complexity.

Priority should remain:

Real PvP gameplay.

---

# Match End Conditions

## Condition 1 — Last Snake Standing

If only one snake survives:

Match ends immediately.

Winner placement determined by:

Remaining survivors.

---

## Condition 2 — Timer Expiry

If timer reaches zero:

Leaderboard determined by:

**Snake mass/size.**

Placement:

```txt
1st = largest snake
2nd = second largest
3rd = third largest
```

This prevents:

- hiding
- griefing
- passive gameplay

Encourages:

Aggressive play.

---

# Betting System

## Public Stakes

All stakes are public.

Transparency is preferred for MVP.

Reason:

- simpler UX
- easier matchmaking
- easier settlement

---

## Buy-In Rules

Players may choose buy-in amount.

Constraint:

Must remain within:

```txt
minimum threshold
maximum threshold
```

Example:

```txt
0.001 ETH → 0.05 ETH
```

Final thresholds should be configurable.

---

## Matchmaking Recommendation

Strong recommendation:

Use buy-in brackets.

Example:

```txt
0.001 ETH
0.005 ETH
0.01 ETH
0.05 ETH
```

Avoid completely arbitrary stakes.

Reason:

Prevents fragmented matchmaking.

Improves liquidity.

---

## Prize Pool Distribution

Recommended:

```txt
1st = 65%
2nd = 25%
3rd = 10%
```

After platform fee.

---

## Platform Fee

Recommended:

```txt
2% → 5%
```

Reason:

Long-term sustainability.

---

# Technology Stack

## Frontend

Recommended:

- Next.js
- TypeScript
- Phaser.js
- Zustand

Responsibilities:

- rendering
- UI
- matchmaking
- wallet connection
- room creation
- betting interface
- replay viewing
- profile systems

---

## Multiplayer Backend

Recommended:

- Colyseus
- Socket.IO
- Node.js

### Colyseus Responsibilities

- game rooms
- websocket synchronization
- authoritative game loop
- player session management
- reconnect handling

### Socket.IO Responsibilities

Optional:

- social systems
- chat
- notifications
- room invites

Gameplay synchronization should remain inside Colyseus.

---

## Blockchain

Development:

Base Sepolia.

Future:

Base Mainnet.

Responsibilities:

- escrow
- payout
- settlement
- proof verification
- rewards

Blockchain MUST NOT:

- run gameplay
- validate movement live
- run physics

---

## TEE Layer

Recommended:

urlPhala Network Docshttps://docs.phala.com/

Phala TEE acts as:

**Authoritative Game Logic Layer**.

The game logic should run inside:

TEE-protected confidential compute.

---

# TEE Trust Model

Game logic executes inside:

Phala confidential execution.

This replaces:

Traditional trusted game server.

The TEE is responsible for:

- movement validation
- collision detection
- food spawning
- shrinking circle logic
- snake growth
- elimination
- match outcome
- winner determination

Reason:

Movement cheating is the largest attack surface.

TEE removes need for expensive realtime ZK proofs.

This architecture minimizes trust while preserving low latency.

---

# Movement Security Model

Movement legality will NOT be zk-proven in MVP.

Instead:

TEE authoritative simulation enforces:

- speed limits
- valid movement
- no teleportation
- no impossible turns
- collision correctness

Clients are never trusted.

Client sends:

```txt
movement input
```

Never:

```txt
position
```

The TEE computes:

Official game state.

---

# RNG Design

Recommended:

**TEE deterministic commit-reveal RNG**.

No external oracle required.

Avoid Chainlink VRF for MVP.

Reason:

Realtime game.

Low latency preferred.

---

## RNG Flow

Before match:

TEE generates:

```txt
seed
```

Then publishes:

```txt
hash(seed)
```

This becomes:

Match commitment.

Food spawning becomes:

Deterministic function:

```txt
food = PRNG(seed)
```

At end of match:

TEE reveals:

```txt
seed
```

Anyone can replay:

- food spawns
- arena behavior
- deterministic randomness

This guarantees:

Provably fair randomness.

---

# ZK Scope

MVP ZK scope intentionally limited.

ZK should only verify:

## 1. Winner Verification

Proof objective:

The declared winner legitimately resulted from the match.

Verification includes:

- valid ranking
- match consistency
- payout correctness

---

## 2. Fair RNG Verification

Proof objective:

Food and random state came from committed seed.

No manipulation.

---

## 3. Settlement Verification

Proof objective:

Prize distribution is correct.

Including:

```txt
65 / 25 / 10
```

split.

---

## 4. Shrinking Circle Validation

Proof objective:

Players outside legal arena receive:

Correct damage.

Boundary logic respected.

---

## Explicitly NOT Included

Do NOT zk-prove:

- movement legality
- per-frame simulation
- rendering
- realtime physics
- snake interpolation

Reason:

TEE already secures realtime gameplay.

---

# Match Lifecycle

## Phase 1 — Room Creation

Host configures:

- player count
- match duration
- stake size

Constraints validated.

---

## Phase 2 — Escrow

Players deposit stake.

Contract escrows funds.

Match starts only after:

All players joined.

---

## Phase 3 — RNG Commitment

TEE generates:

```txt
seed
```

Publishes:

```txt
hash(seed)
```

This prevents manipulation.

---

## Phase 4 — Gameplay

Players send:

```txt
movement input
```

TEE authoritative logic computes:

- movement
- collision
- deaths
- food
- growth
- shrinking zone

---

## Phase 5 — Match End

Determine:

```txt
1st
2nd
3rd
```

By:

Last standing OR mass ranking.

---

## Phase 6 — Proof Generation

Generate:

- winner proof
- RNG proof
- settlement proof

Verify using:

- Noir
- Barretenberg
- zkVerify

---

## Phase 7 — Settlement

Smart contract releases:

Prize pool.

Automatically.

---

# Replay Model

Recommended:

Deterministic replay.

Store:

- seed
- player inputs
- event logs

Do NOT store:

Full frame history.

Reason:

Storage efficiency.

The game can be reconstructed exactly.

Replay useful for:

- disputes
- spectators
- highlights
- analytics

---

# Security Assumptions

Assume clients are hostile.

Threats:

- modified clients
- movement hacks
- packet tampering
- replay attacks
- bots
- scripting

Protection:

TEE authoritative execution.

The client never owns truth.

---

# AI Agent Implementation Rules

The AI agent MUST:

1. Prioritize gameplay quality.
2. Preserve pure Slither.io mechanics.
3. Never make client authoritative.
4. Keep gameplay fast.
5. Avoid overengineering ZK.
6. Use TEE for realtime trust.
7. Use ZK only for settlement-critical logic.
8. Maintain modular architecture.
9. Optimize for low latency.
10. Build incrementally.

Implementation order:

1. Pure gameplay
2. Multiplayer
3. Betting
4. TEE integration
5. RNG
6. ZK settlement
7. Replay system
8. Optimization

---

# Final Product Philosophy

The objective is NOT:

To build a fully trustless game.

The objective IS:

To build a genuinely fun competitive game with minimized trust assumptions.

Realtime gameplay trust comes from:

TEE execution.

Economic trust comes from:

ZK verification + blockchain settlement.

The experience should feel:

Like a highly polished competitive snake battle royale.

The cryptography should remain invisible beneath the gameplay.

