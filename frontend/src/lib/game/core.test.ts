import { describe, expect, it } from "vitest";
import { createMatch, matchConfigForPlayers, orderPlacements, playerTieBreakKey, safeRadiusAt, serializeForReplay, stepMatch } from "./core";

describe("kudoku game core", () => {
  it("creates deterministic food layouts from a seed", () => {
    const a = createMatch([{ id: "a" }, { id: "b" }], "seed-1", { initialFood: 5 });
    const b = createMatch([{ id: "a" }, { id: "b" }], "seed-1", { initialFood: 5 });

    expect(serializeForReplay(a)).toEqual(serializeForReplay(b));
  });

  it("advances the same inputs deterministically", () => {
    let a = createMatch([{ id: "a" }, { id: "b" }], "seed-2", { initialFood: 5 });
    let b = createMatch([{ id: "a" }, { id: "b" }], "seed-2", { initialFood: 5 });

    for (let i = 0; i < 12; i += 1) {
      const inputs = [
        { playerId: "a", angleRadians: Math.PI / 4 },
        { playerId: "b", angleRadians: Math.PI }
      ];
      a = stepMatch(a, inputs);
      b = stepMatch(b, inputs);
    }

    expect(serializeForReplay(a)).toEqual(serializeForReplay(b));
  });

  it("shrinks the safe radius over match time", () => {
    const match = createMatch([{ id: "a" }, { id: "b" }], "seed-3", {
      durationMs: 1_000,
      initialSafeRadius: 100,
      finalSafeRadius: 25
    });

    expect(safeRadiusAt(match)).toBe(100);
    expect(safeRadiusAt({ ...match, elapsedMs: 1_000 })).toBe(25);
  });

  it("scales arena size down for smaller player-count rooms", () => {
    const trio = matchConfigForPlayers(3);
    const full = matchConfigForPlayers(12);

    expect(trio.initialSafeRadius).toBeLessThan(full.initialSafeRadius);
    expect(trio.finalSafeRadius).toBeLessThan(full.finalSafeRadius);
    expect(trio.initialFood).toBeLessThan(full.initialFood);
  });

  it("ends when the timer expires and ranks by mass", () => {
    let match = createMatch([{ id: "a" }, { id: "b" }], "seed-4", {
      durationMs: 50,
      tickRate: 20,
      initialFood: 0
    });
    match.snakes.a!.mass = 20;
    match.snakes.b!.mass = 12;

    match = stepMatch(match, []);

    expect(match.phase).toBe("ended");
    expect(match.placements[0]?.playerId).toBe("a");
  });

  it("keeps final rankings sorted by mass even when a lighter snake survives", () => {
    const ranked = orderPlacements([
      { playerId: "survivor", rank: 0, mass: 12, survivedMs: 4_000, alive: true },
      { playerId: "heavy-dead", rank: 0, mass: 28, survivedMs: 3_000, alive: false },
      { playerId: "third", rank: 0, mass: 18, survivedMs: 2_000, alive: false }
    ]);

    expect(ranked.map((entry) => entry.playerId)).toEqual(["heavy-dead", "third", "survivor"]);
    expect(ranked.map((entry) => entry.mass)).toEqual([28, 18, 12]);
  });

  it("uses the same deterministic tie-break ordering as the proof layer", () => {
    const tied = orderPlacements([
      { playerId: "0xbbb", rank: 0, mass: 20, survivedMs: 5_000, alive: false },
      { playerId: "0xaaa", rank: 0, mass: 20, survivedMs: 5_000, alive: false },
      { playerId: "0xccc", rank: 0, mass: 20, survivedMs: 5_000, alive: false }
    ]);

    const expected = ["0xbbb", "0xaaa", "0xccc"].sort((left, right) => {
      const leftKey = playerTieBreakKey(left);
      const rightKey = playerTieBreakKey(right);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });

    expect(tied.map((entry) => entry.playerId)).toEqual(expected);
  });

  it("boosting moves farther while preserving mass and spending boost energy", () => {
    const base = createMatch([{ id: "a" }, { id: "b" }], "seed-5", { initialFood: 0 });
    const boosted = createMatch([{ id: "a" }, { id: "b" }], "seed-5", { initialFood: 0 });
    base.snakes.a!.mass = 20;
    boosted.snakes.a!.mass = 20;
    base.snakes.a!.boostEnergy = 60;
    boosted.snakes.a!.boostEnergy = 60;

    const nextBase = stepMatch(base, [{ playerId: "a", angleRadians: Math.PI / 2 }]);
    const nextBoosted = stepMatch(boosted, [{ playerId: "a", angleRadians: Math.PI / 2, boosting: true }]);

    expect(nextBoosted.snakes.a!.mass).toBe(nextBase.snakes.a!.mass);
    expect(nextBoosted.snakes.a!.boostEnergy).toBeLessThan(nextBase.snakes.a!.boostEnergy);
    expect(nextBoosted.snakes.a!.segments[0]!.y).toBeGreaterThan(nextBase.snakes.a!.segments[0]!.y);
  });

  it("cannot ramp boost before collecting food energy", () => {
    const match = createMatch([{ id: "a" }, { id: "b" }], "seed-no-boost", { initialFood: 0 });
    match.snakes.a!.boostEnergy = 0;

    const next = stepMatch(match, [{ playerId: "a", angleRadians: Math.PI / 2, boosting: true }]);

    expect(next.snakes.a!.boostCharge).toBe(0);
  });

  it("pulls nearby food slightly toward the snake head", () => {
    const match = createMatch([{ id: "a" }, { id: "b" }], "seed-5b", { initialFood: 0 });
    match.snakes.a!.segments = [{ x: 0, y: 0 }];
    match.food = [{ id: "f-1", x: 42, y: 0, value: 1 }];

    const next = stepMatch(match, [{ playerId: "a", angleRadians: 0 }]);

    expect(next.food[0]?.x ?? Infinity).toBeLessThan(42);
  });

  it("lets a snake overlap its own body without dying", () => {
    const match = createMatch([{ id: "a" }, { id: "b" }], "seed-6", { initialFood: 0 });
    match.snakes.a!.segments = [
      { x: 0, y: 0 },
      { x: -10, y: 0 },
      { x: -20, y: 0 },
      { x: -30, y: 0 },
      { x: -40, y: 0 },
      { x: -50, y: 0 },
      { x: 0, y: 0 }
    ];
    match.snakes.a!.angle = Math.PI;

    const next = stepMatch(match, [{ playerId: "a", angleRadians: Math.PI }]);

    expect(next.snakes.a!.alive).toBe(true);
  });

  it("kills a snake when its head hits another snake's body", () => {
    const match = createMatch([{ id: "a" }, { id: "b" }], "seed-7", { initialFood: 0 });
    match.snakes.a!.segments = [{ x: 0, y: 0 }];
    match.snakes.a!.angle = 0;
    match.snakes.b!.segments = [
      { x: 120, y: 0 },
      { x: 9, y: 0 },
      { x: 18, y: 0 },
      { x: 27, y: 0 }
    ];

    const next = stepMatch(match, [{ playerId: "a", angleRadians: 0 }]);

    expect(next.snakes.a!.alive).toBe(false);
    expect(next.snakes.b!.alive).toBe(true);
  });
});
