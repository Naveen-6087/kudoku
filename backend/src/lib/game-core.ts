export interface Vec2 {
  x: number;
  y: number;
}

export type SnakeSegment = Vec2;

export interface Food extends Vec2 {
  id: string;
  value: number;
}

export interface Snake {
  id: string;
  name: string;
  angle: number;
  mass: number;
  boostEnergy: number;
  boostCharge: number;
  health: number;
  alive: boolean;
  survivedMs: number;
  segments: SnakeSegment[];
}

export interface MatchConfig {
  durationMs: number;
  tickRate: number;
  worldRadius: number;
  initialSafeRadius: number;
  finalSafeRadius: number;
  initialFood: number;
  snakeSpeed: number;
  initialBoostEnergy: number;
  maxBoostEnergy: number;
  boostEnergyGainPerFood: number;
  boostSpeedMultiplier: number;
  boostEnergyDrainPerSecond: number;
  boostRampPerSecond: number;
  boostDecayPerSecond: number;
  turnRateRadiansPerSecond: number;
  segmentSpacing: number;
  collisionRadius: number;
  foodRadius: number;
  arenaDamagePerSecond: number;
}

export interface PlayerSpawn {
  id: string;
  name?: string;
}

export interface PlayerInput {
  playerId: string;
  angleRadians: number;
  boosting?: boolean;
}

export interface Placement {
  playerId: string;
  rank: number;
  mass: number;
  survivedMs: number;
  alive: boolean;
}

export interface MatchState {
  seed: string;
  tick: number;
  elapsedMs: number;
  phase: "running" | "ended";
  config: MatchConfig;
  snakes: Record<string, Snake>;
  food: Food[];
  placements: Placement[];
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  durationMs: 180_000,
  tickRate: 20,
  worldRadius: 2_400,
  initialSafeRadius: 2_180,
  finalSafeRadius: 430,
  initialFood: 220,
  snakeSpeed: 178,
  initialBoostEnergy: 44,
  maxBoostEnergy: 170,
  boostEnergyGainPerFood: 7.5,
  boostSpeedMultiplier: 2.1,
  boostEnergyDrainPerSecond: 20,
  boostRampPerSecond: 1.25,
  boostDecayPerSecond: 4.2,
  turnRateRadiansPerSecond: Math.PI * 2.4,
  segmentSpacing: 10,
  collisionRadius: 14,
  foodRadius: 11,
  arenaDamagePerSecond: 35
};

export function createMatch(
  players: PlayerSpawn[],
  seed: string,
  config: Partial<MatchConfig> = {}
): MatchState {
  const merged = { ...DEFAULT_MATCH_CONFIG, ...config };
  const rng = createRng(seed);
  const snakes: Record<string, Snake> = {};

  players.forEach((player, index) => {
    const spawnAngle = (Math.PI * 2 * index) / Math.max(players.length, 1);
    const spawnRadius = merged.initialSafeRadius * 0.35;
    const head = {
      x: Math.cos(spawnAngle) * spawnRadius,
      y: Math.sin(spawnAngle) * spawnRadius
    };
    const angle = spawnAngle + Math.PI / 2;
    snakes[player.id] = {
      id: player.id,
      name: player.name ?? player.id,
      angle,
      mass: 12,
      boostEnergy: merged.initialBoostEnergy,
      boostCharge: 0,
      health: 100,
      alive: true,
      survivedMs: 0,
      segments: buildInitialSegments(head, angle, merged.segmentSpacing, 22)
    };
  });

  const state: MatchState = {
    seed,
    tick: 0,
    elapsedMs: 0,
    phase: "running",
    config: merged,
    snakes,
    food: [],
    placements: []
  };

  while (state.food.length < merged.initialFood) {
    state.food.push(spawnFood(state, rng));
  }

  return state;
}

export function stepMatch(state: MatchState, inputs: PlayerInput[]): MatchState {
  if (state.phase === "ended") return cloneState(state);

  const next = cloneState(state);
  const dtMs = 1_000 / next.config.tickRate;
  const dtSeconds = dtMs / 1_000;
  const inputByPlayer = new Map(inputs.map((input) => [input.playerId, input]));
  const rng = createRng(`${next.seed}:${next.tick + 1}`);

  next.tick += 1;
  next.elapsedMs += dtMs;

  for (const snake of Object.values(next.snakes)) {
    if (!snake.alive) continue;
    const input = inputByPlayer.get(snake.id);
    if (input) {
      snake.angle = turnToward(
        snake.angle,
        input.angleRadians,
        next.config.turnRateRadiansPerSecond * dtSeconds
      );
    }
    updateBoostState(snake, next.config, dtSeconds, Boolean(input?.boosting));
    moveSnake(snake, next.config, dtSeconds);
    snake.survivedMs += dtMs;
    applyArenaDamage(snake, next);
  }

  consumeFood(next, rng);
  resolveCollisions(next);
  refillFood(next, rng);
  maybeEndMatch(next);

  return next;
}

export function safeRadiusAt(state: Pick<MatchState, "elapsedMs" | "config">): number {
  const progress = Math.min(1, state.elapsedMs / state.config.durationMs);
  return lerp(state.config.initialSafeRadius, state.config.finalSafeRadius, progress);
}

export function rankSnakes(state: MatchState): Placement[] {
  return orderPlacements(
    Object.values(state.snakes).map((snake) => ({
      playerId: snake.id,
      rank: 0,
      mass: snake.mass,
      survivedMs: snake.survivedMs,
      alive: snake.alive
    }))
  );
}

export function orderPlacements(placements: readonly Placement[]): Placement[] {
  return [...placements]
    .sort((a, b) => {
      if (b.mass !== a.mass) return b.mass - a.mass;
      if (b.survivedMs !== a.survivedMs) return b.survivedMs - a.survivedMs;
      return a.playerId.localeCompare(b.playerId);
    })
    .map((placement, index) => ({ ...placement, rank: index + 1 }));
}

export function serializeForReplay(state: MatchState): string {
  return JSON.stringify({
    seed: state.seed,
    tick: state.tick,
    elapsedMs: state.elapsedMs,
    snakes: Object.values(state.snakes)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((snake) => ({
        id: snake.id,
        angle: round(snake.angle),
        mass: round(snake.mass),
        boostEnergy: round(snake.boostEnergy),
        boostCharge: round(snake.boostCharge),
        health: round(snake.health),
        alive: snake.alive,
        survivedMs: round(snake.survivedMs),
        segments: snake.segments.map((segment) => ({ x: round(segment.x), y: round(segment.y) }))
      })),
    food: state.food
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((food) => ({ id: food.id, x: round(food.x), y: round(food.y), value: food.value }))
  });
}

function buildInitialSegments(head: Vec2, angle: number, spacing: number, count: number): SnakeSegment[] {
  const segments: SnakeSegment[] = [];
  for (let i = 0; i < count; i += 1) {
    segments.push({
      x: head.x - Math.cos(angle) * spacing * i,
      y: head.y - Math.sin(angle) * spacing * i
    });
  }
  return segments;
}

function moveSnake(snake: Snake, config: MatchConfig, dtSeconds: number): void {
  const head = snake.segments[0];
  if (!head) return;
  const speed =
    config.snakeSpeed * (1 + (config.boostSpeedMultiplier - 1) * clamp(snake.boostCharge, 0, 1));

  const nextHead = {
    x: head.x + Math.cos(snake.angle) * speed * dtSeconds,
    y: head.y + Math.sin(snake.angle) * speed * dtSeconds
  };

  snake.segments.unshift(nextHead);
  const targetLength = Math.max(14, Math.floor(snake.mass * 1.95));
  while (snake.segments.length > targetLength) {
    snake.segments.pop();
  }
}

function updateBoostState(snake: Snake, config: MatchConfig, dtSeconds: number, wantsBoost: boolean): void {
  const hasFuel = snake.boostEnergy > 0;
  const shouldBoost = wantsBoost && hasFuel;
  const nextCharge = snake.boostCharge + (shouldBoost ? config.boostRampPerSecond : -config.boostDecayPerSecond) * dtSeconds;
  snake.boostCharge = clamp(nextCharge, 0, 1);

  if (!shouldBoost || snake.boostCharge <= 0) {
    return;
  }

  const drainMultiplier = 0.35 + snake.boostCharge * 0.65;
  snake.boostEnergy = Math.max(0, snake.boostEnergy - config.boostEnergyDrainPerSecond * drainMultiplier * dtSeconds);
  if (snake.boostEnergy === 0) {
    snake.boostCharge = 0;
  }
}

function consumeFood(state: MatchState, rng: () => number): void {
  for (const snake of Object.values(state.snakes)) {
    if (!snake.alive) continue;
    const head = snake.segments[0];
    if (!head) continue;

    const remainingFood: Food[] = [];
    for (const food of state.food) {
      if (distance(head, food) <= state.config.collisionRadius + state.config.foodRadius) {
        snake.mass += food.value;
        snake.boostEnergy = Math.min(
          state.config.maxBoostEnergy,
          snake.boostEnergy + state.config.boostEnergyGainPerFood * food.value
        );
        snake.health = Math.min(100, snake.health + 3);
      } else {
        remainingFood.push(food);
      }
    }
    state.food = remainingFood;
  }

  refillFood(state, rng);
}

function resolveCollisions(state: MatchState): void {
  const snakes = Object.values(state.snakes);
  for (const snake of snakes) {
    if (!snake.alive) continue;
    const head = snake.segments[0];
    if (!head) continue;

    for (const other of snakes) {
      if (other.id === snake.id || !other.alive) continue;
      for (let i = 1; i < other.segments.length; i += 1) {
        const segment = other.segments[i];
        if (segment && distance(head, segment) <= state.config.collisionRadius) {
          killSnake(state, snake);
          break;
        }
      }
      if (!snake.alive) break;
    }
  }
}

function applyArenaDamage(snake: Snake, state: MatchState): void {
  const head = snake.segments[0];
  if (!head) return;
  const outsideBy = distance(head, { x: 0, y: 0 }) - safeRadiusAt(state);
  if (outsideBy <= 0) return;

  const dtSeconds = 1 / state.config.tickRate;
  snake.health -= state.config.arenaDamagePerSecond * dtSeconds * Math.min(3, 1 + outsideBy / 250);
  if (snake.health <= 0) {
    killSnake(state, snake);
  }
}

function killSnake(state: MatchState, snake: Snake): void {
  if (!snake.alive) return;
  snake.alive = false;
  snake.health = 0;
  snake.boostCharge = 0;
  snake.boostEnergy = 0;
  for (let i = 0; i < snake.segments.length; i += 4) {
    const segment = snake.segments[i];
    if (segment) {
      state.food.push({
        id: `drop:${snake.id}:${state.tick}:${i}`,
        x: segment.x,
        y: segment.y,
        value: 2
      });
    }
  }
}

function maybeEndMatch(state: MatchState): void {
  const alive = Object.values(state.snakes).filter((snake) => snake.alive);
  if (alive.length <= 1 || state.elapsedMs >= state.config.durationMs) {
    state.phase = "ended";
    state.placements = rankSnakes(state);
  }
}

function refillFood(state: MatchState, rng: () => number): void {
  while (state.food.length < state.config.initialFood) {
    state.food.push(spawnFood(state, rng));
  }
}

function spawnFood(state: MatchState, rng: () => number): Food {
  const radius = Math.sqrt(rng()) * safeRadiusAt(state) * 0.96;
  const angle = rng() * Math.PI * 2;
  return {
    id: `food:${state.tick}:${state.food.length}:${Math.floor(rng() * 1_000_000)}`,
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    value: 1
  };
}

function cloneState(state: MatchState): MatchState {
  return {
    ...state,
    config: { ...state.config },
    snakes: Object.fromEntries(
      Object.entries(state.snakes).map(([id, snake]) => [
        id,
        {
          ...snake,
          boostEnergy: round(snake.boostEnergy),
          boostCharge: round(snake.boostCharge),
          segments: snake.segments.map((segment) => ({ ...segment }))
        }
      ])
    ),
    food: state.food.map((food) => ({ ...food })),
    placements: state.placements.map((placement) => ({ ...placement }))
  };
}

function createRng(seed: string): () => number {
  let value = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    value ^= seed.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }

  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function normalizeAngle(angle: number): number {
  const full = Math.PI * 2;
  return ((angle % full) + full) % full;
}

function turnToward(current: number, target: number, maxDelta: number): number {
  const delta = angleDelta(current, target);
  if (Math.abs(delta) <= maxDelta) return normalizeAngle(target);
  return normalizeAngle(current + Math.sign(delta) * maxDelta);
}

function angleDelta(current: number, target: number): number {
  const full = Math.PI * 2;
  return ((((target - current) % full) + Math.PI * 3) % full) - Math.PI;
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
