export interface PlayerProfile {
  id: string;
  name: string;
  skinId: SnakeSkinId;
}

export const SNAKE_SKINS = [
  {
    id: "solar",
    label: "Solar Gold",
    description: "Bright finisher",
    body: "#f4bf2a",
    glow: "#ffd86c",
    accent: "#fff4ca"
  },
  {
    id: "ember",
    label: "Ember Rush",
    description: "Fast lava trail",
    body: "#ff7b45",
    glow: "#ffb286",
    accent: "#ffe3d5"
  },
  {
    id: "magma",
    label: "Magma Core",
    description: "Pressure closer",
    body: "#ff5669",
    glow: "#ff95a2",
    accent: "#ffd8df"
  },
  {
    id: "dune",
    label: "Dune Coil",
    description: "Hot sand curve",
    body: "#d7a43f",
    glow: "#f0c879",
    accent: "#fff1ce"
  },
  {
    id: "cobalt",
    label: "Cobalt Volt",
    description: "Cold fake-out",
    body: "#67afff",
    glow: "#9cd1ff",
    accent: "#e0f1ff"
  },
  {
    id: "venom",
    label: "Venom Bloom",
    description: "Toxic sprint",
    body: "#7fd85f",
    glow: "#b2f08d",
    accent: "#eeffe6"
  }
] as const;

export type SnakeSkinId = (typeof SNAKE_SKINS)[number]["id"];

const PROFILE_STORAGE_KEY = "kudoku-player-profile";
const LEGACY_ID_STORAGE_KEY = "kudoku-player-id";
const LEGACY_NAME_STORAGE_KEY = "kudoku-player-name";
const DEFAULT_SKIN_ID: SnakeSkinId = "solar";

export function readPlayerProfile(): PlayerProfile {
  if (typeof window === "undefined") {
    return createDefaultProfile();
  }

  const stored = window.localStorage.getItem(PROFILE_STORAGE_KEY);
  if (stored) {
    const parsed = parsePlayerProfile(stored);
    if (parsed) {
      return parsed;
    }
  }

  const legacyId = window.localStorage.getItem(LEGACY_ID_STORAGE_KEY);
  const legacyName = window.localStorage.getItem(LEGACY_NAME_STORAGE_KEY);
  if (legacyId || legacyName) {
    return savePlayerProfile({
      id: legacyId ?? createProfileId(),
      name: legacyName ?? createRandomAlias(),
      skinId: DEFAULT_SKIN_ID
    });
  }

  return savePlayerProfile(createDefaultProfile());
}

export function savePlayerProfile(profile: PlayerProfile): PlayerProfile {
  const normalized = normalizeProfile(profile);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(normalized));
    window.localStorage.setItem(LEGACY_ID_STORAGE_KEY, normalized.id);
    window.localStorage.setItem(LEGACY_NAME_STORAGE_KEY, normalized.name);
  }

  return normalized;
}

export function createRandomAlias(): string {
  const prefixes = ["Solar", "Ember", "Nova", "Magma", "Viper", "Dune"];
  const suffix = Math.floor(Math.random() * 900 + 100);
  const prefix = prefixes[suffix % prefixes.length] ?? "Snake";
  return `${prefix} ${suffix}`;
}

export function getSnakeSkin(skinId?: SnakeSkinId) {
  return SNAKE_SKINS.find((skin) => skin.id === skinId) ?? SNAKE_SKINS[0];
}

export function getBotSkinId(index: number): SnakeSkinId {
  const skin = SNAKE_SKINS[(index + 1) % SNAKE_SKINS.length];
  return skin?.id ?? DEFAULT_SKIN_ID;
}

function createDefaultProfile(): PlayerProfile {
  return {
    id: createProfileId(),
    name: createRandomAlias(),
    skinId: DEFAULT_SKIN_ID
  };
}

function createProfileId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return "local-player";
}

function parsePlayerProfile(serialized: string): PlayerProfile | null {
  try {
    const parsed = JSON.parse(serialized) as Partial<PlayerProfile>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return normalizeProfile({
      id: parsed.id ?? createProfileId(),
      name: parsed.name ?? createRandomAlias(),
      skinId: isSnakeSkinId(parsed.skinId) ? parsed.skinId : DEFAULT_SKIN_ID
    });
  } catch {
    return null;
  }
}

function normalizeProfile(profile: PlayerProfile): PlayerProfile {
  return {
    id: profile.id || createProfileId(),
    name: sanitizePlayerName(profile.name),
    skinId: isSnakeSkinId(profile.skinId) ? profile.skinId : DEFAULT_SKIN_ID
  };
}

function sanitizePlayerName(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ").slice(0, 18);
  return trimmed || createRandomAlias();
}

export function isSnakeSkinId(value: unknown): value is SnakeSkinId {
  return typeof value === "string" && SNAKE_SKINS.some((skin) => skin.id === value);
}
