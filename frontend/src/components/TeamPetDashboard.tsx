import { useMemo } from "react";
import { PetAvatar } from "./PetAvatar";
import { XpProgressBadge } from "./XpProgressBadge";
import type { InternalProfile } from "../lib/authProfile";
import { getAssignedPetIdForUser } from "../utils/petAssignment";
import { isValidPetId } from "../constants/pets";

export type TeamPetDashboardProps = {
  currentUser: InternalProfile;
  /** Same teammate list as sidebar Direct Messages (excludes current user). */
  teammates: InternalProfile[];
  currentUserPetId: string;
  availablePetIds: string[];
  onlineUserIds: Set<string>;
  dmConversationByUserId: Record<string, string>;
  unreadByConversationId: Record<string, number>;
  /** Lifetime XP per profile id (local + mock sample values). */
  totalXpByUserId: Record<string, number>;
  onBackToDashboard: () => void;
  onLogout: () => void;
  onToggleUpdates: () => void;
  onOpenTeammateDm: (userId: string) => void;
};

/** Current user (non–Ari Wang) anchor within the map image box. */
const SELF_SPOT = { x: 50, y: 18 };

const LEADER_NAME_KEY = "ari wang";
const FORCED_USER_SLOT: Record<string, string> = {
  "Bingchen Li": "top-desk",
};

const MAP_POSITION_BY_DISPLAY_NAME: Record<string, { x: number; y: number }> = {
  "ari wang": { x: 50, y: 50 },
  "dr. thu": { x: 24, y: 34 },
  jason: { x: 76, y: 34 },
  kevin: { x: 24, y: 68 },
  "mona weng": { x: 76, y: 68 },
  "shirley li": { x: 50, y: 82 },
};

/** Spots for teammates whose display name is not listed in {@link MAP_POSITION_BY_DISPLAY_NAME}. */
const FALLBACK_TEAMMATE_POSITIONS: { x: number; y: number }[] = [
  { x: 38, y: 44 },
  { x: 62, y: 44 },
  { x: 38, y: 56 },
  { x: 62, y: 56 },
  { x: 50, y: 38 },
  { x: 50, y: 62 },
  { x: 18, y: 50 },
  { x: 82, y: 50 },
];

function normalizeDisplayKey(name: string): string {
  return name.trim().toLowerCase();
}

function isLeaderProfile(profile: InternalProfile): boolean {
  return normalizeDisplayKey(profile.display_name) === LEADER_NAME_KEY;
}

function spotForTeammate(profile: InternalProfile, fallbackIndex: number): { x: number; y: number } {
  const mapped = MAP_POSITION_BY_DISPLAY_NAME[normalizeDisplayKey(profile.display_name)];
  if (mapped) {
    return mapped;
  }
  return FALLBACK_TEAMMATE_POSITIONS[fallbackIndex % FALLBACK_TEAMMATE_POSITIONS.length]!;
}

function formatUnread(count: number): string {
  return count > 99 ? "99+" : `${count}`;
}

type MapPinModel = {
  profile: InternalProfile;
  petId: string | null;
  label: string;
  x: number;
  y: number;
  slotKey: string;
  isSelf: boolean;
  unread: number;
  isLeader: boolean;
};

export function TeamPetDashboard({
  currentUser,
  teammates,
  currentUserPetId,
  availablePetIds,
  onlineUserIds,
  dmConversationByUserId,
  unreadByConversationId,
  totalXpByUserId,
  onBackToDashboard,
  onLogout,
  onToggleUpdates,
  onOpenTeammateDm,
}: TeamPetDashboardProps) {
  const pins = useMemo(() => {
    const list: MapPinModel[] = [];

    const selfPetId = isValidPetId(currentUserPetId)
      ? currentUserPetId
      : getAssignedPetIdForUser(currentUser.id, availablePetIds);

    const selfIsLeader = isLeaderProfile(currentUser);

    list.push({
      profile: currentUser,
      petId: selfPetId,
      label: selfIsLeader ? "You · Ari Wang" : "You",
      x: selfIsLeader ? MAP_POSITION_BY_DISPLAY_NAME[LEADER_NAME_KEY]!.x : SELF_SPOT.x,
      y: selfIsLeader ? MAP_POSITION_BY_DISPLAY_NAME[LEADER_NAME_KEY]!.y : SELF_SPOT.y,
      slotKey: "default",
      isSelf: true,
      unread: 0,
      isLeader: selfIsLeader,
    });

    const sorted = [...teammates].sort((a, b) => a.display_name.localeCompare(b.display_name));
    sorted.forEach((user, index) => {
      if (isLeaderProfile(user) && selfIsLeader) {
        return;
      }
      const stored = user.pet_id;
      const petId =
        stored && isValidPetId(stored) ? stored : getAssignedPetIdForUser(user.id, availablePetIds);
      const dmId = dmConversationByUserId[user.id];
      const unread = dmId ? unreadByConversationId[dmId] ?? 0 : 0;
      const forcedSlot = FORCED_USER_SLOT[user.display_name];
      const defaultSlotKey = "default";
      const slotKey = forcedSlot ?? defaultSlotKey;
      const { x, y } = spotForTeammate(user, index);
      list.push({
        profile: user,
        petId,
        label: user.display_name,
        x,
        y,
        slotKey,
        isSelf: false,
        unread,
        isLeader: isLeaderProfile(user),
      });
    });

    return list;
  }, [
    availablePetIds,
    currentUser,
    currentUserPetId,
    dmConversationByUserId,
    teammates,
    unreadByConversationId,
  ]);

  const xpFor = (userId: string) => totalXpByUserId[userId] ?? 0;

  return (
    <div className="team-pet-dashboard">
      <div className="team-pet-dashboard-inner">
        <header className="team-pet-dashboard-header">
          <div>
            <h2 className="team-pet-dashboard-title">Team Dashboard</h2>
          </div>
          <div className="team-pet-dashboard-header-actions">
            <button
              type="button"
              className="team-pet-dashboard-back team-pet-dashboard-back--quiet team-action-button"
              onClick={onBackToDashboard}
            >
              Back to Dashboard
            </button>
            <button
              type="button"
              className="updates-toggle-mobile updates-toggle-mobile--dashboard team-action-button team-action-button-updates"
              onClick={onToggleUpdates}
            >
              Updates
            </button>
            <button type="button" className="logout-btn team-action-button" onClick={onLogout}>
              Logout
            </button>
          </div>
        </header>

        <div className="team-pet-dashboard-map-area team-map-section dashboard-map-section" aria-label="Team map">
          <div className="dashboard-map-stage">
            <img className="dashboard-map-bg" src="/assets/background.png" alt="" aria-hidden="true" />
            <div className="dashboard-map-overlays">
              {pins.map(({ profile, petId, label, x, y, slotKey, isSelf, unread, isLeader }) => {
              const isOnline = onlineUserIds.has(profile.id);
              const totalXp = xpFor(profile.id);
              const hasForcedSlot = slotKey !== "default";

              const inner = (
                <>
                  <div className={`team-pet-map-pin-visual ${isLeader && !isSelf ? "team-pet-map-pin-visual--leader" : ""}`}>
                    <PetAvatar
                      petId={petId}
                      label={profile.display_name}
                      size="xl"
                      clip="soft"
                      animated
                      className="team-pet-map-pin-avatar"
                    />
                    <span
                      className={`team-pet-map-presence ${isOnline ? "team-pet-map-presence-online" : "team-pet-map-presence-offline"}`}
                      aria-label={isOnline ? "Online" : "Offline"}
                    />
                    {!isSelf && unread > 0 ? (
                      <span className="team-pet-map-unread" aria-label={`${unread} unread messages`}>
                        {formatUnread(unread)}
                      </span>
                    ) : null}
                  </div>
                  <span className="team-pet-map-pin-label-wrap">
                    <span className="team-pet-map-pin-label">{label}</span>
                    {isLeader ? (
                      <span className="team-pet-map-pin-leader-pill" aria-hidden="true">
                        Leader
                      </span>
                    ) : null}
                    <XpProgressBadge totalXp={totalXp} compact variant="map" className="team-pet-map-xp-badge" />
                  </span>
                </>
              );

                return (
                  <div
                    key={profile.id}
                    className={`team-pet-map-pin ${isSelf ? "team-pet-map-pin--self" : ""} ${isLeader ? "team-pet-map-pin--leader" : ""} ${hasForcedSlot ? `pet-slot--${slotKey}` : ""}`}
                    style={hasForcedSlot ? undefined : { left: `${x}%`, top: `${y}%` }}
                  >
                    {isSelf ? (
                      <div
                        className="team-pet-map-pin-hit"
                        aria-label={isLeader && isSelf ? "You, Ari Wang" : `You, ${profile.display_name}`}
                      >
                        {inner}
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="team-pet-map-pin-hit"
                        onClick={() => onOpenTeammateDm(profile.id)}
                        aria-label={`Open chat with ${profile.display_name}`}
                      >
                        {inner}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
