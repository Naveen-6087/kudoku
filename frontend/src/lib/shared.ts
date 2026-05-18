export const KUDOKU_CHAIN_ID = 84532;
export const DEFAULT_PLATFORM_FEE_BPS = 300;
export const ESCROW_MATCH_STATUSES = ["Lobby", "Ready", "InProgress", "Settled", "Cancelled"] as const;
export const ESCROW_READY_COUNTDOWN_SECONDS = 5;

export const MATCH_DURATIONS_SECONDS = [60, 180, 300] as const;
export const MATCH_SIZE_PRESETS = [3, 4, 6, 12] as const;
export const BUY_IN_BRACKETS_ETH = ["0.001", "0.005", "0.01", "0.05"] as const;

export type MatchPhase = "lobby" | "countdown" | "running" | "settling" | "ended";
export type EscrowMatchStatus = (typeof ESCROW_MATCH_STATUSES)[number];

export interface RoomConfig {
  maxPlayers: number;
  durationSeconds: number;
  buyInWei?: string;
}

export interface RoomVec2 {
  x: number;
  y: number;
}

export type RoomSnakeSegment = RoomVec2;

export interface RoomFood extends RoomVec2 {
  id: string;
  value: number;
}

export interface RoomSnake {
  id: string;
  name: string;
  angle: number;
  mass: number;
  boostEnergy: number;
  boostCharge: number;
  health: number;
  alive: boolean;
  survivedMs: number;
  segments: RoomSnakeSegment[];
}

export interface RoomPlacement {
  playerId: string;
  rank: number;
  mass: number;
  survivedMs: number;
  alive: boolean;
}

export interface MatchConfigSnapshot {
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

export interface RoomPlayerPresence {
  id: string;
  name: string;
  connected: boolean;
  skinId?: string;
}

export interface SnakeRoomSnapshot {
  roomId: string;
  maxPlayers: number;
  phase: MatchPhase;
  seed: string;
  tick: number;
  elapsedMs: number;
  countdownMs: number;
  safeRadius: number;
  config: MatchConfigSnapshot;
  players: Record<string, RoomPlayerPresence>;
  snakes: Record<string, RoomSnake>;
  food: RoomFood[];
  placements: RoomPlacement[];
}

export interface PlayerInputMessage {
  playerId: string;
  sequence: number;
  angleRadians: number;
  boosting?: boolean;
  clientTimeMs: number;
}

export interface MatchResultSummary {
  matchId: string;
  seedCommitment: string;
  seedReveal?: string;
  finalStateHash: string;
  inputLogHash: string;
  placements: Array<{
    playerId: string;
    address?: string;
    rank: number;
    mass: number;
    survivedMs: number;
  }>;
}

export interface EscrowMatchView {
  creator: string;
  stakeWei: string;
  maxPlayers: number;
  platformFeeBps: number;
  status: EscrowMatchStatus;
  resultHash: string;
  isPrivate: boolean;
  roomCodeHash: string;
  readyAt: number;
  startedAt: number;
  players: string[];
}
