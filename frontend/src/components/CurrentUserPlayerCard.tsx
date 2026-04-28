import { type CSSProperties } from "react";
import { PetAvatar } from "./PetAvatar";
import { XpProgressBadge } from "./XpProgressBadge";
import { isValidPetId } from "../constants/pets";

export type CurrentUserPlayerCardProps = {
  displayName: string;
  /** When set, used for initials / image fallbacks. */
  imageUrl?: string | null;
  selectedPetId: string;
  totalXp: number;
  isOnline: boolean;
  /** e.g. "You" for most users, "Leader" for team lead (Ari). */
  roleLabel: "You" | "Leader";
  onOpenProfile?: () => void;
  dayStreak: number;
  className?: string;
  style?: CSSProperties;
};

/**
 * Game-style profile card for the current user (sidebar). Styling uses `var(--teamchat-*)` from the app shell.
 */
export function CurrentUserPlayerCard({
  displayName,
  imageUrl,
  selectedPetId,
  totalXp,
  isOnline,
  roleLabel,
  onOpenProfile,
  dayStreak,
  className = "",
  style,
}: CurrentUserPlayerCardProps) {
  const hasValidPet = Boolean(selectedPetId && isValidPetId(selectedPetId));
  const points = Math.max(0, Math.floor(totalXp));
  const content = (
    <>
      <div className="current-user-player-card__avatar-wrap">
        <PetAvatar
          petId={hasValidPet ? selectedPetId : undefined}
          imageUrl={!hasValidPet ? imageUrl : undefined}
          label={displayName}
          size="xl"
          clip="soft"
          className="current-user-player-card__pet"
        />
      </div>
      <div className="current-user-player-card__header">
        <div className="current-user-player-card__name-row">
          <span className="current-user-player-card__name" title={displayName}>
            {displayName}
          </span>
          <span className="current-user-player-card__role-pill">{roleLabel}</span>
        </div>
        <div
          className={`current-user-player-card__online${isOnline ? " current-user-player-card__online--on" : ""}`}
          aria-label={isOnline ? "Online" : "Offline"}
        >
          <span className="current-user-player-card__dot" aria-hidden />
          {isOnline ? "Online" : "Offline"}
        </div>
      </div>
      <div className="current-user-player-card__level-xp">
        <XpProgressBadge totalXp={totalXp} className="current-user-player-card__xp" />
      </div>
      <div className="current-user-player-card__stats" role="group" aria-label="Points and streak">
        <div className="current-user-player-card__stat">
          <span className="current-user-player-card__stat-label">Points</span>
          <span className="current-user-player-card__stat-value">{points.toLocaleString()}</span>
        </div>
        <div className="current-user-player-card__stat">
          <span className="current-user-player-card__stat-label">Streak</span>
          <span className="current-user-player-card__stat-value">
            {dayStreak} {dayStreak === 1 ? "day" : "days"}
          </span>
        </div>
      </div>
    </>
  );

  if (onOpenProfile) {
    return (
      <button
        type="button"
        className={`current-user-player-card current-user-player-card--button ${className}`.trim()}
        style={style}
        onClick={onOpenProfile}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={`current-user-player-card ${className}`.trim()} style={style}>
      {content}
    </div>
  );
}
