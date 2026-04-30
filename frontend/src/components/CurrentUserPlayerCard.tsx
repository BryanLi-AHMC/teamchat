import { type CSSProperties } from "react";
import { PetAvatar } from "./PetAvatar";
import { isValidPetId } from "../constants/pets";
import { getLevelProgress } from "../utils/xp";

export type CurrentUserPlayerCardProps = {
  displayName: string;
  /** When set, used for initials / image fallbacks. */
  imageUrl?: string | null;
  selectedPetId: string;
  totalXp: number;
  isOnline: boolean;
  /** e.g. "You" for most users, "Leader" for team lead (Ari). */
  roleLabel: "You" | "Leader";
  /** Opens daily updates / profile view (name, status, XP area). */
  onOpenProfile?: () => void;
  /** Toggles pet & theme picker; use with {@link isIdentityPanelOpen} for `aria-expanded`. */
  onPetIconClick?: () => void;
  isIdentityPanelOpen?: boolean;
  dayStreak: number;
  className?: string;
  style?: CSSProperties;
};

/**
 * Compact sidebar profile: character icon (optional action) beside name; rectangular XP bar below.
 */
export function CurrentUserPlayerCard({
  displayName,
  imageUrl,
  selectedPetId,
  totalXp,
  isOnline,
  roleLabel,
  onOpenProfile,
  onPetIconClick,
  isIdentityPanelOpen,
  dayStreak: _dayStreak,
  className = "",
  style,
}: CurrentUserPlayerCardProps) {
  const hasValidPet = Boolean(selectedPetId && isValidPetId(selectedPetId));
  void _dayStreak;

  const { level, currentLevelXp, nextLevelXp, progressPercent } = getLevelProgress(Math.max(0, totalXp));
  const pct = Math.min(100, Math.max(0, progressPercent));

  const avatar = (
    <PetAvatar
      petId={hasValidPet ? selectedPetId : undefined}
      imageUrl={!hasValidPet ? imageUrl : undefined}
      label={displayName}
      size="sm"
      clip="soft"
      className="current-user-player-card__icon"
    />
  );

  const identityBlock = (
    <div className="current-user-player-card__identity">
      <div className="current-user-player-card__name-line">
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
  );

  const xpBlock = (
    <div className="current-user-player-card__xp-block">
      <div className="current-user-player-card__xp-meta">
        <span className="current-user-player-card__xp-level">Lv.{level}</span>
        <span className="current-user-player-card__xp-numbers">
          {currentLevelXp} / {nextLevelXp} XP
        </span>
      </div>
      <div className="current-user-player-card__xp-rect" aria-hidden>
        <div className="current-user-player-card__xp-rect-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );

  const splitChrome = Boolean(onPetIconClick);

  if (splitChrome) {
    return (
      <div
        className={`current-user-player-card current-user-player-card--split ${className}`.trim()}
        style={style}
      >
        <div className="current-user-player-card__top">
          <button
            type="button"
            className="current-user-player-card__icon-btn"
            onClick={onPetIconClick}
            aria-expanded={typeof isIdentityPanelOpen === "boolean" ? isIdentityPanelOpen : undefined}
            aria-controls={isIdentityPanelOpen ? "teamchat-identity-bar" : undefined}
            aria-label="Choose pet and theme"
          >
            {avatar}
          </button>
          {onOpenProfile ? (
            <button type="button" className="current-user-player-card__identity-btn" onClick={onOpenProfile}>
              {identityBlock}
            </button>
          ) : (
            <div className="current-user-player-card__identity-static">{identityBlock}</div>
          )}
        </div>
        {onOpenProfile ? (
          <button type="button" className="current-user-player-card__xp-btn" onClick={onOpenProfile}>
            {xpBlock}
          </button>
        ) : (
          xpBlock
        )}
      </div>
    );
  }

  if (onOpenProfile) {
    return (
      <button
        type="button"
        className={`current-user-player-card current-user-player-card--button ${className}`.trim()}
        style={style}
        onClick={onOpenProfile}
      >
        <div className="current-user-player-card__top">
          <div className="current-user-player-card__icon-wrap">{avatar}</div>
          {identityBlock}
        </div>
        {xpBlock}
      </button>
    );
  }

  return (
    <div className={`current-user-player-card ${className}`.trim()} style={style}>
      <div className="current-user-player-card__top">
        <div className="current-user-player-card__icon-wrap">{avatar}</div>
        {identityBlock}
      </div>
      {xpBlock}
    </div>
  );
}
