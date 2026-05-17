# Kudoku Implementation Notes

## Current Decisions

- First milestone is a full scaffold with runnable packages.
- Core gameplay stays pure Slither.io: movement, food, growth, collision, dropped mass, shrinking arena, and ranking by survival or mass.
- Clients send input intent only. Server state is authoritative.
- TEE integration comes after multiplayer is stable.
- ZK scope remains settlement-critical only: RNG commitment, final ranking/winner, payout math, and selected arena invariants.

## Version Guardrails

- Phaser/Next follows the user's latest-template preference in the app scaffold.
- Noir, Barretenberg, and zkVerify integrations must mirror the known-good `zkv-uno` setup unless explicitly changed.
- All Foundry/Noir/Barretenberg commands run through WSL.

## Recommended Flow

1. Make local practice gameplay feel good.
2. Move the same deterministic simulation into Colyseus rooms.
3. Add escrow and settlement contracts.
4. Deploy the authoritative room service in Phala.
5. Add proof generation and zkVerify settlement gates.
