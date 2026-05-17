"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createMatch,
  DEFAULT_MATCH_CONFIG,
  orderPlacements,
  safeRadiusAt,
  stepMatch,
  type MatchState,
  type PlayerInput,
  type Placement,
  type Snake
} from "@/lib/game/core";
import {
  getBotSkinId,
  getSnakeSkin,
  readPlayerProfile,
  type PlayerProfile,
  type SnakeSkinId
} from "@/lib/player-profile";
import { type WalletProvider } from "@/lib/escrow/client";
import { GameCanvas, type ArenaRenderState } from "./game-canvas";
import { ZkProofPanel } from "./zk-proof-panel";

type GameMode = "practice" | "stake";

export interface GameParticipant {
  id: string;
  name: string;
}

interface GameShellProps {
  mode: GameMode;
  matchId?: string;
  stakeEth?: string;
  maxPlayers?: number;
  durationSeconds?: number;
  participants?: GameParticipant[];
  localPlayerId?: string;
  escrowAddress?: `0x${string}` | null;
  walletProvider?: WalletProvider | null;
  joinedPlayerAddresses?: `0x${string}`[];
  externalRenderState?: ArenaRenderState | null;
  externalStatusMessage?: string;
  onLiveInput?: (input: { angleRadians: number; boosting: boolean }) => void;
}

const PRACTICE_PLAYERS = 6;
const BOT_NAMES = [
  "Ember Fang",
  "Ash Coil",
  "Gold Viper",
  "Blitz Tail",
  "Nova Scale",
  "Magma Bite",
  "Solar Fang",
  "Dune Coil"
] as const;
const HUD_SYNC_INTERVAL_TICKS = 4;
const MAX_LEADERBOARD_ENTRIES = 10;
const PLAYER_LABEL_DURATION_MS = 10_000;

export function GameShell({
  mode,
  matchId,
  stakeEth,
  maxPlayers = 4,
  durationSeconds = 180,
  participants,
  localPlayerId,
  escrowAddress,
  walletProvider,
  joinedPlayerAddresses,
  externalRenderState,
  externalStatusMessage,
  onLiveInput
}: GameShellProps) {
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(null);
  const [uiState, setUiState] = useState<ArenaRenderState>(createEmptyRenderState());
  const [runNonce, setRunNonce] = useState(0);
  const [statusMessage, setStatusMessage] = useState(mode === "practice" ? "Boost with left click or Space." : "Room synced from escrow.");

  const renderStateRef = useRef<ArenaRenderState>(createEmptyRenderState());
  const currentPlayerIdRef = useRef("");
  const pointerAngleRef = useRef(-Math.PI / 2);
  const boostActiveRef = useRef(false);
  const snakeSkinIdsRef = useRef<Record<string, SnakeSkinId>>({});
  const matchRef = useRef<MatchState | null>(null);

  const resolvedMaxPlayers = clampNumber(
    participants?.length && participants.length > 0 ? participants.length : mode === "practice" ? PRACTICE_PLAYERS : maxPlayers,
    3,
    24
  );
  const resolvedDuration = clampNumber(durationSeconds, 60, 300);

  useEffect(() => {
    const profile = readPlayerProfile();
    setPlayerProfile(profile);
    currentPlayerIdRef.current = localPlayerId ?? profile.id;
  }, [localPlayerId]);

  useEffect(() => {
    if (externalRenderState) {
      return;
    }

    if (!playerProfile) {
      return;
    }

    const resolvedLocalPlayerId = localPlayerId ?? playerProfile.id;
    const nextParticipants = buildParticipants({
      mode,
      maxPlayers: resolvedMaxPlayers,
      playerProfile,
      localPlayerId: resolvedLocalPlayerId,
      participants
    });

    currentPlayerIdRef.current = resolvedLocalPlayerId;
    snakeSkinIdsRef.current = buildSnakeSkinMap(playerProfile, nextParticipants, resolvedLocalPlayerId);
    const nextMatch = createMatch(nextParticipants, `${mode}:${matchId ?? "local"}:${runNonce}`, {
      durationMs: resolvedDuration * 1_000,
      initialFood: Math.min(DEFAULT_MATCH_CONFIG.initialFood, 220)
    });

    matchRef.current = nextMatch;
    renderStateRef.current = renderFromMatch(nextMatch);
    setUiState(renderStateRef.current);
    setStatusMessage(
      mode === "practice" ? "Boost with left click or Space." : `Stake room ${matchId ?? "preview"} live.`
    );

    const interval = window.setInterval(() => {
      const currentMatch = matchRef.current;
      if (!currentMatch || currentMatch.phase === "ended") {
        return;
      }

      const next = stepMatch(
        currentMatch,
        buildLocalInputs(currentMatch, currentPlayerIdRef.current, pointerAngleRef.current, boostActiveRef.current)
      );
      matchRef.current = next;
      renderStateRef.current = renderFromMatch(next);
      if (next.phase === "ended" || next.tick % HUD_SYNC_INTERVAL_TICKS === 0) {
        setUiState(renderStateRef.current);
      }

      if (next.phase === "ended") {
        setStatusMessage(mode === "practice" ? "Run finished." : "Match ended. Proofs and settlement are ready.");
      }
    }, 1000 / nextMatch.config.tickRate);

    return () => {
      window.clearInterval(interval);
    };
  }, [externalRenderState, localPlayerId, matchId, mode, participants, playerProfile, resolvedDuration, resolvedMaxPlayers, runNonce]);

  useEffect(() => {
    if (!externalRenderState) {
      return;
    }

    renderStateRef.current = externalRenderState;
    setUiState(externalRenderState);
  }, [externalRenderState]);

  useEffect(() => {
    if (!externalStatusMessage) {
      return;
    }

    setStatusMessage(externalStatusMessage);
  }, [externalStatusMessage]);

  useEffect(() => {
    if (!onLiveInput) {
      return;
    }

    const interval = window.setInterval(() => {
      onLiveInput({
        angleRadians: pointerAngleRef.current,
        boosting: boostActiveRef.current
      });
    }, 50);

    return () => {
      window.clearInterval(interval);
    };
  }, [onLiveInput]);

  const currentSnake =
    uiState.snakes[currentPlayerIdRef.current] ?? Object.values(uiState.snakes)[0] ?? null;
  const placements = useMemo(() => orderPlacements(uiState.placements), [uiState.placements]);
  const leaderboard = placements
    .filter((placement) => uiState.snakes[placement.playerId]?.alive)
    .slice(0, MAX_LEADERBOARD_ENTRIES)
    .map((placement) => buildLeaderboardRow(placement, uiState.snakes[placement.playerId]));
  const currentPlacement = placements.find((placement) => placement.playerId === currentPlayerIdRef.current) ?? null;
  const podium = placements.slice(0, 3).map((placement) => buildLeaderboardRow(placement, uiState.snakes[placement.playerId]));
  const matchProgress = clampRatio(uiState.elapsedMs, roomSummaryDurationMs(resolvedDuration));
  const timeLeftSeconds = Math.max(0, Math.ceil((roomSummaryDurationMs(resolvedDuration) - uiState.elapsedMs) / 1_000));
  const currentSkin = getSnakeSkin(
    snakeSkinIdsRef.current[currentPlayerIdRef.current] ?? playerProfile?.skinId
  );
  const currentLength = Math.round(currentSnake?.mass ?? 0);
  const boostFuel = currentSnake ? Math.round((currentSnake.boostEnergy / uiState.config.maxBoostEnergy) * 100) : 0;

  const roomSummary = useMemo(
    () => ({
      stakeEth: stakeEth ?? (mode === "stake" ? "0.005" : undefined),
      matchId,
      maxPlayers: resolvedMaxPlayers,
      durationSeconds: resolvedDuration
    }),
    [matchId, mode, resolvedDuration, resolvedMaxPlayers, stakeEth]
  );

  return (
    <main className="arena-shell arena-shell--focused">
      <section className="arena-stage arena-stage--fullscreen">
        <GameCanvas
          boostActiveRef={boostActiveRef}
          currentPlayerIdRef={currentPlayerIdRef}
          pointerAngleRef={pointerAngleRef}
          renderStateRef={renderStateRef}
          snakeSkinIdsRef={snakeSkinIdsRef}
        />

        <Link className="arena-back-link arena-hud-link" href={mode === "practice" ? "/" : "/play"}>
          {mode === "practice" ? "Back home" : "Back to room setup"}
        </Link>

        <div className="arena-overlay arena-overlay--top-left" aria-hidden="true">
          <div className="arena-meta-line">
            <span>{mode === "practice" ? "Practice" : "Stake room"}</span>
            <span>{uiState.phase === "ended" ? "Ended" : "Live"}</span>
            {roomSummary.matchId ? <span>Code {roomSummary.matchId}</span> : null}
          </div>
          <div className="arena-status-line">{statusMessage}</div>
        </div>

        <aside className="arena-overlay arena-overlay--top-right" aria-label="Leaderboard">
          <div className="arena-leaderboard">
            <strong>Leaderboard</strong>
            <ol>
              {leaderboard.map((entry) => (
                <li key={entry.playerId}>
                  <span>{`#${entry.rank}`}</span>
                  <span>{entry.name}</span>
                  <span>{entry.mass}</span>
                </li>
              ))}
            </ol>
          </div>
        </aside>

        <div className="arena-overlay arena-overlay--bottom-left" aria-hidden="true">
          <div className="arena-player-info">
            <div className="arena-player-info__identity">
              <span className="skin-swatch skin-swatch--small" style={{ background: currentSkin.body }} />
              <strong>{currentSnake?.name ?? playerProfile?.name ?? "Player"}</strong>
            </div>
            <div className="arena-player-info__line">
              <span>{`Length: ${currentLength}`}</span>
              <span>{`Rank: ${currentPlacement ? `#${currentPlacement.rank}` : "--"}`}</span>
            </div>
            <div className="arena-player-info__line">
              <span>{roomSummary.stakeEth ? `Stake: ${roomSummary.stakeEth} ETH` : "Practice run"}</span>
              <span>{`Boost: ${boostFuel}%`}</span>
              <span>{`Time: ${timeLeftSeconds}s`}</span>
            </div>
            <div className="arena-player-info__progress" aria-hidden="true">
              <span style={{ width: `${Math.max(10, matchProgress * 100)}%` }} />
            </div>
          </div>
        </div>

        {uiState.phase === "ended" ? (
          <div className="arena-overlay arena-overlay--bottom-center">
            <div className="arena-game-over">
              <strong>Game over</strong>
              <ol>
                {podium.map((entry) => (
                  <li key={entry.playerId}>
                    <span>{entry.rank}.</span>
                    <span>{entry.name}</span>
                    <span>{entry.mass}</span>
                  </li>
                ))}
              </ol>
              <span>
                {mode === "practice"
                  ? "Reset to run it back."
                  : "The ZK drawer opened with the payout split. Generate both proofs and settle the escrow there."}
              </span>
              {mode === "practice" ? (
                <button className="arena-inline-button" onClick={() => setRunNonce((value) => value + 1)} type="button">
                  Reset run
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <ZkProofPanel
          escrowAddress={escrowAddress}
          joinedPlayerAddresses={joinedPlayerAddresses}
          matchEnded={uiState.phase === "ended"}
          matchId={roomSummary.matchId}
          mode={mode}
          placements={placements.slice(0, 3)}
          players={Object.values(uiState.snakes)}
          stakeEth={roomSummary.stakeEth}
          walletProvider={walletProvider}
        />
      </section>
    </main>
  );
}

function buildParticipants(input: {
  mode: GameMode;
  maxPlayers: number;
  playerProfile: PlayerProfile;
  localPlayerId: string;
  participants?: GameParticipant[];
}): GameParticipant[] {
  if (input.participants && input.participants.length > 0) {
    return input.participants.map((participant) => ({
      id: participant.id,
      name:
        participant.id === input.localPlayerId
          ? input.playerProfile.name
          : sanitizeParticipantName(participant.name, participant.id)
    }));
  }

  return Array.from({ length: input.maxPlayers }, (_, index) => {
    if (index === 0) {
      return { id: input.localPlayerId, name: input.playerProfile.name };
    }

    return {
      id: `bot-${index}`,
      name: BOT_NAMES[(index - 1) % BOT_NAMES.length] ?? `Bot ${index}`
    };
  });
}

function buildSnakeSkinMap(
  playerProfile: PlayerProfile,
  participants: GameParticipant[],
  localPlayerId: string
): Record<string, SnakeSkinId> {
  return participants.reduce<Record<string, SnakeSkinId>>((result, participant, index) => {
    result[participant.id] = participant.id === localPlayerId ? playerProfile.skinId : getBotSkinId(index);
    return result;
  }, {});
}

function buildLocalInputs(match: MatchState, currentPlayerId: string, pointerAngle: number, boostActive: boolean): PlayerInput[] {
  return Object.values(match.snakes)
    .filter((snake) => snake.alive)
    .map((snake) => {
      if (snake.id === currentPlayerId) {
        return { playerId: snake.id, angleRadians: pointerAngle, boosting: boostActive };
      }

      const head = snake.segments[0];
      if (!head) {
        return { playerId: snake.id, angleRadians: snake.angle };
      }

      const outsideSafeZone = Math.hypot(head.x, head.y) > safeRadiusAt(match) * 0.9;
      if (outsideSafeZone) {
        return { playerId: snake.id, angleRadians: Math.atan2(-head.y, -head.x) };
      }

      const targetFood = match.food.reduce<{ x: number; y: number } | null>((closest, food) => {
        if (!closest) {
          return food;
        }

        const currentDistance = distanceSquared(head.x, head.y, closest.x, closest.y);
        const nextDistance = distanceSquared(head.x, head.y, food.x, food.y);
        return nextDistance < currentDistance ? food : closest;
      }, null);

      const fallbackAngle = snake.angle + Math.sin(match.elapsedMs / 1_000 + snake.id.length) * 0.25;
      if (!targetFood) {
        return { playerId: snake.id, angleRadians: fallbackAngle };
      }

      return {
        playerId: snake.id,
        angleRadians: Math.atan2(targetFood.y - head.y, targetFood.x - head.x)
      };
    });
}

function renderFromMatch(match: MatchState): ArenaRenderState {
  return {
    phase: match.phase,
    tick: match.tick,
    elapsedMs: match.elapsedMs,
    safeRadius: safeRadiusAt(match),
    config: match.config,
    snakes: match.snakes,
    food: match.food,
    placements: match.placements
  };
}

function createEmptyRenderState(): ArenaRenderState {
  return {
    phase: "running",
    tick: 0,
    elapsedMs: 0,
    safeRadius: DEFAULT_MATCH_CONFIG.initialSafeRadius,
    config: DEFAULT_MATCH_CONFIG,
    snakes: {},
    food: [],
    placements: []
  };
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function distanceSquared(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function clampRatio(value: number, max: number) {
  if (max <= 0) {
    return 0;
  }

  return Math.min(1, Math.max(0, value / max));
}

function roomSummaryDurationMs(durationSeconds: number) {
  return durationSeconds * 1_000;
}

function sanitizeParticipantName(name: string, fallbackId: string) {
  const trimmed = name.trim();
  if (trimmed) {
    return trimmed.slice(0, 18);
  }

  if (fallbackId.startsWith("0x")) {
    return `${fallbackId.slice(0, 6)}...${fallbackId.slice(-4)}`;
  }

  return "Player";
}

function buildLeaderboardRow(placement: Placement, snake: Snake | undefined) {
  return {
    playerId: placement.playerId,
    rank: placement.rank,
    name: sanitizeParticipantName(snake?.name ?? placement.playerId, placement.playerId),
    mass: Math.round(placement.mass)
  };
}

export const PLAYER_NAME_LABEL_DURATION_MS = PLAYER_LABEL_DURATION_MS;
