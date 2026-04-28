/**
 * Lifetime XP → level and within-level progress.
 * Level 1 starts at 0 XP. XP to advance from level L is {@link getXpRequiredForLevel}(L).
 */

export function getXpRequiredForLevel(level: number): number {
  if (!Number.isFinite(level) || level < 1) {
    return Math.round(100 * Math.pow(1.5, 0));
  }
  return Math.round(100 * Math.pow(1.5, level - 1));
}

export type LevelProgress = {
  level: number;
  /** XP earned within the current level (0 .. nextLevelXp - 1 conceptually) */
  currentLevelXp: number;
  /** Total XP span for the current level (to reach the next level) */
  nextLevelXp: number;
  /** 0–100, progress within the current level */
  progressPercent: number;
};

export function getLevelProgress(totalXp: number): LevelProgress {
  const safe = Math.max(0, Math.floor(totalXp));
  let level = 1;
  let floor = 0;

  while (true) {
    const span = getXpRequiredForLevel(level);
    if (safe < floor + span) {
      const currentLevelXp = safe - floor;
      const nextLevelXp = span;
      const progressPercent = nextLevelXp > 0 ? (currentLevelXp / nextLevelXp) * 100 : 0;
      return {
        level,
        currentLevelXp,
        nextLevelXp,
        progressPercent,
      };
    }
    floor += span;
    level += 1;
  }
}
