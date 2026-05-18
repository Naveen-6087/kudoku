"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrivy, useWallets, type ConnectedWallet, type WalletListEntry } from "@privy-io/react-auth";
import type { Room } from "colyseus.js";
import { GameShell, type GameParticipant } from "./game-shell";
import {
  getSnakeSkin,
  readPlayerProfile,
  savePlayerProfile,
  SNAKE_SKINS,
  type SnakeSkinId
} from "@/lib/player-profile";
import {
  ESCROW_READY_COUNTDOWN_SECONDS,
  KUDOKU_CHAIN_ID,
  type EscrowMatchView,
  type SnakeRoomSnapshot
} from "@/lib/shared";
import {
  getWalletSession,
  getExplorerTransactionUrl,
  hashRoomCode,
  isRpcRateLimitError,
  joinEscrowMatch,
  normalizeEscrowAddress,
  readEscrowMatch,
  startEscrowMatch,
  switchToBaseSepolia,
  type WalletProvider,
  type WalletSession
} from "@/lib/escrow/client";
import { joinMatchRoom, toSnakeRoomSnapshot } from "@/lib/multiplayer/client";

const CONNECT_WALLET_LIST: WalletListEntry[] = [
  "metamask",
  "wallet_connect",
  "detected_ethereum_wallets",
  "rainbow"
] as const;

interface StakeRoomProps {
  matchId: string;
  stakeEth?: string;
  maxPlayers: number;
  durationSeconds: number;
  roomCode?: string;
}

export function StakeRoom({ matchId, stakeEth, maxPlayers, durationSeconds, roomCode }: StakeRoomProps) {
  const contractAddress = normalizeEscrowAddress(process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? "");
  const { ready, authenticated, login, connectWallet } = usePrivy();
  const { wallets } = useWallets();

  const [hydrated, setHydrated] = useState(false);
  const [wallet, setWallet] = useState<WalletSession | null>(null);
  const [walletProvider, setWalletProvider] = useState<WalletProvider | null>(null);
  const [room, setRoom] = useState<EscrowMatchView | null>(null);
  const [liveRoom, setLiveRoom] = useState<SnakeRoomSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading room...");
  const [liveStatus, setLiveStatus] = useState("Connect your wallet to sync the room.");
  const [roomCodeInput, setRoomCodeInput] = useState(roomCode?.toUpperCase() ?? "");
  const [lastTxUrl, setLastTxUrl] = useState<string | null>(null);

  const roomConnectionRef = useRef<Room | null>(null);
  const inputSequenceRef = useRef(0);
  const autoStartTriggeredRef = useRef(false);

  const activeWallet = useMemo(
    () =>
      wallets.find(
        (candidate) =>
          candidate.type === "ethereum" &&
          (candidate.walletClientType === "privy" || candidate.walletClientType === "privy-v2")
      ) ??
      wallets.find((candidate) => candidate.type === "ethereum") ??
      null,
    [wallets]
  );
  const [profile, setProfile] = useState(() => readPlayerProfile());

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !ready || !authenticated || !activeWallet) {
      setWallet(null);
      setWalletProvider(null);
      return;
    }

    void syncWallet(activeWallet, setWallet, setWalletProvider);
  }, [activeWallet, authenticated, hydrated, ready]);

  useEffect(() => {
    if (!contractAddress) {
      setLoading(false);
      setStatus("Configure NEXT_PUBLIC_ESCROW_ADDRESS before opening paid rooms.");
      return;
    }

    const address = contractAddress;
    let cancelled = false;

    async function refreshRoom(showLoading = false) {
      if (showLoading) {
        setLoading(true);
      }

      try {
        const nextRoom = await readEscrowMatch(address, BigInt(matchId));
        if (cancelled) {
          return;
        }

        setRoom(nextRoom);
        setStatus(buildRoomStatus(nextRoom, wallet?.address ?? null));
        if (nextRoom.status !== "Ready") {
          autoStartTriggeredRef.current = false;
        }
      } catch (error) {
        if (!cancelled) {
          if (!isRpcRateLimitError(error)) {
            setStatus(readErrorMessage(error, "Unable to load that room."));
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void refreshRoom(true);
    const interval = window.setInterval(() => {
      void refreshRoom(false);
    }, 3_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [contractAddress, matchId, wallet?.address]);

  const joined = Boolean(
    wallet &&
      room?.players.some((playerAddress) => playerAddress.toLowerCase() === wallet.address.toLowerCase())
  );
  const onBaseSepolia = wallet?.chainId === KUDOKU_CHAIN_ID;
  const normalizedLocalPlayerId = wallet ? normalizePlayerId(wallet.address) : normalizePlayerId(profile.id);
  const roomStatus = room?.status ?? null;
  const roomMaxPlayers = room?.maxPlayers ?? maxPlayers;
  const expectedPlayerIds = useMemo(
    () => (room?.players ?? []).map(normalizePlayerId),
    [room?.players]
  );
  const startCoordinatorAddress = useMemo(() => {
    if (!room) {
      return null;
    }

    const connectedPlayer = room.players.find((playerAddress) => {
      const presence = liveRoom?.players[normalizePlayerId(playerAddress)];
      return presence?.connected ?? false;
    });

    return connectedPlayer ?? room.creator;
  }, [liveRoom?.players, room]);
  const isStartCoordinator = Boolean(
    wallet && startCoordinatorAddress && startCoordinatorAddress.toLowerCase() === wallet.address.toLowerCase()
  );
  const canJoin = Boolean(
    contractAddress &&
      room &&
      room.status === "Lobby" &&
      walletProvider &&
      wallet &&
      onBaseSepolia &&
      !joined &&
      (!room.isPrivate || roomCodeInput.length === 6)
  );

  useEffect(() => {
    if (
      !joined ||
      !wallet ||
      !roomStatus ||
      roomStatus === "Settled" ||
      roomStatus === "Cancelled"
    ) {
      setLiveRoom(null);
      setLiveStatus(joined ? "Room closed." : "Join on-chain to sync the live room.");
      void roomConnectionRef.current?.leave();
      roomConnectionRef.current = null;
      return;
    }

    if (roomConnectionRef.current) {
      return;
    }

    let cancelled = false;
    const currentWallet = wallet;
    const playerName = profile.name.trim() || shortAddress(currentWallet.address);

    async function connectToRoom() {
      try {
        setLiveStatus("Connecting to live room sync...");
        const nextConnection = await joinMatchRoom({
          matchId,
          maxPlayers: roomMaxPlayers,
          durationSeconds,
          playerId: currentWallet.address,
          name: playerName,
          skinId: profile.skinId,
          expectedPlayerIds
        });

        if (cancelled) {
          void nextConnection.leave();
          return;
        }

        roomConnectionRef.current = nextConnection;
        nextConnection.onStateChange((state) => {
          const snapshot = toSnakeRoomSnapshot(state);
          setLiveRoom(snapshot);
          setLiveStatus(describeLiveRoom(snapshot, roomMaxPlayers));
        });
        nextConnection.onLeave(() => {
          setLiveStatus("Live room sync disconnected.");
          setLiveRoom(null);
          roomConnectionRef.current = null;
        });

        nextConnection.send("sync-roster", {
          expectedPlayerIds,
          maxPlayers: roomMaxPlayers,
          name: playerName,
          skinId: profile.skinId
        });
      } catch (error) {
        if (!cancelled) {
          setLiveStatus(readErrorMessage(error, "Unable to connect to the live room sync."));
        }
      }
    }

    void connectToRoom();

    return () => {
      cancelled = true;
    };
  }, [durationSeconds, expectedPlayerIds, joined, matchId, profile.name, profile.skinId, roomMaxPlayers, roomStatus, wallet]);

  useEffect(() => {
    if (!roomConnectionRef.current) {
      return;
    }

    roomConnectionRef.current.send("sync-roster", {
      expectedPlayerIds,
      maxPlayers: roomMaxPlayers,
      name: wallet ? profile.name.trim() || shortAddress(wallet.address) : profile.name,
      skinId: profile.skinId
    });
  }, [expectedPlayerIds, profile.name, profile.skinId, roomMaxPlayers, wallet]);

  useEffect(() => {
    if (
      !room ||
      !joined ||
      !isStartCoordinator ||
      !walletProvider ||
      autoStartTriggeredRef.current ||
      room.status !== "Ready" ||
      liveRoom?.phase !== "countdown" ||
      liveRoom.countdownMs > 0
    ) {
      return;
    }

    autoStartTriggeredRef.current = true;
    setBusy("start");
    setLastTxUrl(null);

    void startEscrowMatch(walletProvider, contractAddress!, BigInt(matchId))
      .then(async (result) => {
        setLastTxUrl(getExplorerTransactionUrl(result.hash));
        roomConnectionRef.current?.send("begin-match");
        const nextRoom = await readEscrowMatch(contractAddress!, BigInt(matchId));
        setRoom(nextRoom);
        setStatus("All players synced. Starting the on-chain match...");
      })
      .catch((error) => {
        autoStartTriggeredRef.current = false;
        setStatus(readErrorMessage(error, "Unable to start the room."));
      })
      .finally(() => {
        setBusy(null);
      });
  }, [contractAddress, isStartCoordinator, joined, liveRoom, matchId, room, walletProvider]);

  useEffect(() => {
    if (room?.status !== "InProgress" || !roomConnectionRef.current) {
      return;
    }

    roomConnectionRef.current.send("begin-match");
  }, [room?.status]);

  const participants = useMemo<GameParticipant[]>(() => {
    const livePlayers = liveRoom?.players ?? {};
    return (room?.players ?? []).map((playerAddress, index) => {
      const playerId = normalizePlayerId(playerAddress);
      const presence = livePlayers[playerId];
      const isYou = wallet && playerAddress.toLowerCase() === wallet.address.toLowerCase();
        return {
          id: playerId,
          name: isYou ? profile.name : presence?.name ?? `Player ${index + 1}`,
          skinId: isYou ? profile.skinId : normalizeSkinId(presence?.skinId)
        };
      });
  }, [liveRoom?.players, profile.name, profile.skinId, room?.players, wallet]);

  const liveRenderState = useMemo(() => {
    if (!liveRoom) {
      return null;
    }

    return {
      phase: liveRoom.phase === "ended" ? "ended" : "running",
      tick: liveRoom.tick,
      elapsedMs: liveRoom.elapsedMs,
      safeRadius: liveRoom.safeRadius,
      config: liveRoom.config,
      snakes: liveRoom.snakes,
      food: liveRoom.food,
      placements: liveRoom.placements
    };
  }, [liveRoom]);

  const sendLiveInput = useCallback(
    (input: { angleRadians: number; boosting: boolean }) => {
      const connection = roomConnectionRef.current;
      if (!connection || !wallet) {
        return;
      }

      inputSequenceRef.current += 1;
      connection.send("input", {
        playerId: normalizePlayerId(wallet.address),
        sequence: inputSequenceRef.current,
        angleRadians: input.angleRadians,
        boosting: input.boosting,
        clientTimeMs: Date.now()
      });
    },
    [wallet]
  );

  if (!contractAddress) {
    return (
      <main className="page-frame">
        <section className="setup-shell">
          <section className="setup-card setup-card--hero">
            <h1 className="brand">Escrow address missing</h1>
          </section>
        </section>
      </main>
    );
  }

  if (!loading && room?.status === "InProgress" && joined && liveRenderState) {
    return (
      <GameShell
        durationSeconds={durationSeconds}
        escrowAddress={contractAddress}
        externalRenderState={liveRenderState}
        externalStatusMessage={liveStatus}
        joinedPlayerAddresses={room.players as `0x${string}`[]}
        localPlayerId={normalizedLocalPlayerId}
        matchId={matchId}
        maxPlayers={room.maxPlayers}
        mode="stake"
        onLiveInput={sendLiveInput}
        participants={participants}
        stakeEth={stakeEth ?? formatEthAmount(room.stakeWei)}
        walletProvider={walletProvider}
      />
    );
  }

  const connectedCount = Object.values(liveRoom?.players ?? {}).filter((player) => player.connected).length;
  const countdownSeconds = Math.max(0, Math.ceil((liveRoom?.countdownMs ?? 0) / 1_000));
  const contractCountdownSeconds = room?.readyAt
    ? Math.max(0, room.readyAt + ESCROW_READY_COUNTDOWN_SECONDS - Math.floor(Date.now() / 1_000))
    : 0;

  return (
    <main className="page-frame">
      <section className="paid-room">
        <div className="paid-room__header">
          <Link className="paid-room__back" href="/play">
            Back
          </Link>
          <div className="paid-room__connection">
            <span>{wallet ? shortAddress(wallet.address) : "wallet needed"}</span>
            <span>{room?.isPrivate ? "private" : "public"}</span>
          </div>
        </div>

        <div className="paid-room__body">
          <div className="paid-room__left">
            <p className="paid-lobby__eyebrow">game room</p>
            <h1>#{matchId}</h1>
            <p className="paid-room__subtle">
              {room?.isPrivate
                ? "Private room - share the code with your friends."
                : "Public room - every seat is joined on-chain with the same stake."}
            </p>

            <div className="paid-room__stats">
              <span>{room ? `${room.players.length}/${room.maxPlayers} staked` : "loading"}</span>
              <span>{stakeEth ?? (room ? `${formatEthAmount(room.stakeWei)} ETH` : "--")}</span>
              <span>{room ? formatStatusLabel(room.status) : "loading"}</span>
            </div>

            {room?.isPrivate ? (
              <div className="paid-room__code-block">
                <label>Game Code</label>
                <div className="paid-room__code-row">
                  <input
                    className="paid-room__code-input"
                    maxLength={6}
                    onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))}
                    placeholder="ENTER CODE"
                    value={roomCodeInput}
                  />
                  <button onClick={() => void copyToClipboard(roomCodeInput)} type="button">
                    Copy
                  </button>
                </div>
                <p>{roomCodeInput ? "Only players with this code can sign the join transaction." : "Enter the shared code to unlock private joining."}</p>
              </div>
             ) : null}

            <div className="paid-room__skin-picker">
              <label>Snake Color</label>
              <div className="paid-room__skin-grid">
                {SNAKE_SKINS.map((skin) => {
                  const active = profile.skinId === skin.id;
                  return (
                    <button
                      className={active ? "is-active" : ""}
                      key={skin.id}
                      onClick={() => setProfile(savePlayerProfile({ ...profile, skinId: skin.id as SnakeSkinId }))}
                      type="button"
                    >
                      <span className="skin-swatch skin-swatch--small" style={{ background: skin.body }} />
                      <span>{skin.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="paid-room__subtle">
                {`Current snake: ${getSnakeSkin(profile.skinId).label}. This syncs to the live room before the match starts.`}
              </p>
            </div>

            <div className="paid-room__actions">
              <button className="paid-lobby__primary" disabled={!hydrated || !ready || busy !== null} onClick={handleConnect} type="button">
                {!hydrated || !ready
                  ? "preparing..."
                  : authenticated && activeWallet
                    ? "wallet connected"
                    : authenticated
                      ? "link wallet"
                      : "connect wallet"}
              </button>
              {activeWallet ? (
                <button
                  className="paid-lobby__ghost"
                  disabled={busy !== null}
                  onClick={() => void handleSwitchNetwork(activeWallet, setWallet, setWalletProvider, setBusy, setStatus)}
                  type="button"
                >
                  {busy === "network" ? "switching..." : "base sepolia"}
                </button>
              ) : null}
              <button className="paid-lobby__ghost" disabled={!canJoin || busy !== null} onClick={() => void handleJoin()} type="button">
                {busy === "join" ? "joining..." : joined ? "joined" : "join + stake"}
              </button>
            </div>

            <p className="paid-room__subtle">{status}</p>
            <p className="paid-room__subtle">{liveStatus}</p>
            {lastTxUrl ? (
              <a className="paid-lobby__tx-link" href={lastTxUrl} rel="noreferrer" target="_blank">
                View last transaction
              </a>
            ) : null}
          </div>

          <div className="paid-room__right">
            <h2>PLAYERS</h2>
            <div className="paid-room__players">
              {(room?.players ?? []).map((playerAddress, index) => {
                const playerId = normalizePlayerId(playerAddress);
                const presence = liveRoom?.players[playerId];
                const isYou = wallet && playerAddress.toLowerCase() === wallet.address.toLowerCase();

                return (
                  <div className="paid-room__player" key={playerAddress}>
                    <span>{">"}</span>
                    <span>{String(index + 1).padStart(2, "0")}.</span>
                    <span className="paid-room__player-name">
                      <span
                        className="skin-swatch skin-swatch--small"
                        style={{ background: getSnakeSkin(normalizeSkinId(isYou ? profile.skinId : presence?.skinId)).body }}
                      />
                      {isYou ? `${profile.name} (you)` : presence?.name ?? shortAddress(playerAddress)}
                      {presence ? (presence.connected ? " - synced" : " - waiting") : ""}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="paid-room__waiting">
              {room?.status === "Lobby"
                ? `waiting for all stakes (${room?.players.length ?? 0}/${room?.maxPlayers ?? maxPlayers})`
                : room?.status === "Ready"
                  ? countdownSeconds > 0
                    ? `all players synced - auto start in ${countdownSeconds}s`
                    : contractCountdownSeconds > 0
                      ? `on-chain countdown unlocks in ${contractCountdownSeconds}s`
                      : "starting on-chain match..."
                  : room?.status === "InProgress"
                    ? "match is live"
                    : "room complete"}
              <br />
              {room?.status === "Ready"
                ? `${connectedCount}/${room?.maxPlayers ?? maxPlayers} players are synced into the live room.`
                : "Every join must be a real on-chain stake transaction."}
            </div>
          </div>
        </div>
      </section>
    </main>
  );

  function handleConnect() {
    if (!hydrated || !ready) {
      setStatus("Secure login is still loading.");
      return;
    }

    if (authenticated && !activeWallet) {
      connectWallet({
        description: "Connect an Ethereum wallet to join this Kudoku room.",
        walletChainType: "ethereum-only",
        walletList: CONNECT_WALLET_LIST
      });
      return;
    }

    login();
  }

  async function handleJoin() {
    if (!contractAddress || !room || !walletProvider || !wallet) {
      setStatus("Finish wallet setup before joining.");
      return;
    }
    if (!onBaseSepolia) {
      setStatus("Switch to Base Sepolia before joining.");
      return;
    }
    if (room.isPrivate && roomCodeInput.length !== 6) {
      setStatus("Enter the 6-character private room code before joining.");
      return;
    }

    setBusy("join");
    setLastTxUrl(null);
    try {
      const result = await joinEscrowMatch(
        walletProvider,
        contractAddress,
        BigInt(matchId),
        BigInt(room.stakeWei),
        room.isPrivate ? hashRoomCode(roomCodeInput) : undefined
      );
      setLastTxUrl(getExplorerTransactionUrl(result.hash));
      const nextRoom = await readEscrowMatch(contractAddress, BigInt(matchId));
      setRoom(nextRoom);
      setStatus(buildRoomStatus(nextRoom, wallet.address));
    } catch (error) {
      setStatus(readErrorMessage(error, "Unable to join the room."));
    } finally {
      setBusy(null);
    }
  }
}

async function syncWallet(
  activeWallet: ConnectedWallet,
  setWallet: (wallet: WalletSession | null) => void,
  setWalletProvider: (provider: WalletProvider | null) => void
) {
  try {
    const provider = (await activeWallet.getEthereumProvider()) as WalletProvider;
    const nextWallet = await getWalletSession(provider);
    setWallet(nextWallet);
    setWalletProvider(provider);
  } catch {
    setWallet(null);
    setWalletProvider(null);
  }
}

async function handleSwitchNetwork(
  activeWallet: ConnectedWallet,
  setWallet: (wallet: WalletSession | null) => void,
  setWalletProvider: (provider: WalletProvider | null) => void,
  setBusy: (value: string | null) => void,
  setStatus: (value: string) => void
) {
  setBusy("network");
  try {
    const provider = (await activeWallet.getEthereumProvider()) as WalletProvider;
    const chainId = await switchToBaseSepolia(provider);
    const nextWallet = await getWalletSession(provider);
    setWallet({ ...nextWallet, chainId });
    setWalletProvider(provider);
    setStatus("Wallet switched to Base Sepolia.");
  } catch (error) {
    setStatus(readErrorMessage(error, "Unable to switch the wallet to Base Sepolia."));
  } finally {
    setBusy(null);
  }
}

function describeLiveRoom(snapshot: SnakeRoomSnapshot, maxPlayers: number) {
  const connected = Object.values(snapshot.players).filter((player) => player.connected).length;
  switch (snapshot.phase) {
    case "countdown":
      return snapshot.countdownMs > 0
        ? `All ${connected}/${maxPlayers} players synced. Countdown ${Math.ceil(snapshot.countdownMs / 1_000)}s.`
        : "Sync countdown complete. Waiting for the on-chain start transaction."
    case "running":
      return "Authoritative multiplayer sync is live."
    case "ended":
      return "Authoritative match ended."
    default:
      return `Waiting for all players to sync (${connected}/${maxPlayers}).`
  }
}

function formatEthAmount(value: string | bigint) {
  const bigIntValue = typeof value === "string" ? BigInt(value) : value;
  const whole = bigIntValue / 10n ** 18n;
  const fraction = (bigIntValue % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction ? `${whole.toString()}.${fraction.slice(0, 4)}` : `${whole.toString()}`;
}

function formatStatusLabel(value: string) {
  switch (value) {
    case "Lobby":
      return "waiting";
    case "Ready":
      return "ready";
    case "InProgress":
      return "live";
    case "Settled":
      return "settled";
    case "Cancelled":
      return "cancelled";
    default:
      return value.toLowerCase();
  }
}

function buildRoomStatus(room: EscrowMatchView, walletAddress: string | null) {
  const isJoined = Boolean(
    walletAddress &&
      room.players.some((playerAddress) => playerAddress.toLowerCase() === walletAddress.toLowerCase())
  );

  if (room.status === "Lobby") {
    return isJoined
      ? "Your stake is in. Waiting for the remaining players to join on-chain."
      : "Join the room with an on-chain stake transaction.";
  }

  if (room.status === "Ready") {
    return "All seats are funded. Waiting for every player to sync before the game auto-starts.";
  }

  if (room.status === "InProgress") {
    return "Match started. Loading the live arena...";
  }

  if (room.status === "Settled") {
    return "Match settled on-chain.";
  }

  return "Match cancelled and refunded.";
}

function readErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function shortAddress(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

async function copyToClipboard(value: string) {
  if (!value || typeof navigator === "undefined" || !navigator.clipboard) {
    return;
  }
  await navigator.clipboard.writeText(value);
}

function normalizePlayerId(value: string) {
  return value.trim().toLowerCase();
}

function normalizeSkinId(value: unknown): SnakeSkinId {
  return SNAKE_SKINS.find((skin) => skin.id === value)?.id ?? SNAKE_SKINS[0].id;
}
