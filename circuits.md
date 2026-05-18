# Kudoku circuits

Kudoku currently ships five Noir circuits:

1. `ranking`
2. `settlement`
3. `rng_commitment`
4. `arena_schedule`
5. `elimination`

The workspace is defined in `circuits/Nargo.toml` and is compiled with Noir `1.0.0-beta.6`.

## How to inspect them

Run these from WSL:

```bash
wsl bash -lc "cd /mnt/c/Users/hemav/OneDrive/Desktop/kudoku/circuits && ~/.nargo/bin/nargo test --workspace"
wsl bash -lc "cd /mnt/c/Users/hemav/OneDrive/Desktop/kudoku/circuits && ~/.nargo/bin/nargo info --workspace"
```

`nargo info --workspace` is the best quick view for **circuit complexity**. Higher ACIR opcode counts usually mean heavier proving work. The synced `frontend/public/circuits/*.json` sizes are the **browser download footprint**, which is a different concern.

## Current circuit metrics

| Circuit | What it proves | Public inputs | Private witness | ACIR opcodes | Brillig opcodes | Frontend JSON size | Relative proving cost |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| `rng_commitment` | The revealed seed matches the committed match seed and derives the committed initial food stream. | `match_id`, `player_count`, `initial_food_count`, `seed_commitment`, `food_commitment` | `revealed_seed` | 15 | 30 | 23.91 KiB | Tiny |
| `arena_schedule` | The current safe radius matches the official shrink schedule for the match config. | `match_id`, `duration_ms`, `elapsed_ms`, `initial_safe_radius`, `final_safe_radius`, `current_safe_radius`, `arena_damage_per_second` | none | 44 | 17 | 3.75 KiB | Small |
| `settlement` | Prize payouts exactly match the total pool, fee, and basis-point split. | `match_id`, `total_pool`, `platform_fee`, `first_bps`, `second_bps`, `third_bps`, `first`, `second`, `third` | none | 59 | 8 | 3.75 KiB | Small |
| `ranking` | The final podium is ordered correctly by mass, then survival time, then deterministic tie-break key. | `match_id`, `player_count`, top-3 mass/survival/tiebreak tuples | none | 75 | 8 | 4.79 KiB | Small |
| `elimination` | The full supported-room elimination summary is consistent: ordered placements, alive/death status, slot validity, and commitments. | `match_id`, `player_count`, `elimination_commitment`, `config_commitment` | 64 private fields: match config + 12 padded slot summaries | 982 | 47 | 65.37 KiB | Heavy |

## Cost notes

- **Cheapest circuits:** `rng_commitment`, `arena_schedule`, `settlement`
- **Still lightweight:** `ranking`
- **Clearly the expensive one:** `elimination`

Important nuance:

- **Prover cost** is best approximated here by `nargo info` opcode counts.
- **Frontend payload size** is the compiled `.json` artifact size.
- **On-chain verification footprint** stays compact for `elimination` because it exposes only **4 public inputs** even though its private witness is much larger.

All synced `.vk` files currently weigh about **1.72 KiB** each in `frontend/public/circuits`.

## Circuit-by-circuit detail

### `ranking`

**Purpose**
- Proves the top 3 placements are ordered correctly.

**Public inputs**
- `match_id`
- `player_count`
- `first_mass`, `first_survived_ms`, `first_tiebreak_key`
- `second_mass`, `second_survived_ms`, `second_tiebreak_key`
- `third_mass`, `third_survived_ms`, `third_tiebreak_key`

**Logic**
- Requires at least 3 players.
- Uses the same ordering rule as the game runtime:
  1. higher mass wins
  2. if tied, longer survival wins
  3. if still tied, lower deterministic tie-break key wins

**What it does not prove**
- It does not replay the game.
- It only proves the published podium ordering is consistent.

### `settlement`

**Purpose**
- Proves the prize payout amounts are exactly correct.

**Public inputs**
- `match_id`
- `total_pool`
- `platform_fee`
- `first_bps`, `second_bps`, `third_bps`
- `first`, `second`, `third`

**Logic**
- Computes `prize_pool = total_pool - platform_fee`.
- Requires the basis points to sum to `10_000`.
- Requires the three payouts to sum to the prize pool.
- Requires each payout to match its exact basis-point share.

**What it does not prove**
- It does not prove who deserved those places.
- It assumes the match result that feeds the payout split is already trusted.

### `rng_commitment`

**Purpose**
- Proves the revealed randomness seed matches the committed seed and committed initial food derivation.

**Public inputs**
- `match_id`
- `player_count`
- `initial_food_count`
- `seed_commitment`
- `food_commitment`

**Private witness**
- `revealed_seed`

**Logic**
- Recomputes:
  - `seed_commitment = pedersen_hash([revealed_seed, match_id, player_count])`
  - `food_commitment = pedersen_hash([revealed_seed, initial_food_count, match_id])`
- Asserts both public commitments match.

**What it gives you**
- A compact proof that the match seed reveal was honest.
- A compact binding between the seed and the initial food stream commitment.

### `arena_schedule`

**Purpose**
- Proves the current safe-zone radius is the official rounded schedule output.

**Public inputs**
- `match_id`
- `duration_ms`
- `elapsed_ms`
- `initial_safe_radius`
- `final_safe_radius`
- `current_safe_radius`
- `arena_damage_per_second`

**Logic**
- Requires a valid positive duration.
- Requires `elapsed_ms <= duration_ms`.
- Requires `initial_safe_radius >= final_safe_radius`.
- Recomputes the rounded shrink formula and asserts the published radius matches it.

**What it does not prove**
- It does not prove any snake actually took zone damage.
- It proves the official arena schedule/config is consistent.

### `elimination`

**Purpose**
- Proves the full match elimination **summary** for supported room sizes `3`, `4`, `6`, and `12`.

**Public inputs**
- `match_id`
- `player_count`
- `elimination_commitment`
- `config_commitment`

**Private witness**
- Match config:
  - `duration_ms`
  - `initial_safe_radius`
  - `final_safe_radius`
  - `collision_radius`
- Up to 12 padded slot summaries, each with:
  - `mass`
  - `survived_ms`
  - `tiebreak_key`
  - `alive`
  - `death_type`

**Death type enum**
- `0` = still alive / winner slot
- `1` = boundary elimination
- `2` = collision elimination

**Logic**
- Accepts only room sizes `3`, `4`, `6`, or `12`.
- Recomputes and checks the `config_commitment`.
- Validates every active slot:
  - positive mass
  - `survived_ms <= duration_ms`
  - alive players must use `death_type = 0`
  - eliminated players must use `death_type = 1` or `2`
- Validates padded empty slots are all zeroed.
- Enforces full placement ordering across active slots using the same mass/survival/tie-break rule as gameplay.
- Recomputes the `elimination_commitment` from all 12 slot hashes.

**Why it is the biggest circuit**
- It carries a lot more witness data than the other circuits.
- It proves all supported players, not just top 3.
- It keeps the on-chain/public side compact by hiding the per-player details behind commitments.

## Practical takeaway

If you only care about **cheap and fast** proofs in the browser:

- `rng_commitment`
- `arena_schedule`
- `settlement`
- `ranking`

If you want the strongest **end-of-match fairness summary** without replaying the entire physics loop:

- `elimination`

That is why Kudoku’s current stack is a good summary-proof architecture:

- `rng_commitment` binds randomness
- `arena_schedule` binds zone config
- `ranking` binds podium ordering
- `settlement` binds payouts
- `elimination` binds the all-player end-state summary
