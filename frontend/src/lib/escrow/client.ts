import {
  ESCROW_MATCH_STATUSES,
  KUDOKU_CHAIN_ID,
  type EscrowMatchView
} from "@/lib/shared";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeAbiParameters,
  http,
  isAddress,
  keccak256,
  parseEther,
  stringToHex,
  custom,
  type Address,
  type Hex
} from "viem";
import { baseSepolia } from "viem/chains";
import { escrowAbi } from "./abi";
import { formatPublicInputsAsBytes32, proofToHex } from "@/lib/zk/proofService";
import type { ZKProof } from "@/lib/zk/types";

export interface WalletProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export interface WalletSession {
  address: Address;
  chainId: number;
}

export interface EscrowTransactionResult {
  hash: Hex;
  matchId?: bigint;
}

export interface CreateEscrowMatchInput {
  provider: WalletProvider;
  contractAddress: Address;
  maxPlayers: number;
  platformFeeBps: number;
  stakeEth: string;
  isPrivate: boolean;
  roomCodeHash: Hex;
}

export interface SettleEscrowMatchInput {
  provider: WalletProvider;
  contractAddress: Address;
  matchId: bigint;
  winners: readonly [Address, Address, Address];
  winnerBps: readonly [number, number, number];
  rankingProof: ZKProof;
  settlementProof: ZKProof;
}

export async function getWalletSession(provider: WalletProvider): Promise<WalletSession> {
  const walletClient = getWalletClient(provider);
  const address = await getConnectedAddress(walletClient, true);

  return {
    address,
    chainId: await getCurrentChainId(provider)
  };
}

export async function getCurrentChainId(provider: WalletProvider): Promise<number> {
  const chainId = await provider.request({ method: "eth_chainId" });
  if (typeof chainId !== "string") {
    throw new Error("Unable to read wallet chain.");
  }

  return Number.parseInt(chainId, 16);
}

export async function switchToBaseSepolia(provider: WalletProvider): Promise<number> {
  const chainHex = `0x${KUDOKU_CHAIN_ID.toString(16)}`;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainHex }]
    });
  } catch (error) {
    const code = extractErrorCode(error);
    if (code !== 4902) {
      throw new Error("Failed to switch the wallet to Base Sepolia.");
    }

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainHex,
          chainName: baseSepolia.name,
          nativeCurrency: baseSepolia.nativeCurrency,
          rpcUrls: [getBaseRpcUrl()],
          blockExplorerUrls: [baseSepolia.blockExplorers.default.url]
        }
      ]
    });
  }

  return getCurrentChainId(provider);
}

export async function readEscrowMatch(
  contractAddress: Address,
  matchId: bigint
): Promise<EscrowMatchView> {
  const publicClient = getPublicClient();
  const exists = await publicClient.readContract({
    address: contractAddress,
    abi: escrowAbi,
    functionName: "matchExists",
    args: [matchId]
  });
  if (!exists) {
    throw new Error(`Room #${matchId.toString()} was not found on-chain.`);
  }

  const result = await publicClient.readContract({
    address: contractAddress,
    abi: escrowAbi,
    functionName: "getMatch",
    args: [matchId]
  });
  const {
    creator,
    stakeWei,
    maxPlayers,
    platformFeeBps,
    status,
    resultHash,
    isPrivate,
    roomCodeHash,
    readyAt,
    startedAt,
    players
  } = result;

  return {
    creator,
    stakeWei: stakeWei.toString(),
    maxPlayers: Number(maxPlayers),
    platformFeeBps: Number(platformFeeBps),
    status: ESCROW_MATCH_STATUSES[Number(status)] ?? ESCROW_MATCH_STATUSES[0],
    resultHash,
    isPrivate,
    roomCodeHash,
    readyAt: Number(readyAt),
    startedAt: Number(startedAt),
    players: [...players]
  };
}

export async function readPublicEscrowMatches(
  contractAddress: Address
): Promise<Array<EscrowMatchView & { matchId: bigint }>> {
  const publicClient = getPublicClient();
  const matchIds = await publicClient.readContract({
    address: contractAddress,
    abi: escrowAbi,
    functionName: "getPublicOpenMatches"
  });

  return Promise.all(
    matchIds.map(async (matchId) => ({
      ...(await readEscrowMatch(contractAddress, matchId)),
      matchId
    }))
  );
}

export async function readCreatorEscrowMatches(
  contractAddress: Address,
  creator: Address
): Promise<Array<EscrowMatchView & { matchId: bigint }>> {
  return readMatchCollection(contractAddress, "getMatchesByCreator", creator);
}

export async function readPlayerEscrowMatches(
  contractAddress: Address,
  player: Address
): Promise<Array<EscrowMatchView & { matchId: bigint }>> {
  return readMatchCollection(contractAddress, "getMatchesByPlayer", player);
}

export async function findPrivateEscrowMatchByCode(
  contractAddress: Address,
  roomCode: string
): Promise<{ matchId: bigint; roomCodeHash: Hex }> {
  const roomCodeHash = hashRoomCode(roomCode);
  const publicClient = getPublicClient();
  const matchId = await publicClient.readContract({
    address: contractAddress,
    abi: escrowAbi,
    functionName: "findPrivateMatchByRoomCodeHash",
    args: [roomCodeHash]
  });

  if (matchId === 0n) {
    throw new Error("No active private room matches that code.");
  }

  return { matchId, roomCodeHash };
}

export async function createEscrowMatch(input: CreateEscrowMatchInput): Promise<EscrowTransactionResult> {
  const walletClient = getWalletClient(input.provider);
  const publicClient = getPublicClient();
  const address = await getConnectedAddress(walletClient);
  const stakeWei = parseEther(input.stakeEth);

  const { request } = await publicClient.simulateContract({
    account: address,
    address: input.contractAddress,
    abi: escrowAbi,
    functionName: "createMatch",
    args: [input.maxPlayers, input.platformFeeBps, input.isPrivate, input.roomCodeHash],
    value: stakeWei
  });

  const hash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: escrowAbi,
        data: log.data,
        topics: log.topics
      });
      if (decoded.eventName === "MatchCreated") {
        return { hash, matchId: decoded.args.matchId };
      }
    } catch {
      // Ignore unrelated logs.
    }
  }

  return { hash };
}

export async function joinEscrowMatch(
  provider: WalletProvider,
  contractAddress: Address,
  matchId: bigint,
  stakeWei: bigint,
  roomCodeHash?: Hex
): Promise<EscrowTransactionResult> {
  const walletClient = getWalletClient(provider);
  const publicClient = getPublicClient();
  const address = await getConnectedAddress(walletClient);

  const { request } = await publicClient.simulateContract({
    account: address,
    address: contractAddress,
    abi: escrowAbi,
    functionName: roomCodeHash ? "joinPrivateMatch" : "joinMatch",
    args: roomCodeHash ? [matchId, roomCodeHash] : [matchId],
    value: stakeWei
  });

  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return { hash };
}

export async function startEscrowMatch(
  provider: WalletProvider,
  contractAddress: Address,
  matchId: bigint
): Promise<EscrowTransactionResult> {
  const walletClient = getWalletClient(provider);
  const publicClient = getPublicClient();
  const address = await getConnectedAddress(walletClient);

  const { request } = await publicClient.simulateContract({
    account: address,
    address: contractAddress,
    abi: escrowAbi,
    functionName: "startMatch",
    args: [matchId]
  });

  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return { hash };
}

export async function cancelEscrowMatch(
  provider: WalletProvider,
  contractAddress: Address,
  matchId: bigint
): Promise<EscrowTransactionResult> {
  const walletClient = getWalletClient(provider);
  const publicClient = getPublicClient();
  const address = await getConnectedAddress(walletClient);

  const { request } = await publicClient.simulateContract({
    account: address,
    address: contractAddress,
    abi: escrowAbi,
    functionName: "cancelMatch",
    args: [matchId]
  });

  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return { hash };
}

export async function settleEscrowMatch(input: SettleEscrowMatchInput): Promise<EscrowTransactionResult> {
  const walletClient = getWalletClient(input.provider);
  const publicClient = getPublicClient();
  const address = await getConnectedAddress(walletClient);

  const rankingPublicInputs = formatPublicInputsAsBytes32(input.rankingProof.publicInputs);
  const settlementPublicInputs = formatPublicInputsAsBytes32(input.settlementProof.publicInputs);
  const normalizedWinnerBps = input.winnerBps.map((value) => Number(value)) as [number, number, number];
  const resultHash = computeVerifiedResultHash(
    input.matchId,
    input.winners,
    normalizedWinnerBps,
    rankingPublicInputs,
    settlementPublicInputs
  );

  const { request } = await publicClient.simulateContract({
    account: address,
    address: input.contractAddress,
    abi: escrowAbi,
    functionName: "settleMatch",
    args: [
      input.matchId,
      resultHash,
      [...input.winners] as [Address, Address, Address],
      normalizedWinnerBps,
      proofToHex(input.rankingProof.proof),
      rankingPublicInputs,
      proofToHex(input.settlementProof.proof),
      settlementPublicInputs
    ]
  });

  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return { hash };
}

export function normalizeEscrowAddress(value: string): Address | null {
  return isAddress(value) ? value : null;
}

export function getBaseRpcUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
}

export function getExplorerTransactionUrl(hash: Hex): string {
  return `${baseSepolia.blockExplorers.default.url}/tx/${hash}`;
}

function getPublicClient() {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(getBaseRpcUrl())
  });
}

function getWalletClient(provider: WalletProvider) {
  return createWalletClient({
    chain: baseSepolia,
    transport: custom(provider)
  });
}

async function getConnectedAddress(
  walletClient: ReturnType<typeof getWalletClient>,
  requestIfNeeded = false
): Promise<Address> {
  const addresses = await walletClient.getAddresses();
  const address = addresses[0];
  if (!address) {
    if (!requestIfNeeded) {
      throw new Error("Connect a wallet before sending transactions.");
    }

    const requestedAddresses = await walletClient.requestAddresses();
    const requestedAddress = requestedAddresses[0];
    if (!requestedAddress) {
      throw new Error("Wallet returned no address.");
    }

    return requestedAddress;
  }

  return address;
}

function extractErrorCode(error: unknown): number | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "number"
  ) {
    return (error as { code: number }).code;
  }

  return null;
}

async function readMatchCollection(
  contractAddress: Address,
  functionName: "getMatchesByCreator" | "getMatchesByPlayer",
  account: Address
): Promise<Array<EscrowMatchView & { matchId: bigint }>> {
  const publicClient = getPublicClient();
  const matchIds = await publicClient.readContract({
    address: contractAddress,
    abi: escrowAbi,
    functionName,
    args: [account]
  });

  const rooms = await Promise.all(
    matchIds.map(async (matchId) => ({
      ...(await readEscrowMatch(contractAddress, matchId)),
      matchId
    }))
  );

  return rooms.sort((left, right) => Number(right.matchId - left.matchId));
}

export function generatePrivateRoomCode(length = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = crypto.getRandomValues(new Uint8Array(length));
  let code = "";
  for (let index = 0; index < length; index++) {
    code += chars[values[index] % chars.length];
  }
  return code;
}

export function hashRoomCode(roomCode: string): Hex {
  return keccak256(stringToHex(roomCode.trim().toUpperCase()));
}

function computeVerifiedResultHash(
  matchId: bigint,
  winners: readonly [Address, Address, Address],
  winnerBps: readonly [number, number, number],
  rankingPublicInputs: readonly Hex[],
  settlementPublicInputs: readonly Hex[]
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { name: "matchId", type: "uint256" },
        { name: "winners", type: "address[3]" },
        { name: "winnerBps", type: "uint16[3]" },
        { name: "rankingPublicInputs", type: "bytes32[]" },
        { name: "settlementPublicInputs", type: "bytes32[]" }
      ],
      [matchId, [...winners] as [Address, Address, Address], [...winnerBps] as [number, number, number], [...rankingPublicInputs], [...settlementPublicInputs]]
    )
  );
}
