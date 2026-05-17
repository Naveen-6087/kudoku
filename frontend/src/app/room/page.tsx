import { StakeRoom } from "@/components/stake-room";

interface RoomPageProps {
  searchParams?: Record<string, string | string[] | undefined>;
}

export default function RoomPage({ searchParams }: RoomPageProps) {
  const matchId = readSingle(searchParams?.matchId) ?? "1";
  const stakeEth = readSingle(searchParams?.stake);
  const roomCode = readSingle(searchParams?.roomCode);
  const maxPlayers = clampNumber(readNumber(searchParams?.players), 3, 24, 4);
  const durationSeconds = clampNumber(readNumber(searchParams?.duration), 60, 300, 180);

  return (
    <StakeRoom
        durationSeconds={durationSeconds}
        matchId={matchId}
        maxPlayers={maxPlayers}
        {...(roomCode ? { roomCode } : {})}
        {...(stakeEth ? { stakeEth } : {})}
      />
  );
}

function readSingle(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function readNumber(value: string | string[] | undefined): number {
  const parsed = Number(readSingle(value));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}
