import { getLevelProgress } from "./xp";

// TODO: Persist xp_total, level, last_xp_awarded_date in user_profiles or user_gamification table (Supabase).

const USER_XP_PREFIX = "teamchat:userXp:";
const UPDATE_XP_AWARDED_PREFIX = "teamchat:updateXpAwarded:";

const DAILY_UPDATE_XP = 20;

/** Dev console: clears persisted XP and daily-award flags. Reload to refresh UI state. */
export function resetTeamchatXp(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) {
        continue;
      }
      if (key.startsWith(USER_XP_PREFIX) || key.startsWith(UPDATE_XP_AWARDED_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

export function getUserXpStorageKey(userId: string): string {
  return `${USER_XP_PREFIX}${userId}`;
}

export function getUpdateXpAwardedStorageKey(userId: string, dateKey: string): string {
  return `${UPDATE_XP_AWARDED_PREFIX}${userId}:${dateKey}`;
}

/**
 * Consecutive local calendar days (ending at today) with a daily update XP award flag in `localStorage`.
 * Streak breaks on the first day with no `getUpdateXpAwardedStorageKey` value of `"1"`.
 */
export function getDailyUpdateStreak(userId: string): number {
  if (typeof window === "undefined") {
    return 0;
  }
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  for (let i = 0; i < 400; i += 1) {
    const y = cursor.getFullYear();
    const m = `${cursor.getMonth() + 1}`.padStart(2, "0");
    const day = `${cursor.getDate()}`.padStart(2, "0");
    const dateKey = `${y}-${m}-${day}`;
    try {
      if (localStorage.getItem(getUpdateXpAwardedStorageKey(userId, dateKey)) === "1") {
        streak += 1;
      } else {
        break;
      }
    } catch {
      break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Local `yyyy-mm-dd` for award dedupe (same approach as timeline date keys). */
export function getLocalDateKeyForToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function readStoredUserTotalXp(userId: string): number {
  if (typeof window === "undefined") {
    return 0;
  }
  try {
    const raw = localStorage.getItem(getUserXpStorageKey(userId));
    if (!raw) {
      return 0;
    }
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function writeStoredUserTotalXp(userId: string, total: number): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(getUserXpStorageKey(userId), String(Math.max(0, Math.floor(total))));
  } catch {
    /* ignore */
  }
}

export type DailyUpdateXpResult = {
  awarded: boolean;
  previousTotal: number;
  newTotal: number;
  levelBefore: number;
  levelAfter: number;
};

/**
 * Awards +20 XP for a successful Daily Update post.
 * Also writes today's flag for streak tracking.
 */
export function tryAwardDailyUpdateXp(userId: string): DailyUpdateXpResult {
  const previousTotal = readStoredUserTotalXp(userId);
  const levelBefore = getLevelProgress(previousTotal).level;

  if (typeof window === "undefined") {
    return { awarded: false, previousTotal, newTotal: previousTotal, levelBefore, levelAfter: levelBefore };
  }

  const dateKey = getLocalDateKeyForToday();
  const flagKey = getUpdateXpAwardedStorageKey(userId, dateKey);

  try {
    const newTotal = previousTotal + DAILY_UPDATE_XP;
    const levelAfter = getLevelProgress(newTotal).level;
    writeStoredUserTotalXp(userId, newTotal);
    // Keep this flag for daily streak tracking, but do not use it
    // to block awarding XP for additional successful updates.
    localStorage.setItem(flagKey, "1");
    return { awarded: true, previousTotal, newTotal, levelBefore, levelAfter };
  } catch {
    return { awarded: false, previousTotal, newTotal: previousTotal, levelBefore, levelAfter: levelBefore };
  }
}
