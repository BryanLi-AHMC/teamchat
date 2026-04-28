import { getLevelProgress } from "../utils/xp";

export type XpProgressBadgeProps = {
  totalXp: number;
  compact?: boolean;
  className?: string;
  variant?: "panel" | "map";
};

export function XpProgressBadge({
  totalXp,
  compact = false,
  className = "",
  variant = "panel",
}: XpProgressBadgeProps) {
  const safe = Math.max(0, totalXp);
  const { level, currentLevelXp, nextLevelXp, progressPercent } = getLevelProgress(safe);
  const pct = Math.min(100, Math.max(0, progressPercent));

  return (
    <div
      className={`xp-progress-badge xp-progress-badge--${variant} ${compact ? "xp-progress-badge--compact" : ""} ${className}`.trim()}
      role="group"
      aria-label={`Level ${level}, ${currentLevelXp} of ${nextLevelXp} XP to next level`}
    >
      <div className="xp-progress-badge__row">
        <span className="xp-progress-badge__level xp-label">Lv. {level}</span>
        {!compact ? (
          <span className="xp-progress-badge__fraction xp-value">
            {currentLevelXp} / {nextLevelXp} XP
          </span>
        ) : null}
      </div>
      <div className="xp-progress-badge__track xp-track" aria-hidden>
        <div className="xp-progress-badge__fill xp-fill" style={{ width: `${pct}%` }} />
      </div>
      {compact ? (
        <span className="xp-progress-badge__fraction xp-progress-badge__fraction--compact xp-value">
          {currentLevelXp}/{nextLevelXp}
        </span>
      ) : null}
    </div>
  );
}
