import type { CSSProperties } from "react";
import {
  DEFAULT_THEME_ID,
  THEME_COLORS,
  TEAMCHAT_SELECTED_THEME_STORAGE_KEY,
  isValidStoredThemeColor,
  normalizeToThemeId,
} from "../constants/themeColors";

export function getThemeById(themeId: string): ThemePalette {
  return THEME_COLORS.find((t) => t.id === themeId) ?? THEME_COLORS[0]!;
}

export function getThemeCssVars(themeId: string): CSSProperties {
  const t = getThemeById(themeId);
  return {
    "--teamchat-accent": t.accent,
    "--teamchat-accent-hover": t.accentHover,
    "--teamchat-soft-bg": t.softBg,
    "--teamchat-subtle-bg": t.subtleBg,
    "--teamchat-border": t.border,
    "--teamchat-glow": t.glow,
    "--teamchat-text": t.text,
    "--teamchat-gradient": t.gradient,
  } as CSSProperties;
}

export function readStoredThemeId(): string {
  if (typeof window === "undefined") {
    return DEFAULT_THEME_ID;
  }
  try {
    const raw = localStorage.getItem(TEAMCHAT_SELECTED_THEME_STORAGE_KEY);
    if (raw && isValidStoredThemeColor(raw)) {
      return normalizeToThemeId(raw);
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME_ID;
}

export { TEAMCHAT_SELECTED_THEME_STORAGE_KEY };
