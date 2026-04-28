export type ThemePalette = {
  id: string;
  label: string;
  accent: string;
  accentHover: string;
  softBg: string;
  subtleBg: string;
  border: string;
  glow: string;
  text: string;
  gradient: string;
};

export const THEME_COLORS: ThemePalette[] = [
  {
    id: "purple",
    label: "Purple",
    accent: "#7C3AED",
    accentHover: "#6D28D9",
    softBg: "rgba(124, 58, 237, 0.10)",
    subtleBg: "rgba(124, 58, 237, 0.06)",
    border: "rgba(124, 58, 237, 0.28)",
    glow: "rgba(124, 58, 237, 0.22)",
    text: "#4C1D95",
    gradient: "linear-gradient(135deg, rgba(124,58,237,0.12), rgba(236,72,153,0.08))",
  },
  {
    id: "blue",
    label: "Blue",
    accent: "#2563EB",
    accentHover: "#1D4ED8",
    softBg: "rgba(37, 99, 235, 0.10)",
    subtleBg: "rgba(37, 99, 235, 0.06)",
    border: "rgba(37, 99, 235, 0.28)",
    glow: "rgba(37, 99, 235, 0.22)",
    text: "#1E3A8A",
    gradient: "linear-gradient(135deg, rgba(37,99,235,0.12), rgba(14,165,233,0.08))",
  },
  {
    id: "pink",
    label: "Pink",
    accent: "#EC4899",
    accentHover: "#DB2777",
    softBg: "rgba(236, 72, 153, 0.10)",
    subtleBg: "rgba(236, 72, 153, 0.06)",
    border: "rgba(236, 72, 153, 0.28)",
    glow: "rgba(236, 72, 153, 0.22)",
    text: "#831843",
    gradient: "linear-gradient(135deg, rgba(236,72,153,0.12), rgba(244,114,182,0.08))",
  },
  {
    id: "green",
    label: "Green",
    accent: "#22C55E",
    accentHover: "#16A34A",
    softBg: "rgba(34, 197, 94, 0.10)",
    subtleBg: "rgba(34, 197, 94, 0.06)",
    border: "rgba(34, 197, 94, 0.28)",
    glow: "rgba(34, 197, 94, 0.22)",
    text: "#14532D",
    gradient: "linear-gradient(135deg, rgba(34,197,94,0.12), rgba(132,204,22,0.08))",
  },
  {
    id: "orange",
    label: "Orange",
    accent: "#F97316",
    accentHover: "#EA580C",
    softBg: "rgba(249, 115, 22, 0.10)",
    subtleBg: "rgba(249, 115, 22, 0.06)",
    border: "rgba(249, 115, 22, 0.28)",
    glow: "rgba(249, 115, 22, 0.22)",
    text: "#7C2D12",
    gradient: "linear-gradient(135deg, rgba(249,115,22,0.12), rgba(251,191,36,0.08))",
  },
  {
    id: "gray",
    label: "Gray",
    accent: "#6B7280",
    accentHover: "#4B5563",
    softBg: "rgba(107, 114, 128, 0.10)",
    subtleBg: "rgba(107, 114, 128, 0.06)",
    border: "rgba(107, 114, 128, 0.28)",
    glow: "rgba(107, 114, 128, 0.20)",
    text: "#374151",
    gradient: "linear-gradient(135deg, rgba(107,114,128,0.10), rgba(156,163,175,0.06))",
  },
];

export const DEFAULT_THEME_ID = THEME_COLORS[0]?.id ?? "purple";

export const TEAMCHAT_SELECTED_THEME_STORAGE_KEY = "teamchat:selectedThemeColor";

const byId = new Map(THEME_COLORS.map((t) => [t.id, t] as const));
const byAccentLower = new Map(THEME_COLORS.map((t) => [t.accent.toLowerCase(), t] as const));

export function normalizeToThemeId(stored: string): string {
  if (byId.has(stored)) {
    return stored;
  }
  const fromHex = byAccentLower.get(stored.toLowerCase());
  return fromHex?.id ?? DEFAULT_THEME_ID;
}

export function isValidStoredThemeColor(raw: string | null | undefined): raw is string {
  if (!raw) {
    return false;
  }
  return byId.has(raw) || byAccentLower.has(raw.toLowerCase());
}
