# AGENT_RULES.md

## Purpose

This document defines the mandatory operating rules, constraints, workflows, implementation expectations, and development standards for any AI coding agent working on this repository.

These rules are mandatory.

The agent must follow them strictly.

The objective is to:

- maintain compatibility with zkVerify
- avoid version mismatches
- preserve code quality
- maintain architectural consistency
- support long multi-session development
- ensure maintainability
- ensure reproducibility

This project is a **real-money multiplayer snake battle royale game** using:

- Next.js
- TypeScript
- Phaser.js
- Zustand
- Colyseus
- Socket.IO
- Noir
- Barretenberg
- zkVerify
- Base Sepolia
- Authoritative backend server

The complete game specification exists separately.

This file defines **how the agent must work**.

---

# RULE 1 — Analyze Existing zkVerify Reference Project First (MANDATORY)

Before writing any code, the agent MUST perform a detailed analysis of the following repository:

```txt
C:\Users\hemav\OneDrive\Desktop\zkv-uno
```

This repository contains:

- Noir integration
- Barretenberg integration
- zkVerify integration
- exact working versions
- compatible tooling

The agent MUST:

1. inspect the codebase thoroughly
2. understand the architecture
3. inspect dependency versions
4. inspect Noir versions
5. inspect Barretenberg versions
6. inspect zkVerify integration
7. inspect proving flow
8. inspect verification flow
9. inspect package versions
10. understand folder organization
11. inspect scripts and commands
12. inspect how proofs are generated
13. inspect how verification is handled
14. understand any compatibility workarounds

The agent MUST NOT:

- guess versions
- upgrade packages arbitrarily
- assume compatibility
- introduce different Noir versions
- introduce different Barretenberg versions
- introduce incompatible zkVerify versions

The agent MUST mirror the working compatible setup used in:

```txt
zkv-uno
```

unless explicitly instructed otherwise.

---

# RULE 2 — Version Compatibility Is Critical

zkVerify is version-sensitive.

Noir and Barretenberg compatibility matters.

The agent MUST:

- follow exact compatible versions
- inspect lock files
- inspect package.json
- inspect tooling versions
- inspect scripts

The agent MUST NOT:

- update versions casually
- modernize dependencies automatically
- refactor dependency setup without reason

Compatibility takes priority over novelty.

If uncertain:

Match the exact working implementation from:

```txt
zkv-uno
```
Make sure to check if the Nextjs, noir and Barretenberg versions are compatible. be careful if you are using the latest version of Nextjs for safer side i would suggest using the Nextjs version used in the zkv-uno repo 
---

# RULE 3 — WSL ONLY FOR NOIR AND BARRETENBERG EXECUTION

Noir and Barretenberg are installed in WSL only.

Therefore:

The agent MUST run:

- Noir commands
- Barretenberg commands
- circuit compilation
- proof generation
- proving tests
- verification tests

inside:

```txt
WSL
```

The agent MUST NOT assume:

Native Windows installation exists.

The agent MUST:

Use WSL paths and execution.

Examples include:

```bash
wsl nargo compile
```

```bash
wsl bb prove
```

or equivalent workflows depending on existing setup.

The agent should first inspect the existing:

```txt
zkv-uno
```

workflow.

The agent MUST follow the exact same execution pattern.

---
if u are facing any error in the codebase or the circuit execution make sure to check the nodemodules look for the specifics of bb and noir/nargo code over there if required for deeper undeerstanding

# RULE 3.5 — Smart Contract Development Rules (MANDATORY)

All smart contracts MUST use:

```txt
Foundry
```

The agent MUST NOT:

- use Hardhat
- use Truffle
- introduce alternate Solidity frameworks
- mix frameworks unnecessarily

Foundry is the required contract framework.

---

## WSL ONLY FOR FOUNDRY

Foundry is installed inside:

```txt
WSL
```

Therefore:

The agent MUST run:

- forge build
- forge test
- forge script
- anvil
- cast
- deployment scripts

inside:

```txt
WSL
```

The agent MUST NOT assume:

Native Windows Foundry installation exists.

Examples:

```bash
wsl forge build
```

```bash
wsl forge test
```

```bash
wsl anvil
```

or equivalent workflow depending on repository setup.

The agent MUST validate:

```txt
contracts compile successfully
```

before marking smart contract work complete.

The agent MUST validate:

```txt
tests pass
```

before marking smart contract work complete.

Smart contract testing is mandatory.

---

# RULE 4 — Circuit Quality Requirements

Every circuit written MUST include:

1. circuit tests
2. compilation validation
3. proof generation validation
4. verification validation
5. edge case testing

The agent MUST verify:

```txt
circuit compiles successfully
```

before marking work complete.

The agent MUST verify:

```txt
proof generation works
```

before marking work complete.

The agent MUST verify:

```txt
verification succeeds
```

before marking work complete.

No circuit should be considered complete unless:

```txt
compile + test + prove + verify
```

all pass.

---

# RULE 5 — Test Everything

The agent MUST write tests.

Requirements:

### Circuit Tests

Mandatory.

### Backend Tests

Required for critical systems.

Examples:

- game logic
- settlement
- payout logic
- validation logic
- replay logic

### Smart Contract Tests

Mandatory.

### Integration Tests

Strongly encouraged.

The agent MUST avoid:

Untested critical logic.

---

# RULE 6 — Git Workflow (MANDATORY)

The agent MUST commit frequently.

Do NOT accumulate large uncommitted changes.
Do not co-authorise commits, i only want my username to be the commiter i dont want to see codex or copilot as the commiter in my git history
Do not commit the docs folder in the root or any .md files u create
Commit after:

- feature completion
- milestone completion
- refactor completion
- test completion
- bug fixes

Frequent small commits are required.

---

## Commit Prefix Rules

Allowed prefixes:

```txt
feat
fix
chore
refactor
init
test
docs
perf
```

Examples:

```txt
feat: room setup
```

```txt
fix: payout bug
```

```txt
refactor: game loop
```

```txt
test: rng circuit
```

Commit messages MUST be:

- short
- concise
- clear

Avoid:

Long commit essays.

Bad:

```txt
feat: implemented complete architecture for multiplayer room synchronization and wallet integration with extensive logic
```

Good:

```txt
feat: room sync
```

---

# RULE 7 — Maintain TODO.md (MANDATORY)

The agent MUST create:

```txt
TODO.md
```

This file acts as:

Persistent project memory.

The agent MUST update:

```txt
TODO.md
```

after every completed task.

The TODO file MUST include:

## Completed

What has been finished.

## In Progress

Current active work.

## Pending

Remaining tasks.

The agent MUST:

Mark completed items clearly.

This file exists to support:

- multi-session development
- context persistence
- project continuity
- future agent handoff

Before starting new work:

The agent MUST read:

```txt
TODO.md
```

first.

---

# RULE 8 — Follow Architecture Specification

The agent MUST follow:

The master game specification.

The snake game architecture document acts as:

Source of truth.

The agent MUST NOT:

Invent alternative game mechanics.

The agent MUST preserve:

Pure Slither.io mechanics.

Examples:

Allowed:

- food growth
- classic collision
- dropped mass
- shrinking arena

Not allowed without explicit approval:

- abilities
- spells
- weapons
- random combat powers
- stat inflation
- pay-to-win mechanics

The game should remain:

Skill-based.

---

# RULE 9 — Code Quality Standards

The codebase MUST remain:

- modular
- clean
- readable
- maintainable
- easy to understand
- beginner-friendly

Prefer:

Small focused modules.

Avoid:

Massive files.

Avoid:

Deeply nested logic.

Avoid:

Overengineering.

Avoid:

Premature abstractions.

Prefer:

Simple understandable systems.

The codebase should be easy for developers to understand quickly.

---

# RULE 10 — Comment Style Rules

Comments should remain:

- minimal
- useful
- concise

Avoid:

Long paragraphs of comments.

Avoid:

Obvious comments.

Bad:

```ts
// increment count by one
count++
```

Good:

```ts
// prevent double settlement
```

Exception:

Noir circuits may contain additional comments where mathematical reasoning improves readability.

Circuit logic clarity matters.

---

# RULE 11 — Build Incrementally

The agent MUST build incrementally.

Required implementation order:

## Phase 1

Core gameplay.

Includes:

- snake movement
- food
- collision
- growth
- shrinking arena

No blockchain.

No ZK.

No TEE.

---

## Phase 2

Multiplayer.

Includes:

- Colyseus rooms
- player sync
- reconnect handling

---

## Phase 3

Betting flow.

Includes:

- escrow
- room config
- prize distribution

---

## Phase 4

Server deployment.

Includes:

- authoritative logic

---

## Phase 5

ZK systems.

Includes:

- winner verification
- RNG verification
- settlement verification

---

## Phase 6

Optimization.

Includes:

- replay system
- performance
- scalability

The agent MUST avoid:

Trying to implement everything simultaneously.

---

# RULE 12 — Never Assume

The agent MUST inspect first.

Before changing:

- architecture
- dependency versions
- proving setup
- project structure
- scripts

The agent MUST:

Read code first.

Understand first.

Then implement.

Assumptions are forbidden.

---

# RULE 13 — Developer Experience Matters

The project should remain:

Easy to run.

Easy to debug.

Easy to onboard.

Prefer:

Clear scripts.

Clear naming.

Predictable structure.

Readable logic.

Good DX is mandatory.

---

# Final Instruction

The objective is:

To build a clean, maintainable, production-quality codebase.

Correctness matters more than speed.

Compatibility matters more than novelty.

Code quality matters more than cleverness.

Gameplay quality matters more than complexity.

When uncertain:

Inspect existing implementations.

Prefer simplicity.

Build incrementally.

Test thoroughly.

Commit frequently.
