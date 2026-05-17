# Kudoku Circuits

This workspace starts with small settlement-oriented Noir circuits. Later phases should expand it into:

- RNG commitment/reveal validation
- final ranking/winner validation
- payout math validation
- shrinking arena invariant validation

Run all commands through WSL with the pinned Noir toolchain that matches the
`zkv-uno` frontend dependency family:

```bash
wsl bash -lc "~/.nargo/bin/nargo --version"
```

The expected local version is:

- `nargo` / `noirc`: `1.0.0-beta.6`

If the WSL binary is corrupted or crashes before printing a version, repair it
with:

```bash
wsl bash -lc "~/.nargo/bin/noirup -v 1.0.0-beta.6"
```

Common commands:

```bash
wsl bash -lc "cd /mnt/c/Users/hemav/OneDrive/Desktop/kudoku/circuits && ~/.nargo/bin/nargo test"
wsl bash -lc "cd /mnt/c/Users/hemav/OneDrive/Desktop/kudoku/circuits && ~/.nargo/bin/nargo compile --workspace"
wsl bash -lc "cd /mnt/c/Users/hemav/OneDrive/Desktop/kudoku/circuits && ~/.nargo/bin/nargo compile --package settlement"
wsl bash -lc "cd /mnt/c/Users/hemav/OneDrive/Desktop/kudoku/circuits && ~/.nargo/bin/nargo compile --package ranking"
```

Compiled ACIR artifacts land in:

```txt
circuits/target/ranking.json
circuits/target/settlement.json
```

Build the full frontend/on-chain artifact bundle with:

```bash
npm run zk:build
npm run zk:register-vks
```

`npm run zk:build` compiles the Noir workspace in WSL, generates:

- raw verification keys at `circuits/target/*.vk`
- hex-encoded verification keys at `circuits/target/hex/*_vk.hex`
- Solidity verifier contracts at `contracts/src/verifiers/*.sol`
- synced frontend assets at `frontend/public/circuits/*.{json,vk}`

`npm run zk:register-vks` optionally registers those VKs with zkVerify/Kurier using the
configured API key and writes the returned hashes into:

```txt
frontend/src/lib/zk/vkHashes.json
```

Before adding browser or backend proof generation, inspect
`C:\Users\hemav\OneDrive\Desktop\zkv-uno` and mirror its Noir, Barretenberg,
UltraHonk, Keccak, and Kurier settings.
