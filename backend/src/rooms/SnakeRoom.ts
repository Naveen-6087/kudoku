import type { Client } from "colyseus";
import { Room } from "colyseus";
import { createMatch, stepMatch, type MatchState, type PlayerInput } from "../lib/game-core.js";
import type { PlayerInputMessage, RoomConfig } from "../lib/shared.js";
import {
  createInitialRoomState,
  removePresence,
  SnakeRoomState,
  syncMatchState,
  syncPresence
} from "../state/SnakeRoomState.js";

interface JoinOptions extends Partial<RoomConfig> {
  matchId?: string;
  expectedPlayerIds?: string[];
  playerId?: string;
  name?: string;
}

interface SyncRosterMessage {
  expectedPlayerIds?: string[];
  maxPlayers?: number;
  name?: string;
}

interface PlayerSession {
  playerId: string;
  name: string;
  connected: boolean;
}

const COUNTDOWN_MS = 5_000;
const MIN_PLAYERS_TO_START = 2;
const RECONNECT_WINDOW_SECONDS = 20;
const SUPPORTED_ROOM_SIZES = new Set([3, 4, 6, 12]);

export class SnakeRoom extends Room<SnakeRoomState> {
  maxClients = 12;
  private readonly pendingInputs = new Map<string, PlayerInput>();
  private readonly sessions = new Map<string, PlayerSession>();
  private readonly roster = new Map<string, PlayerSession>();
  private readonly expectedPlayerIds = new Set<string>();
  private match: MatchState | null = null;
  private hasLoop = false;
  private countdownDeadlineAt = 0;
  private countdownIntervalActive = false;
  private matchKey = "match";

  onCreate(options: JoinOptions) {
    const roomConfig = resolveRoomConfig(options);
    this.matchKey = sanitizeMatchKey(options.matchId);
    this.maxClients = roomConfig.maxPlayers;
    this.setMetadata({ matchId: this.matchKey });
    this.setState(createInitialRoomState(this.matchKey, roomConfig));
    this.setPatchRate(100);
    this.syncExpectedPlayers(options.expectedPlayerIds, roomConfig.maxPlayers);

    this.onMessage("input", (client, message: PlayerInputMessage) => {
      const session = this.sessions.get(client.sessionId);
      if (!session || message.playerId !== session.playerId || this.state.phase !== "running") {
        return;
      }

      this.pendingInputs.set(session.playerId, {
        playerId: session.playerId,
        angleRadians: sanitizeAngle(message.angleRadians),
        boosting: Boolean(message.boosting)
      });
    });

    this.onMessage("sync-roster", (client, message: SyncRosterMessage) => {
      const session = this.sessions.get(client.sessionId);
      if (!session) {
        return;
      }

      if (message.name) {
        const nextName = sanitizeName(message.name);
        session.name = nextName;
        const rosterSession = this.roster.get(session.playerId);
        if (rosterSession) {
          rosterSession.name = nextName;
        }
        syncPresence(this.state, session.playerId, {
          name: nextName,
          connected: true
        });
      }

      this.syncExpectedPlayers(message.expectedPlayerIds, Number(message.maxPlayers ?? this.maxClients));
      this.tryStartCountdown();
    });

    this.onMessage("begin-match", () => {
      if (this.state.phase !== "countdown" || this.state.countdownMs > 0) {
        return;
      }

      this.beginMatch();
    });
  }

  onJoin(client: Client, options: JoinOptions) {
    const roomConfig = resolveRoomConfig(options);
    this.maxClients = roomConfig.maxPlayers;
    this.state.maxPlayers = roomConfig.maxPlayers;
    this.syncExpectedPlayers(options.expectedPlayerIds, roomConfig.maxPlayers);

    const playerId = sanitizePlayerId(options.playerId ?? client.sessionId);
    const existingSession = this.roster.get(playerId);
    if (existingSession) {
      if (existingSession.connected) {
        throw new Error("player already joined");
      }

      const nextName = sanitizeName(options.name ?? existingSession.name);
      existingSession.connected = true;
      existingSession.name = nextName;
      this.sessions.set(client.sessionId, existingSession);
      syncPresence(this.state, playerId, {
        name: nextName,
        connected: true
      });
      this.tryStartCountdown();
      return;
    }

    if (!this.canPlayerJoin(playerId)) {
      throw new Error("player not in on-chain roster");
    }

    if (this.state.phase === "running" || this.state.phase === "ended") {
      throw new Error("match already started");
    }

    const session: PlayerSession = {
      playerId,
      name: sanitizeName(options.name ?? `Snake ${this.roster.size + 1}`),
      connected: true
    };

    this.sessions.set(client.sessionId, session);
    this.roster.set(playerId, session);
    syncPresence(this.state, playerId, {
      name: session.name,
      connected: true
    });

    this.tryStartCountdown();
  }

  async onLeave(client: Client, consented: boolean) {
    const session = this.sessions.get(client.sessionId);
    if (!session) {
      return;
    }

    this.sessions.delete(client.sessionId);
    this.pendingInputs.delete(session.playerId);

    if (!consented) {
      syncPresence(this.state, session.playerId, {
        name: session.name,
        connected: false
      });

      const player = this.roster.get(session.playerId);
      if (player) {
        player.connected = false;
      }

      try {
        const reconnectedClient = await this.allowReconnection(client, RECONNECT_WINDOW_SECONDS);
        this.sessions.set(reconnectedClient.sessionId, {
          playerId: session.playerId,
          name: session.name,
          connected: true
        });

        const rosterSession = this.roster.get(session.playerId);
        if (rosterSession) {
          rosterSession.connected = true;
        }

        syncPresence(this.state, session.playerId, {
          name: session.name,
          connected: true
        });
        this.tryStartCountdown();
        return;
      } catch {
        // Reconnection window expired, cleanup continues below.
      }
    }

    const rosterSession = this.roster.get(session.playerId);
    if (rosterSession) {
      rosterSession.connected = false;
    }

    if (this.expectedPlayerIds.has(session.playerId)) {
      syncPresence(this.state, session.playerId, {
        name: session.name,
        connected: false
      });
    } else {
      this.roster.delete(session.playerId);
      removePresence(this.state, session.playerId);
    }

    this.tryStartCountdown();
  }

  onDispose() {
    if (this.countdownIntervalActive || this.hasLoop) {
      this.clock.clear();
      this.countdownIntervalActive = false;
      this.hasLoop = false;
    }
  }

  private tryStartCountdown(): void {
    if (this.state.phase === "running" || this.state.phase === "ended") {
      return;
    }

    const expectedCount = this.expectedPlayerCount();
    const connectedPlayers = this.connectedRoster();
    const fullLobbyConnected =
      expectedCount >= MIN_PLAYERS_TO_START &&
      expectedCount === this.maxClients &&
      connectedPlayers.length === expectedCount;

    if (!fullLobbyConnected) {
      this.cancelCountdown();
      return;
    }

    if (this.state.phase === "countdown" && this.countdownIntervalActive) {
      return;
    }

    this.state.phase = "countdown";
    this.countdownDeadlineAt = Date.now() + COUNTDOWN_MS;
    this.state.countdownMs = COUNTDOWN_MS;

    if (!this.countdownIntervalActive) {
      this.clock.start();
      this.clock.setInterval(() => {
        if (this.state.phase !== "countdown") {
          return;
        }

        const remaining = Math.max(0, this.countdownDeadlineAt - Date.now());
        this.state.countdownMs = remaining;
      }, 250);
      this.countdownIntervalActive = true;
    }
  }

  private cancelCountdown(): void {
    if (this.state.phase === "running" || this.state.phase === "ended") {
      return;
    }

    this.state.phase = "lobby";
    this.state.countdownMs = 0;
    this.countdownDeadlineAt = 0;
  }

  private beginMatch(): void {
    const players = this.connectedRoster();
    if (
      this.state.phase === "running" ||
      this.expectedPlayerCount() !== this.maxClients ||
      players.length !== this.maxClients ||
      players.length < MIN_PLAYERS_TO_START
    ) {
      return;
    }

    this.lock();
    this.countdownDeadlineAt = 0;
    this.state.countdownMs = 0;
    this.state.phase = "running";
    this.match = createMatch(
      players.map((player) => ({
        id: player.playerId,
        name: player.name
      })),
      `match:${this.matchKey}:${Date.now()}`,
      {
        durationMs: this.state.config.durationMs
      }
    );
    syncMatchState(this.state, this.match);

    if (this.hasLoop) {
      return;
    }

    this.clock.start();
    this.clock.setInterval(() => {
      if (!this.match || this.state.phase !== "running") {
        return;
      }

      const next = stepMatch(this.match, Array.from(this.pendingInputs.values()));
      this.pendingInputs.clear();
      this.match = next;
      syncMatchState(this.state, next);

      if (next.phase === "ended") {
        this.state.phase = "ended";
      }
    }, 1000 / this.state.config.tickRate);
    this.hasLoop = true;
  }

  private syncExpectedPlayers(playerIds: string[] | undefined, maxPlayers: number): void {
    const nextMaxPlayers = resolveMaxPlayers(maxPlayers);
    this.maxClients = nextMaxPlayers;
    this.state.maxPlayers = nextMaxPlayers;

    if (!playerIds) {
      return;
    }

    for (const playerId of playerIds) {
      const sanitized = sanitizePlayerId(playerId);
      if (!sanitized) {
        continue;
      }
      this.expectedPlayerIds.add(sanitized);
      const existing = this.roster.get(sanitized);
      if (existing) {
        syncPresence(this.state, sanitized, {
          name: existing.name,
          connected: existing.connected
        });
      }
    }
  }

  private canPlayerJoin(playerId: string): boolean {
    return this.expectedPlayerIds.size === 0 || this.expectedPlayerIds.has(playerId);
  }

  private expectedPlayerCount(): number {
    return this.expectedPlayerIds.size > 0 ? this.expectedPlayerIds.size : this.maxClients;
  }

  private connectedRoster(): PlayerSession[] {
    return Array.from(this.roster.values()).filter((player) => player.connected);
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function sanitizeAngle(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function sanitizeName(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 24) : "Snake";
}

function sanitizePlayerId(value: string): string {
  const normalized = value.trim().toLowerCase();
  const cleaned = normalized.replace(/[^a-z0-9:_-]/g, "").slice(0, 64);
  return cleaned.length > 0 ? cleaned : "player";
}

function sanitizeMatchKey(value: string | undefined): string {
  const cleaned = (value ?? "match").trim().replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 64);
  return cleaned.length > 0 ? cleaned : "match";
}

function resolveMaxPlayers(value: number): number {
  const normalized = clamp(Number(value), 3, 12);
  return SUPPORTED_ROOM_SIZES.has(normalized) ? normalized : 4;
}

function resolveRoomConfig(options: JoinOptions): RoomConfig {
  const roomConfig: RoomConfig = {
    maxPlayers: resolveMaxPlayers(Number(options.maxPlayers ?? 4)),
    durationSeconds: clamp(Number(options.durationSeconds ?? 180), 60, 300)
  };

  if (options.buyInWei) {
    roomConfig.buyInWei = options.buyInWei;
  }

  return roomConfig;
}
