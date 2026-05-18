"use client";

import { Client, type Room } from "colyseus.js";
import type { SnakeRoomSnapshot } from "@/lib/shared";

interface JoinMatchRoomInput {
  matchId: string;
  maxPlayers: number;
  durationSeconds: number;
  playerId: string;
  name: string;
  skinId?: string;
  expectedPlayerIds: string[];
}

let sharedClient: Client | null = null;

export async function joinMatchRoom(input: JoinMatchRoomInput): Promise<Room> {
  const client = getSharedClient();
  return client.joinOrCreate("snake", {
    matchId: input.matchId,
    maxPlayers: input.maxPlayers,
    durationSeconds: input.durationSeconds,
    playerId: normalizePlayerId(input.playerId),
    name: input.name,
    skinId: input.skinId,
    expectedPlayerIds: input.expectedPlayerIds.map(normalizePlayerId)
  });
}

export function getGameServerHttpUrl(): string {
  return process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "http://localhost:2567";
}

export function toSnakeRoomSnapshot(state: unknown): SnakeRoomSnapshot {
  const value = state as Record<string, unknown>;
  return {
    roomId: String(value.roomId ?? ""),
    maxPlayers: Number(value.maxPlayers ?? 0),
    phase: normalizePhase(value.phase),
    seed: String(value.seed ?? ""),
    tick: Number(value.tick ?? 0),
    elapsedMs: Number(value.elapsedMs ?? 0),
    countdownMs: Number(value.countdownMs ?? 0),
    safeRadius: Number(value.safeRadius ?? 0),
    config: normalizeConfig(value.config),
    players: normalizePlayers(value.players),
    snakes: normalizeSnakes(value.snakes),
    food: normalizeArray(value.food).map((entry) => ({
      id: String(entry.id ?? ""),
      x: Number(entry.x ?? 0),
      y: Number(entry.y ?? 0),
      value: Number(entry.value ?? 0)
    })),
    placements: normalizeArray(value.placements).map((entry) => ({
      playerId: String(entry.playerId ?? ""),
      rank: Number(entry.rank ?? 0),
      mass: Number(entry.mass ?? 0),
      survivedMs: Number(entry.survivedMs ?? 0),
      alive: Boolean(entry.alive)
    }))
  };
}

function getSharedClient(): Client {
  if (!sharedClient) {
    sharedClient = new Client(toWebSocketUrl(getGameServerHttpUrl()));
  }

  return sharedClient;
}

function toWebSocketUrl(url: string): string {
  if (url.startsWith("ws://") || url.startsWith("wss://")) {
    return url;
  }

  if (url.startsWith("https://")) {
    return `wss://${url.slice("https://".length)}`;
  }

  if (url.startsWith("http://")) {
    return `ws://${url.slice("http://".length)}`;
  }

  return `ws://${url}`;
}

function normalizePhase(value: unknown): SnakeRoomSnapshot["phase"] {
  return value === "countdown" || value === "running" || value === "settling" || value === "ended"
    ? value
    : "lobby";
}

function normalizeConfig(value: unknown): SnakeRoomSnapshot["config"] {
  const config = (value as Record<string, unknown> | undefined) ?? {};
  return {
    durationMs: Number(config.durationMs ?? 0),
    tickRate: Number(config.tickRate ?? 20),
    worldRadius: Number(config.worldRadius ?? 0),
    initialSafeRadius: Number(config.initialSafeRadius ?? 0),
    finalSafeRadius: Number(config.finalSafeRadius ?? 0),
    initialFood: Number(config.initialFood ?? 0),
    snakeSpeed: Number(config.snakeSpeed ?? 0),
    initialBoostEnergy: Number(config.initialBoostEnergy ?? 0),
    maxBoostEnergy: Number(config.maxBoostEnergy ?? 0),
    boostEnergyGainPerFood: Number(config.boostEnergyGainPerFood ?? 0),
    boostSpeedMultiplier: Number(config.boostSpeedMultiplier ?? 0),
    boostEnergyDrainPerSecond: Number(config.boostEnergyDrainPerSecond ?? 0),
    boostRampPerSecond: Number(config.boostRampPerSecond ?? 0),
    boostDecayPerSecond: Number(config.boostDecayPerSecond ?? 0),
    turnRateRadiansPerSecond: Number(config.turnRateRadiansPerSecond ?? 0),
    segmentSpacing: Number(config.segmentSpacing ?? 0),
    collisionRadius: Number(config.collisionRadius ?? 0),
    foodRadius: Number(config.foodRadius ?? 0),
    arenaDamagePerSecond: Number(config.arenaDamagePerSecond ?? 0)
  };
}

function normalizePlayers(value: unknown): SnakeRoomSnapshot["players"] {
  const entries = normalizeEntries(value);
  return Object.fromEntries(
    entries.map(([key, player]) => [
      key,
      {
        id: String(player.id ?? key),
        name: String(player.name ?? "Player"),
        connected: Boolean(player.connected),
        skinId: typeof player.skinId === "string" ? player.skinId : undefined
      }
    ])
  );
}

function normalizeSnakes(value: unknown): SnakeRoomSnapshot["snakes"] {
  const entries = normalizeEntries(value);
  return Object.fromEntries(
    entries.map(([key, snake]) => [
      key,
      {
        id: String(snake.id ?? key),
        name: String(snake.name ?? "Snake"),
        angle: Number(snake.angle ?? 0),
        mass: Number(snake.mass ?? 0),
        boostEnergy: Number(snake.boostEnergy ?? 0),
        boostCharge: Number(snake.boostCharge ?? 0),
        health: Number(snake.health ?? 0),
        alive: Boolean(snake.alive),
        survivedMs: Number(snake.survivedMs ?? 0),
        segments: normalizeArray(snake.segments).map((segment) => ({
          x: Number(segment.x ?? 0),
          y: Number(segment.y ?? 0)
        }))
      }
    ])
  );
}

function normalizeEntries(value: unknown): Array<[string, Record<string, unknown>]> {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (value instanceof Map) {
    return Array.from(value.entries()).map(([key, entry]) => [String(key), asRecord(entry)]);
  }

  if ("entries" in (value as Record<string, unknown>) && typeof (value as { entries?: unknown }).entries === "function") {
    return Array.from((value as { entries: () => Iterable<[unknown, unknown]> }).entries()).map(([key, entry]) => [
      String(key),
      asRecord(entry)
    ]);
  }

  return Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, asRecord(entry)]);
}

function normalizeArray(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(asRecord);
  }

  if (Symbol.iterator in value) {
    return Array.from(value as Iterable<unknown>, asRecord);
  }

  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizePlayerId(value: string): string {
  return value.trim().toLowerCase();
}
