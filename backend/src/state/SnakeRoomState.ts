import {
  ArraySchema,
  MapSchema,
  Schema,
  type as schemaType
} from "@colyseus/schema";
import {
  DEFAULT_MATCH_CONFIG,
  matchConfigForPlayers,
  safeRadiusAt,
  type Food,
  type MatchConfig,
  type MatchState,
  type Placement,
  type Snake,
  type SnakeSegment
} from "../lib/game-core.js";
import type { MatchPhase, RoomConfig } from "../lib/shared.js";

export class SegmentState extends Schema {
  @schemaType("number") declare x: number;
  @schemaType("number") declare y: number;

  constructor(x = 0, y = 0) {
    super();
    this.x = x;
    this.y = y;
  }
}

export class FoodState extends Schema {
  @schemaType("string") declare id: string;
  @schemaType("number") declare x: number;
  @schemaType("number") declare y: number;
  @schemaType("number") declare value: number;

  constructor(id = "", x = 0, y = 0, value = 0) {
    super();
    this.id = id;
    this.x = x;
    this.y = y;
    this.value = value;
  }
}

export class SnakeState extends Schema {
  @schemaType("string") declare id: string;
  @schemaType("string") declare name: string;
  @schemaType("number") declare angle: number;
  @schemaType("number") declare mass: number;
  @schemaType("number") declare boostEnergy: number;
  @schemaType("number") declare boostCharge: number;
  @schemaType("number") declare health: number;
  @schemaType("boolean") declare alive: boolean;
  @schemaType("number") declare survivedMs: number;
  @schemaType([SegmentState]) segments = new ArraySchema<SegmentState>();

  constructor() {
    super();
    this.id = "";
    this.name = "";
    this.angle = 0;
    this.mass = 0;
    this.boostEnergy = 0;
    this.boostCharge = 0;
    this.health = 0;
    this.alive = true;
    this.survivedMs = 0;
  }
}

export class PlacementState extends Schema {
  @schemaType("string") declare playerId: string;
  @schemaType("number") declare rank: number;
  @schemaType("number") declare mass: number;
  @schemaType("number") declare survivedMs: number;
  @schemaType("boolean") declare alive: boolean;

  constructor() {
    super();
    this.playerId = "";
    this.rank = 0;
    this.mass = 0;
    this.survivedMs = 0;
    this.alive = false;
  }
}

export class PlayerPresenceState extends Schema {
  @schemaType("string") declare id: string;
  @schemaType("string") declare name: string;
  @schemaType("boolean") declare connected: boolean;
  @schemaType("string") declare skinId: string;

  constructor(id = "", name = "", connected = true, skinId = "") {
    super();
    this.id = id;
    this.name = name;
    this.connected = connected;
    this.skinId = skinId;
  }
}

export class MatchConfigState extends Schema {
  @schemaType("number") declare durationMs: number;
  @schemaType("number") declare tickRate: number;
  @schemaType("number") declare worldRadius: number;
  @schemaType("number") declare initialSafeRadius: number;
  @schemaType("number") declare finalSafeRadius: number;
  @schemaType("number") declare initialFood: number;
  @schemaType("number") declare snakeSpeed: number;
  @schemaType("number") declare initialBoostEnergy: number;
  @schemaType("number") declare maxBoostEnergy: number;
  @schemaType("number") declare boostEnergyGainPerFood: number;
  @schemaType("number") declare boostSpeedMultiplier: number;
  @schemaType("number") declare boostEnergyDrainPerSecond: number;
  @schemaType("number") declare boostRampPerSecond: number;
  @schemaType("number") declare boostDecayPerSecond: number;
  @schemaType("number") declare turnRateRadiansPerSecond: number;
  @schemaType("number") declare segmentSpacing: number;
  @schemaType("number") declare collisionRadius: number;
  @schemaType("number") declare foodRadius: number;
  @schemaType("number") declare arenaDamagePerSecond: number;

  constructor() {
    super();
    this.durationMs = DEFAULT_MATCH_CONFIG.durationMs;
    this.tickRate = DEFAULT_MATCH_CONFIG.tickRate;
    this.worldRadius = DEFAULT_MATCH_CONFIG.worldRadius;
    this.initialSafeRadius = DEFAULT_MATCH_CONFIG.initialSafeRadius;
    this.finalSafeRadius = DEFAULT_MATCH_CONFIG.finalSafeRadius;
    this.initialFood = DEFAULT_MATCH_CONFIG.initialFood;
    this.snakeSpeed = DEFAULT_MATCH_CONFIG.snakeSpeed;
    this.initialBoostEnergy = DEFAULT_MATCH_CONFIG.initialBoostEnergy;
    this.maxBoostEnergy = DEFAULT_MATCH_CONFIG.maxBoostEnergy;
    this.boostEnergyGainPerFood = DEFAULT_MATCH_CONFIG.boostEnergyGainPerFood;
    this.boostSpeedMultiplier = DEFAULT_MATCH_CONFIG.boostSpeedMultiplier;
    this.boostEnergyDrainPerSecond = DEFAULT_MATCH_CONFIG.boostEnergyDrainPerSecond;
    this.boostRampPerSecond = DEFAULT_MATCH_CONFIG.boostRampPerSecond;
    this.boostDecayPerSecond = DEFAULT_MATCH_CONFIG.boostDecayPerSecond;
    this.turnRateRadiansPerSecond = DEFAULT_MATCH_CONFIG.turnRateRadiansPerSecond;
    this.segmentSpacing = DEFAULT_MATCH_CONFIG.segmentSpacing;
    this.collisionRadius = DEFAULT_MATCH_CONFIG.collisionRadius;
    this.foodRadius = DEFAULT_MATCH_CONFIG.foodRadius;
    this.arenaDamagePerSecond = DEFAULT_MATCH_CONFIG.arenaDamagePerSecond;
  }
}

export class SnakeRoomState extends Schema {
  @schemaType("string") declare roomId: string;
  @schemaType("number") declare maxPlayers: number;
  @schemaType("string") declare phase: MatchPhase;
  @schemaType("string") declare seed: string;
  @schemaType("number") declare tick: number;
  @schemaType("number") declare elapsedMs: number;
  @schemaType("number") declare countdownMs: number;
  @schemaType("number") declare safeRadius: number;
  @schemaType(MatchConfigState) config = new MatchConfigState();
  @schemaType({ map: PlayerPresenceState }) players = new MapSchema<PlayerPresenceState>();
  @schemaType({ map: SnakeState }) snakes = new MapSchema<SnakeState>();
  @schemaType([FoodState]) food = new ArraySchema<FoodState>();
  @schemaType([PlacementState]) placements = new ArraySchema<PlacementState>();

  constructor() {
    super();
    this.roomId = "";
    this.maxPlayers = 0;
    this.phase = "lobby";
    this.seed = "";
    this.tick = 0;
    this.elapsedMs = 0;
    this.countdownMs = 0;
    this.safeRadius = DEFAULT_MATCH_CONFIG.initialSafeRadius;
  }
}

export function createInitialRoomState(roomId: string, roomConfig: RoomConfig): SnakeRoomState {
  const state = new SnakeRoomState();
  state.roomId = roomId;
  state.maxPlayers = roomConfig.maxPlayers;
  state.phase = "lobby";
  assignConfig(state.config, matchConfigForPlayers(roomConfig.maxPlayers, { durationMs: roomConfig.durationSeconds * 1_000 }));
  state.safeRadius = state.config.initialSafeRadius;
  return state;
}

export function syncPresence(
  state: SnakeRoomState,
  playerId: string,
  values: { name: string; connected: boolean; skinId?: string }
): void {
  const existing = state.players.get(playerId) ?? new PlayerPresenceState();
  existing.id = playerId;
  existing.name = values.name;
  existing.connected = values.connected;
  existing.skinId = values.skinId ?? "";
  state.players.set(playerId, existing);
}

export function removePresence(state: SnakeRoomState, playerId: string): void {
  state.players.delete(playerId);
}

export function syncMatchState(state: SnakeRoomState, match: MatchState): void {
  state.seed = match.seed;
  state.tick = match.tick;
  state.elapsedMs = match.elapsedMs;
  assignConfig(state.config, match.config);
  state.safeRadius = safeRadiusAt(match);

  syncMapSchema(
    state.snakes,
    match.snakes,
    () => new SnakeState(),
    assignSnake
  );
  syncArraySchema(state.food, match.food, () => new FoodState(), assignFood);
  syncArraySchema(state.placements, match.placements, () => new PlacementState(), assignPlacement);
}

export function resetMatchState(state: SnakeRoomState): void {
  state.seed = "";
  state.tick = 0;
  state.elapsedMs = 0;
  state.safeRadius = state.config.initialSafeRadius;
  state.snakes.clear();
  state.food.splice(0, state.food.length);
  state.placements.splice(0, state.placements.length);
}

function assignConfig(target: MatchConfigState, source: MatchConfig): void {
  target.durationMs = source.durationMs;
  target.tickRate = source.tickRate;
  target.worldRadius = source.worldRadius;
  target.initialSafeRadius = source.initialSafeRadius;
  target.finalSafeRadius = source.finalSafeRadius;
  target.initialFood = source.initialFood;
  target.snakeSpeed = source.snakeSpeed;
  target.initialBoostEnergy = source.initialBoostEnergy;
  target.maxBoostEnergy = source.maxBoostEnergy;
  target.boostEnergyGainPerFood = source.boostEnergyGainPerFood;
  target.boostSpeedMultiplier = source.boostSpeedMultiplier;
  target.boostEnergyDrainPerSecond = source.boostEnergyDrainPerSecond;
  target.boostRampPerSecond = source.boostRampPerSecond;
  target.boostDecayPerSecond = source.boostDecayPerSecond;
  target.turnRateRadiansPerSecond = source.turnRateRadiansPerSecond;
  target.segmentSpacing = source.segmentSpacing;
  target.collisionRadius = source.collisionRadius;
  target.foodRadius = source.foodRadius;
  target.arenaDamagePerSecond = source.arenaDamagePerSecond;
}

function assignSnake(target: SnakeState, source: Snake): void {
  target.id = source.id;
  target.name = source.name;
  target.angle = source.angle;
  target.mass = source.mass;
  target.boostEnergy = source.boostEnergy;
  target.boostCharge = source.boostCharge;
  target.health = source.health;
  target.alive = source.alive;
  target.survivedMs = source.survivedMs;
  syncArraySchema(target.segments, source.segments, () => new SegmentState(), assignSegment);
}

function assignSegment(target: SegmentState, source: SnakeSegment): void {
  target.x = source.x;
  target.y = source.y;
}

function assignFood(target: FoodState, source: Food): void {
  target.id = source.id;
  target.x = source.x;
  target.y = source.y;
  target.value = source.value;
}

function assignPlacement(target: PlacementState, source: Placement): void {
  target.playerId = source.playerId;
  target.rank = source.rank;
  target.mass = source.mass;
  target.survivedMs = source.survivedMs;
  target.alive = source.alive;
}

function syncMapSchema<TSource, TTarget extends Schema>(
  target: MapSchema<TTarget>,
  source: Record<string, TSource>,
  createItem: () => TTarget,
  assignItem: (targetItem: TTarget, sourceItem: TSource) => void
): void {
  const sourceKeys = new Set(Object.keys(source));

  for (const existingKey of target.keys()) {
    if (!sourceKeys.has(existingKey)) {
      target.delete(existingKey);
    }
  }

  for (const [key, value] of Object.entries(source)) {
    const item = target.get(key) ?? createItem();
    assignItem(item, value);
    target.set(key, item);
  }
}

function syncArraySchema<TSource, TTarget extends Schema>(
  target: ArraySchema<TTarget>,
  source: TSource[],
  createItem: () => TTarget,
  assignItem: (targetItem: TTarget, sourceItem: TSource) => void
): void {
  while (target.length > source.length) {
    target.pop();
  }

  source.forEach((value, index) => {
    let item = target[index];
    if (!item) {
      item = createItem();
      target.push(item);
    }

    assignItem(item, value);
  });
}
