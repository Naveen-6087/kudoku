"use client";

import Image from "next/image";
import {
  BUY_IN_BRACKETS_ETH,
  DEFAULT_PLATFORM_FEE_BPS,
  KUDOKU_CHAIN_ID,
  MATCH_SIZE_PRESETS
} from "@/lib/shared";
import {
  cancelEscrowMatch,
  createEscrowMatch,
  findPrivateEscrowMatchByCode,
  generatePrivateRoomCode,
  getExplorerTransactionUrl,
  getWalletSession,
  hashRoomCode,
  isRpcRateLimitError,
  joinEscrowMatch,
  normalizeEscrowAddress,
  readEscrowMatch,
  readPlayerEscrowMatches,
  readPublicEscrowMatches,
  switchToBaseSepolia,
  type WalletProvider,
  type WalletSession
} from "@/lib/escrow/client";
import { usePrivy, useWallets, type ConnectedWallet, type WalletListEntry } from "@privy-io/react-auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatEther, type Address } from "viem";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
const PRIVY_CLIENT_ID = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID ?? "";
const PRIVY_ENABLED = Boolean(PRIVY_APP_ID && PRIVY_CLIENT_ID);
const CONNECT_WALLET_LIST: WalletListEntry[] = [
  "metamask",
  "wallet_connect",
  "detected_ethereum_wallets",
  "rainbow"
];

const DEFAULT_STAKE = BUY_IN_BRACKETS_ETH[1];
const PLAYER_OPTIONS = MATCH_SIZE_PRESETS;
const PRIVATE_CODE_LENGTH = 6;
const PRIVATE_CODE_STORAGE_KEY = "kudoku-private-room-codes";
const LOBBY_REFRESH_INTERVAL_MS = 12_000;

type LobbyTab = "public" | "my-games";
type RoomListItem = Awaited<ReturnType<typeof readPublicEscrowMatches>>[number];

export function OnchainSetup() {
  const contractAddress = normalizeEscrowAddress(process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? "");

  if (!PRIVY_ENABLED || !contractAddress) {
    return (
      <main className="page-frame">
        <section className="setup-shell">
          <section className="setup-card setup-card--hero">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Paid rooms</p>
                <h1 className="brand">Privy or escrow config is missing</h1>
              </div>
              <Link className="back-link" href="/">
                Back home
              </Link>
            </div>
            <p className="muted">
              Set `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_PRIVY_CLIENT_ID`, and `NEXT_PUBLIC_ESCROW_ADDRESS`
              before using paid multiplayer rooms.
            </p>
          </section>
        </section>
      </main>
    );
  }

  return <OnchainSetupContent contractAddress={contractAddress} />;
}

function OnchainSetupContent({ contractAddress }: { contractAddress: Address }) {
  const router = useRouter();
  const { ready, authenticated, login, logout, connectWallet } = usePrivy();
  const { wallets } = useWallets();

  const [hydrated, setHydrated] = useState(false);
  const [wallet, setWallet] = useState<WalletSession | null>(null);
  const [walletProvider, setWalletProvider] = useState<WalletProvider | null>(null);
  const [activeTab, setActiveTab] = useState<LobbyTab>("public");
  const [publicRooms, setPublicRooms] = useState<RoomListItem[]>([]);
  const [myGames, setMyGames] = useState<RoomListItem[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinCodeModal, setShowJoinCodeModal] = useState(false);
  const [isPrivateGame, setIsPrivateGame] = useState(false);
  const [maxPlayersSelection, setMaxPlayersSelection] = useState<number>(PLAYER_OPTIONS[1]);
  const [stakeEth, setStakeEth] = useState<string>(DEFAULT_STAKE);
  const [generatedCode, setGeneratedCode] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [joiningGameId, setJoiningGameId] = useState<bigint | null>(null);
  const [deletingGameId, setDeletingGameId] = useState<bigint | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("Connect your wallet to create or join a paid room.");
  const [lastTxUrl, setLastTxUrl] = useState<string | null>(null);
  const refreshInFlightRef = useRef(false);

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
  const privyReady = hydrated && ready;
  const onBaseSepolia = wallet?.chainId === KUDOKU_CHAIN_ID;
  const displayedGames = activeTab === "public" ? publicRooms : myGames;
  const snakesReady = wallet ? 1 : 0;
  const previewModeLabel = describeRoomSize(maxPlayersSelection);
  const previewStakeLabel = describeStake(stakeEth);
  const previewPool = Number.parseFloat(stakeEth) * maxPlayersSelection;

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!privyReady || !authenticated || !activeWallet) {
      setWallet(null);
      setWalletProvider(null);
      return;
    }

    void syncWallet(activeWallet, setWallet, setWalletProvider);
  }, [activeWallet, authenticated, privyReady]);

  useEffect(() => {
    if (!showCreateModal) {
      setCodeCopied(false);
      return;
    }

    if (isPrivateGame && !generatedCode) {
      setGeneratedCode(generatePrivateRoomCode(PRIVATE_CODE_LENGTH));
    }
  }, [generatedCode, isPrivateGame, showCreateModal]);

  const refreshRooms = useCallback(
    async (options?: { force?: boolean }) => {
      if (refreshInFlightRef.current) {
        return;
      }

      if (!options?.force && typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      refreshInFlightRef.current = true;
      try {
        const [publicRoomsResult, myRoomsResult] = await Promise.all([
          readPublicEscrowMatches(contractAddress),
          wallet ? readPlayerEscrowMatches(contractAddress, wallet.address) : Promise.resolve([])
        ]);

        setPublicRooms(publicRoomsResult.sort((left, right) => Number(right.matchId - left.matchId)));
        setMyGames(myRoomsResult.sort((left, right) => Number(right.matchId - left.matchId)));
      } catch (error) {
        if (!isRpcRateLimitError(error)) {
          setStatus(readErrorMessage(error, "Unable to refresh rooms."));
        }
      } finally {
        refreshInFlightRef.current = false;
      }
    },
    [contractAddress, wallet]
  );

  useEffect(() => {
    void refreshRooms({ force: true });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshRooms({ force: true });
      }
    };

    const interval = window.setInterval(() => {
      void refreshRooms();
    }, LOBBY_REFRESH_INTERVAL_MS);

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshRooms]);

  useEffect(() => {
    if (!privyReady) {
      return;
    }

    if (!authenticated) {
      setStatus("Connect your wallet to create or join a paid room.");
      return;
    }

    if (!activeWallet) {
      setStatus("Wallet login is ready. Link an Ethereum wallet to continue.");
      return;
    }

    setStatus(
      onBaseSepolia
        ? "Wallet ready. Create a public/private room or join an existing one."
        : "Switch your wallet to Base Sepolia before creating or joining."
    );
  }, [activeWallet, authenticated, onBaseSepolia, privyReady]);

  async function handleConnect() {
    if (!privyReady) {
      setStatus("Secure login is still loading.");
      return;
    }

    if (authenticated && !activeWallet) {
      connectWallet({
        description: "Connect an Ethereum wallet for paid Kudoku rooms.",
        walletChainType: "ethereum-only",
        walletList: CONNECT_WALLET_LIST
      });
      return;
    }

    login();
  }

  async function handleSwitchNetwork() {
    if (!activeWallet) {
      setStatus("Finish wallet setup before switching networks.");
      return;
    }

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

  async function handleDisconnect() {
    setBusy("disconnect");
    try {
      await logout();
      setWallet(null);
      setWalletProvider(null);
      setStatus("Signed out of the paid-room wallet.");
    } catch (error) {
      setStatus(readErrorMessage(error, "Unable to sign out."));
    } finally {
      setBusy(null);
    }
  }

  function togglePrivateMode(nextValue: boolean) {
    setIsPrivateGame(nextValue);
    setCodeCopied(false);
    setGeneratedCode(nextValue ? generatePrivateRoomCode(PRIVATE_CODE_LENGTH) : "");
  }

  async function handleCreateRoom() {
    if (!walletProvider || !wallet) {
      setStatus("Connect a wallet before creating a room.");
      return;
    }
    if (!onBaseSepolia) {
      setStatus("Switch to Base Sepolia before creating a room.");
      return;
    }

    setBusy("create");
    setLastTxUrl(null);
    try {
      const roomCode = isPrivateGame ? generatedCode || generatePrivateRoomCode(PRIVATE_CODE_LENGTH) : "";
      const result = await createEscrowMatch({
        provider: walletProvider,
        contractAddress,
        maxPlayers: maxPlayersSelection,
        platformFeeBps: DEFAULT_PLATFORM_FEE_BPS,
        stakeEth,
        isPrivate: isPrivateGame,
        roomCodeHash: isPrivateGame ? hashRoomCode(roomCode) : ZERO_HASH
      });

      setLastTxUrl(getExplorerTransactionUrl(result.hash));

      if (result.matchId !== undefined) {
        if (isPrivateGame) {
          storePrivateRoomCode(result.matchId.toString(), roomCode);
        }

        setStatus(
          isPrivateGame
            ? `Private room #${result.matchId.toString()} created. Share code ${roomCode}.`
            : `Public room #${result.matchId.toString()} created.`
        );
        setShowCreateModal(false);
        router.push(
          `/room?${buildRoomSearchParams({
            matchId: result.matchId.toString(),
            maxPlayers: maxPlayersSelection,
            stakeEth,
            roomCode: isPrivateGame ? roomCode : undefined
          }).toString()}`
        );
      } else {
        setStatus("Room transaction confirmed, but the new room id was not found in the receipt.");
      }
    } catch (error) {
      setStatus(readErrorMessage(error, "Unable to create the room."));
    } finally {
      setBusy(null);
    }
  }

  async function handleJoinByCode() {
    if (!joinCodeInput.trim()) {
      setStatus("Enter the private game code.");
      return;
    }
    if (!walletProvider || !wallet) {
      setStatus("Connect a wallet before joining a private game.");
      return;
    }
    if (!onBaseSepolia) {
      setStatus("Switch to Base Sepolia before joining.");
      return;
    }

    setBusy("join-code");
    setLastTxUrl(null);
    try {
      const normalizedCode = joinCodeInput.trim().toUpperCase();
      const lookup = await findPrivateEscrowMatchByCode(contractAddress, normalizedCode);
      const room = await readEscrowMatch(contractAddress, lookup.matchId);
      const alreadyJoined = isJoinedRoom(room, wallet.address);

      if (!alreadyJoined) {
        const result = await joinEscrowMatch(
          walletProvider,
          contractAddress,
          lookup.matchId,
          BigInt(room.stakeWei),
          lookup.roomCodeHash
        );
        setLastTxUrl(getExplorerTransactionUrl(result.hash));
      }

      router.push(
        `/room?${buildRoomSearchParams({
          matchId: lookup.matchId.toString(),
          maxPlayers: room.maxPlayers,
          stakeEth: formatEthAmount(room.stakeWei),
          roomCode: normalizedCode
        }).toString()}`
      );
      setShowJoinCodeModal(false);
      setJoinCodeInput("");
    } catch (error) {
      setStatus(readErrorMessage(error, "Unable to find a private room with that code."));
    } finally {
      setBusy(null);
    }
  }

  async function handleJoinLobbyRoom(room: RoomListItem) {
    if (!walletProvider || !wallet) {
      setStatus("Connect a wallet before joining a paid room.");
      return;
    }
    if (!onBaseSepolia) {
      setStatus("Switch to Base Sepolia before joining.");
      return;
    }

    setJoiningGameId(room.matchId);
    setLastTxUrl(null);
    try {
      const alreadyJoined = isJoinedRoom(room, wallet.address);
      if (!alreadyJoined) {
        const result = await joinEscrowMatch(
          walletProvider,
          contractAddress,
          room.matchId,
          BigInt(room.stakeWei)
        );
        setLastTxUrl(getExplorerTransactionUrl(result.hash));
      }

      handleOpenRoom(room);
    } catch (error) {
      setStatus(readErrorMessage(error, "Unable to join that room."));
    } finally {
      setJoiningGameId(null);
    }
  }

  async function handleDeleteRoom(room: RoomListItem) {
    if (!walletProvider) {
      setStatus("Connect the creator wallet before deleting a room.");
      return;
    }

    setDeletingGameId(room.matchId);
    try {
      const result = await cancelEscrowMatch(walletProvider, contractAddress, room.matchId);
      setLastTxUrl(getExplorerTransactionUrl(result.hash));
      setStatus(`Room #${room.matchId.toString()} was deleted and refunded.`);
      setPublicRooms((current) => current.filter((candidate) => candidate.matchId !== room.matchId));
      setMyGames((current) => current.filter((candidate) => candidate.matchId !== room.matchId));
      clearStoredPrivateRoomCode(room.matchId.toString());
    } catch (error) {
      setStatus(readErrorMessage(error, "Unable to delete that room."));
    } finally {
      setDeletingGameId(null);
    }
  }

  function handleOpenRoom(room: RoomListItem) {
    const roomCode = room.isPrivate ? readStoredPrivateRoomCode(room.matchId.toString()) : undefined;
    router.push(
      `/room?${buildRoomSearchParams({
        matchId: room.matchId.toString(),
        maxPlayers: room.maxPlayers,
        stakeEth: formatEthAmount(room.stakeWei),
        roomCode: roomCode ?? undefined
      }).toString()}`
    );
  }

  return (
    <main className="page-frame">
      <section className="paid-lobby">
        <div className="paid-lobby__header">
          <div>
            <Link className="site-logo site-logo--header" href="/">
              <Image alt="Kudoku" height={54} src="/logo-text.png" width={232} />
            </Link>
            <p className="paid-lobby__eyebrow">paid multiplayer</p>
            <h1>Kudoku rooms</h1>
            <p>{status}</p>
          </div>
          <div className="paid-lobby__header-actions">
            <Link className="paid-lobby__ghost" href="/">
              Back home
            </Link>
            <button className="paid-lobby__primary" disabled={!privyReady || busy !== null} onClick={() => void handleConnect()} type="button">
              {authenticated && activeWallet ? "wallet connected" : authenticated ? "link wallet" : "connect wallet"}
            </button>
            {activeWallet ? (
              <button className="paid-lobby__ghost" disabled={busy !== null} onClick={() => void handleSwitchNetwork()} type="button">
                {busy === "network" ? "switching..." : "base sepolia"}
              </button>
            ) : null}
            {authenticated ? (
              <button className="paid-lobby__ghost" disabled={busy !== null} onClick={() => void handleDisconnect()} type="button">
                {busy === "disconnect" ? "signing out..." : "sign out"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="paid-lobby__hero-grid">
          <button className="paid-lobby__hero-card paid-lobby__hero-card--create" onClick={() => setShowCreateModal(true)} type="button">
            <span className="paid-lobby__hero-tag">forge lobby</span>
            <strong>Create paid game</strong>
            <p>{wallet && onBaseSepolia ? "Stake, choose the arena, and open the hunting grounds." : "Connect and switch network to open a room."}</p>
          </button>
          <button className="paid-lobby__hero-card paid-lobby__hero-card--join" onClick={() => setShowJoinCodeModal(true)} type="button">
            <span className="paid-lobby__hero-tag">private hunt</span>
            <strong>Join with code</strong>
            <p>Enter the shared 6-character room code and stake into the same arena.</p>
          </button>
        </div>

        <div className="paid-lobby__stage">
          <div className="paid-lobby__main">
            <div className="paid-lobby__tabs">
              <button className={activeTab === "public" ? "is-active" : ""} onClick={() => setActiveTab("public")} type="button">
                Public arenas
              </button>
              <button className={activeTab === "my-games" ? "is-active" : ""} onClick={() => setActiveTab("my-games")} type="button">
                Your lobbies
              </button>
            </div>

            <div className="paid-lobby__grid">
              {displayedGames.length > 0 ? (
                displayedGames.map((room) => {
                  const storedCode = room.isPrivate ? readStoredPrivateRoomCode(room.matchId.toString()) : null;
                  const joined = Boolean(wallet && isJoinedRoom(room, wallet.address));
                  const openOnly = activeTab === "my-games" || room.isPrivate || joined || room.status !== "Lobby";
                  const canDelete =
                    activeTab === "my-games" &&
                    wallet &&
                    room.creator.toLowerCase() === wallet.address.toLowerCase() &&
                    (room.status === "Lobby" || room.status === "Ready");

                  return (
                    <div className="paid-lobby__game-card" key={`${activeTab}-${room.matchId.toString()}`}>
                      <div className="paid-lobby__game-card-top">
                        <h3>#{room.matchId.toString()}</h3>
                        <span>{room.isPrivate ? "Private" : "Public"}</span>
                      </div>
                      <div className="paid-lobby__game-card-meta">
                        <span>{formatEthAmount(room.stakeWei)} ETH</span>
                        <span>{room.players.length}/{room.maxPlayers} snakes</span>
                        <span>{formatStatusLabel(room.status)}</span>
                      </div>
                      {room.isPrivate && storedCode ? (
                        <div className="paid-lobby__code-row">
                          <code>{storedCode}</code>
                          <button onClick={() => void copyToClipboard(storedCode)} type="button">
                            Copy
                          </button>
                        </div>
                      ) : null}
                      <div className="paid-lobby__game-card-actions">
                        <button
                          disabled={joiningGameId === room.matchId}
                          onClick={() => void (openOnly ? Promise.resolve(handleOpenRoom(room)) : handleJoinLobbyRoom(room))}
                          type="button"
                        >
                          {joiningGameId === room.matchId ? "joining..." : openOnly ? "Open Lobby" : "Join + Stake"}
                        </button>
                        {canDelete ? (
                          <button
                            className="danger"
                            disabled={deletingGameId === room.matchId}
                            onClick={() => void handleDeleteRoom(room)}
                            type="button"
                          >
                            {deletingGameId === room.matchId ? "..." : "Delete"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="paid-lobby__empty">
                  <p>{activeTab === "public" ? "No public arenas live right now." : "You have not opened a lobby yet."}</p>
                </div>
              )}
            </div>
          </div>

          <aside className="paid-lobby__preview">
            <div className="paid-lobby__preview-card">
              <div className="paid-lobby__preview-header">
                <p className="paid-lobby__eyebrow">live arena</p>
                <strong>{previewModeLabel.headline}</strong>
                <span>{previewModeLabel.subline}</span>
              </div>

              <div className="paid-lobby__preview-media">
                <Image
                  alt="Arena preview"
                  fill
                  sizes="(max-width: 1180px) 100vw, 32vw"
                  src="/arena.png"
                />
              </div>

              <div className="paid-lobby__readiness">
                <span>{`${snakesReady} / ${maxPlayersSelection} SNAKES READY`}</span>
                <strong>{snakesReady === maxPlayersSelection ? "MATCH STARTING" : "HUNTING GROUNDS OPEN"}</strong>
              </div>

              <div className="paid-lobby__stats-grid">
                <div className="paid-lobby__stat-card">
                  <span>Prize Pool</span>
                  <strong>{`${previewPool.toFixed(3)} ETH`}</strong>
                </div>
                <div className="paid-lobby__stat-card">
                  <span>Snakes in Arena</span>
                  <strong>{`${snakesReady} / ${maxPlayersSelection}`}</strong>
                </div>
                <div className="paid-lobby__stat-card">
                  <span>Match Type</span>
                  <strong>{isPrivateGame ? "Private" : "Public"}</strong>
                </div>
                <div className="paid-lobby__stat-card">
                  <span>Map</span>
                  <strong>{previewModeLabel.map}</strong>
                </div>
                <div className="paid-lobby__stat-card">
                  <span>Buy-in</span>
                  <strong>{previewStakeLabel}</strong>
                </div>
                <div className="paid-lobby__stat-card">
                  <span>Time Limit</span>
                  <strong>3 MINUTES</strong>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {lastTxUrl ? (
          <a className="paid-lobby__tx-link" href={lastTxUrl} rel="noreferrer" target="_blank">
            View last transaction
          </a>
        ) : null}
      </section>

      {showCreateModal ? (
        <div className="paid-lobby__modal-backdrop">
          <div className="paid-lobby__modal paid-lobby__modal--compact">
            <div className="paid-lobby__modal-stack">
              <div className="paid-lobby__modal-heading">
                <h2>Create game</h2>
                <p className="paid-lobby__modal-copy">Set the room and jump in.</p>
              </div>

              <div className="paid-lobby__toggle">
                <button className={!isPrivateGame ? "is-active is-public" : ""} onClick={() => togglePrivateMode(false)} type="button">
                  Public
                </button>
                <button className={isPrivateGame ? "is-active is-private" : ""} onClick={() => togglePrivateMode(true)} type="button">
                  Private
                </button>
              </div>

              <div className="paid-lobby__modal-section">
                <p className="paid-lobby__section-label">Snakes in Arena</p>
                <div className="paid-lobby__selector paid-lobby__selector--compact">
                  {PLAYER_OPTIONS.map((value) => (
                    <button
                      className={maxPlayersSelection === value ? "is-active" : ""}
                      key={value}
                      onClick={() => setMaxPlayersSelection(value)}
                      type="button"
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div className="paid-lobby__modal-section">
                <p className="paid-lobby__section-label">Stake per Snake</p>
                <div className="paid-lobby__selector paid-lobby__selector--compact">
                  {BUY_IN_BRACKETS_ETH.map((value) => (
                    <button className={stakeEth === value ? "is-active" : ""} key={value} onClick={() => setStakeEth(value)} type="button">
                      {value} ETH
                    </button>
                  ))}
                </div>
              </div>

              {isPrivateGame ? (
                <div className="paid-lobby__private-code">
                  <label>Game Code</label>
                  <div className="paid-lobby__code-row paid-lobby__code-row--large">
                    <code>{generatedCode}</code>
                    <button
                      onClick={() => {
                        void copyToClipboard(generatedCode);
                        setCodeCopied(true);
                      }}
                      type="button"
                    >
                      {codeCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="paid-lobby__modal-copy">Public rooms appear in the lobby for anyone to join.</p>
              )}

              <div className="paid-lobby__modal-actions">
                <button className="paid-lobby__ghost" onClick={() => setShowCreateModal(false)} type="button">
                  Cancel
                </button>
                <button
                  className="paid-lobby__primary"
                  disabled={busy === "create" || !wallet || !onBaseSepolia}
                  onClick={() => void handleCreateRoom()}
                  type="button"
                >
                  {busy === "create" ? "Creating..." : `Create ${isPrivateGame ? "Private" : "Public"} Game`}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showJoinCodeModal ? (
        <div className="paid-lobby__modal-backdrop">
          <div className="paid-lobby__modal">
            <h2>Join Private Game</h2>
            <label className="paid-lobby__join-label" htmlFor="join-code-input">
              Game Code
            </label>
            <input
              id="join-code-input"
              className="paid-lobby__join-input"
              maxLength={PRIVATE_CODE_LENGTH}
              onChange={(event) => setJoinCodeInput(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))}
              placeholder="Enter 6-character code"
              value={joinCodeInput}
            />
            <div className="paid-lobby__modal-actions">
              <button
                className="paid-lobby__ghost"
                onClick={() => {
                  setShowJoinCodeModal(false);
                  setJoinCodeInput("");
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="paid-lobby__primary"
                disabled={joinCodeInput.length !== PRIVATE_CODE_LENGTH || busy === "join-code"}
                onClick={() => void handleJoinByCode()}
                type="button"
              >
                {busy === "join-code" ? "Joining..." : "Join Game"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
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

function buildRoomSearchParams(input: {
  matchId: string;
  maxPlayers: number;
  stakeEth: string;
  roomCode?: string;
}) {
  const params = new URLSearchParams({
    mode: "join",
    matchId: input.matchId,
    players: String(input.maxPlayers),
    duration: "180",
    stake: input.stakeEth
  });
  if (input.roomCode) {
    params.set("roomCode", input.roomCode);
  }
  return params;
}

function formatEthAmount(value: string | bigint) {
  const [whole, fraction = ""] = formatEther(typeof value === "string" ? BigInt(value) : value).split(".");
  const trimmedFraction = fraction.replace(/0+$/, "").slice(0, 4);
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
}

function formatStatusLabel(value: string) {
  switch (value) {
    case "Lobby":
      return "Waiting";
    case "Ready":
      return "Ready";
    case "InProgress":
      return "Live";
    case "Settled":
      return "Settled";
    case "Cancelled":
      return "Cancelled";
    default:
      return value;
  }
}

function describeRoomSize(players: number) {
  switch (players) {
    case 3:
      return {
        headline: "Fast Duel",
        subline: "Tight circle. Quick eliminations.",
        map: "Tight Arena"
      };
    case 4:
      return {
        headline: "Sharp Clash",
        subline: "Compact pressure with more flanks.",
        map: "Burning Ring"
      };
    case 6:
      return {
        headline: "Balanced Chaos",
        subline: "Enough room to grow, never enough to relax.",
        map: "Core Arena"
      };
    case 12:
      return {
        headline: "High Stakes Survival",
        subline: "Crowded field. Massive pool. Brutal endgame.",
        map: "Grand Pit"
      };
    default:
      return {
        headline: "Live Arena",
        subline: "Competitive stake room.",
        map: "Arena"
      };
  }
}

function describeStake(value: string) {
  const amount = Number.parseFloat(value);
  if (amount <= 0.0005) {
    return "Warm-up buy-in";
  }
  if (amount <= 0.001) {
    return "Prime table";
  }
  if (amount <= 0.005) {
    return "High pressure";
  }
  return "Whale hunt";
}

function isJoinedRoom(room: Pick<RoomListItem, "players">, walletAddress: Address) {
  return room.players.some((playerAddress) => playerAddress.toLowerCase() === walletAddress.toLowerCase());
}

function readErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function readStoredPrivateRoomCode(matchId: string) {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PRIVATE_CODE_STORAGE_KEY) ?? "{}") as Record<string, string>;
    return parsed[matchId] ?? null;
  } catch {
    return null;
  }
}

function storePrivateRoomCode(matchId: string, roomCode: string) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PRIVATE_CODE_STORAGE_KEY) ?? "{}") as Record<string, string>;
    parsed[matchId] = roomCode;
    window.localStorage.setItem(PRIVATE_CODE_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Ignore storage issues in the browser.
  }
}

function clearStoredPrivateRoomCode(matchId: string) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PRIVATE_CODE_STORAGE_KEY) ?? "{}") as Record<string, string>;
    delete parsed[matchId];
    window.localStorage.setItem(PRIVATE_CODE_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Ignore storage issues in the browser.
  }
}

async function copyToClipboard(value: string) {
  if (!value || typeof navigator === "undefined" || !navigator.clipboard) {
    return;
  }
  await navigator.clipboard.writeText(value);
}

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
