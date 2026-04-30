import type { DragEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  onLogout: () => void;
  onOpenTeammateDm: (userId: string) => void;
};

const LEADER_NAME_KEY = "ari wang";
const FORCED_USER_SLOT: Record<string, string> = {
  "Bingchen Li": "top-desk",
};

type StationId =
  | "center"
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

type NonCenterStationId = Exclude<StationId, "center">;
type DashboardStationLayout = Record<StationId, string | null>;

const LAYOUT_STORAGE_PREFIX = "teamchat.dashboardStationLayout.";
const NON_CENTER_STATION_IDS: NonCenterStationId[] = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

const STATION_POSITION: Record<StationId, { x: number; y: number }> = {
  center: { x: 50, y: 50 },
  "top-left": { x: 24, y: 34 },
  "top-center": { x: 50, y: 18 },
  "top-right": { x: 76, y: 34 },
  "bottom-left": { x: 24, y: 68 },
  "bottom-center": { x: 50, y: 82 },
  "bottom-right": { x: 76, y: 68 },
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

function buildStorageKey(currentUserId: string): string {
  return `${LAYOUT_STORAGE_PREFIX}${currentUserId}`;
}

function preferredStationForProfile(profile: InternalProfile): NonCenterStationId | null {
  const name = normalizeDisplayKey(profile.display_name);
  if (name === "dr. thu") return "top-left";
  if (name === "jason") return "top-right";
  if (name === "kevin") return "bottom-left";
  if (name === "mona weng") return "bottom-right";
  if (name === "shirley li") return "bottom-center";
  return null;
}

function buildDefaultLayout(
  currentUser: InternalProfile,
  allProfiles: InternalProfile[],
  leaderId: string
): DashboardStationLayout {
  const nonLeaderProfiles = allProfiles.filter((profile) => profile.id !== leaderId);
  const prioritized = [
    ...nonLeaderProfiles.filter((profile) => profile.id === currentUser.id),
    ...nonLeaderProfiles
      .filter((profile) => profile.id !== currentUser.id)
      .sort((a, b) => a.display_name.localeCompare(b.display_name)),
  ];

  const layout: DashboardStationLayout = {
    center: leaderId,
    "top-left": null,
    "top-center": null,
    "top-right": null,
    "bottom-left": null,
    "bottom-center": null,
    "bottom-right": null,
  };
  const usedStations = new Set<NonCenterStationId>();

  for (const profile of prioritized) {
    const preferredStation = preferredStationForProfile(profile);
    if (preferredStation && !usedStations.has(preferredStation)) {
      layout[preferredStation] = profile.id;
      usedStations.add(preferredStation);
    }
  }

  for (const profile of prioritized) {
    const alreadyAssigned = NON_CENTER_STATION_IDS.some((stationId) => layout[stationId] === profile.id);
    if (alreadyAssigned) {
      continue;
    }
    const openStation = NON_CENTER_STATION_IDS.find((stationId) => !usedStations.has(stationId));
    if (!openStation) {
      break;
    }
    layout[openStation] = profile.id;
    usedStations.add(openStation);
  }

  return layout;
}

function parseSavedLayout(raw: string | null): Partial<Record<NonCenterStationId, string>> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const candidate: Partial<Record<NonCenterStationId, string>> = {};
    for (const stationId of NON_CENTER_STATION_IDS) {
      const value = (parsed as Record<string, unknown>)[stationId];
      if (value == null) {
        continue;
      }
      if (typeof value !== "string") {
        return null;
      }
      candidate[stationId] = value;
    }
    return candidate;
  } catch {
    return null;
  }
}

function isSavedLayoutValid(
  saved: Partial<Record<NonCenterStationId, string>>,
  allProfileIds: Set<string>,
  leaderId: string,
  requiredAssignments: number
): boolean {
  const seenIds = new Set<string>();
  let assignedCount = 0;

  for (const stationId of NON_CENTER_STATION_IDS) {
    const profileId = saved[stationId];
    if (!profileId) {
      continue;
    }
    assignedCount += 1;
    if (profileId === leaderId || !allProfileIds.has(profileId) || seenIds.has(profileId)) {
      return false;
    }
    seenIds.add(profileId);
  }

  return assignedCount === requiredAssignments;
}

function mergeSavedLayoutWithDefault(
  defaults: DashboardStationLayout,
  saved: Partial<Record<NonCenterStationId, string>>
): DashboardStationLayout {
  const merged: DashboardStationLayout = { ...defaults };
  const used = new Set<string>();

  for (const stationId of NON_CENTER_STATION_IDS) {
    const savedId = saved[stationId];
    if (!savedId || used.has(savedId)) {
      continue;
    }
    merged[stationId] = savedId;
    used.add(savedId);
  }

  const remainingDefaultIds = NON_CENTER_STATION_IDS.map((stationId) => defaults[stationId]).filter(
    (profileId): profileId is string => Boolean(profileId) && !used.has(profileId)
  );
  for (const stationId of NON_CENTER_STATION_IDS) {
    const mergedId = merged[stationId];
    if (mergedId && used.has(mergedId)) {
      continue;
    }
    const nextDefault = remainingDefaultIds.shift() ?? null;
    merged[stationId] = nextDefault;
    if (nextDefault) {
      used.add(nextDefault);
    }
  }

  return merged;
}

function persistNonCenterLayout(currentUserId: string, layout: DashboardStationLayout): void {
  if (typeof window === "undefined") return;
  const payload: Partial<Record<NonCenterStationId, string>> = {};
  for (const stationId of NON_CENTER_STATION_IDS) {
    const value = layout[stationId];
    if (value) {
      payload[stationId] = value;
    }
  }
  try {
    window.localStorage.setItem(buildStorageKey(currentUserId), JSON.stringify(payload));
  } catch {
    /* ignore storage failures */
  }
}

function loadInitialLayout(
  currentUser: InternalProfile,
  allProfiles: InternalProfile[],
  leaderId: string
): DashboardStationLayout {
  const defaults = buildDefaultLayout(currentUser, allProfiles, leaderId);
  if (typeof window === "undefined") return defaults;

  const key = buildStorageKey(currentUser.id);
  const rawSaved = window.localStorage.getItem(key);
  const saved = parseSavedLayout(rawSaved);
  if (!saved) {
    if (rawSaved) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore storage failures */
      }
    }
    return defaults;
  }

  const allProfileIds = new Set(allProfiles.map((profile) => profile.id));
  const requiredAssignments = Math.min(NON_CENTER_STATION_IDS.length, allProfiles.length - 1);
  const valid = isSavedLayoutValid(saved, allProfileIds, leaderId, requiredAssignments);
  if (!valid) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore storage failures */
    }
    return defaults;
  }

  return mergeSavedLayoutWithDefault(defaults, saved);
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
  stationId: StationId | null;
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
  onLogout,
  onOpenTeammateDm,
}: TeamPetDashboardProps) {
  const allProfiles = useMemo(() => {
    const uniqueById = new Map<string, InternalProfile>();
    uniqueById.set(currentUser.id, currentUser);
    for (const teammate of teammates) {
      if (!uniqueById.has(teammate.id)) {
        uniqueById.set(teammate.id, teammate);
      }
    }
    return Array.from(uniqueById.values());
  }, [currentUser, teammates]);

  const leaderProfile = useMemo(() => {
    const found = allProfiles.find((profile) => isLeaderProfile(profile));
    return found ?? currentUser;
  }, [allProfiles, currentUser]);
  const leaderId = leaderProfile.id;

  const [stationLayout, setStationLayout] = useState<DashboardStationLayout>(() =>
    loadInitialLayout(currentUser, allProfiles, leaderId)
  );
  const [draggingStationId, setDraggingStationId] = useState<NonCenterStationId | null>(null);
  const [dropStationId, setDropStationId] = useState<NonCenterStationId | null>(null);

  useEffect(() => {
    setStationLayout(loadInitialLayout(currentUser, allProfiles, leaderId));
  }, [allProfiles, currentUser, leaderId]);

  const isValidDraggableStation = useCallback(
    (stationId: string | null | undefined): stationId is NonCenterStationId => {
      if (!stationId || stationId === "center") return false;
      return NON_CENTER_STATION_IDS.includes(stationId as NonCenterStationId);
    },
    []
  );

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLElement>, stationId: StationId | null, isLeader: boolean) => {
      if (!isValidDraggableStation(stationId) || isLeader) {
        event.preventDefault();
        return;
      }
      setDraggingStationId(stationId);
      setDropStationId(null);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", stationId);
    },
    [isValidDraggableStation]
  );

  const handleDragEnd = useCallback(() => {
    setDraggingStationId(null);
    setDropStationId(null);
  }, []);

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLElement>, targetStationId: StationId | null) => {
      if (!isValidDraggableStation(targetStationId)) {
        return;
      }
      if (!draggingStationId || draggingStationId === targetStationId) {
        return;
      }
      event.preventDefault();
      setDropStationId(targetStationId);
    },
    [draggingStationId, isValidDraggableStation]
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLElement>, targetStationId: StationId | null) => {
      if (!isValidDraggableStation(targetStationId)) {
        return;
      }
      event.preventDefault();
      const sourceStationFromData = event.dataTransfer.getData("text/plain");
      const sourceStationId = isValidDraggableStation(sourceStationFromData)
        ? sourceStationFromData
        : draggingStationId;
      if (!sourceStationId || sourceStationId === targetStationId) {
        setDropStationId(null);
        return;
      }

      const sourceProfileId = stationLayout[sourceStationId];
      const targetProfileId = stationLayout[targetStationId];
      if (!sourceProfileId || !targetProfileId || sourceProfileId === leaderId || targetProfileId === leaderId) {
        setDropStationId(null);
        return;
      }

      const nextLayout: DashboardStationLayout = {
        ...stationLayout,
        [sourceStationId]: targetProfileId,
        [targetStationId]: sourceProfileId,
        center: leaderId,
      };
      setStationLayout(nextLayout);
      persistNonCenterLayout(currentUser.id, nextLayout);
      setDropStationId(null);
      setDraggingStationId(null);
    },
    [currentUser.id, draggingStationId, isValidDraggableStation, leaderId, stationLayout]
  );

  const pins = useMemo(() => {
    const list: MapPinModel[] = [];
    const profileById = new Map(allProfiles.map((profile) => [profile.id, profile]));

    const assignedIds = new Set<string>();
    const pushStationPin = (stationId: StationId) => {
      const profileId = stationLayout[stationId];
      if (!profileId) return;
      const profile = profileById.get(profileId);
      if (!profile) return;
      assignedIds.add(profileId);

      const isSelf = profile.id === currentUser.id;
      const isLeader = profile.id === leaderId;
      const stored = isSelf ? currentUserPetId : profile.pet_id;
      const petId =
        stored && isValidPetId(stored) ? stored : getAssignedPetIdForUser(profile.id, availablePetIds);
      const dmId = isSelf ? undefined : dmConversationByUserId[profile.id];
      const unread = dmId ? unreadByConversationId[dmId] ?? 0 : 0;
      const position = STATION_POSITION[stationId];
      list.push({
        profile,
        petId,
        label: isSelf ? (isLeader ? "You · Ari Wang" : "You") : profile.display_name,
        x: position.x,
        y: position.y,
        slotKey: "default",
        stationId,
        isSelf,
        unread,
        isLeader,
      });
    };

    pushStationPin("center");
    for (const stationId of NON_CENTER_STATION_IDS) {
      pushStationPin(stationId);
    }

    const overflowUsers = allProfiles
      .filter((profile) => profile.id !== leaderId && !assignedIds.has(profile.id))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
    overflowUsers.forEach((profile, index) => {
      const stored = profile.id === currentUser.id ? currentUserPetId : profile.pet_id;
      const petId =
        stored && isValidPetId(stored) ? stored : getAssignedPetIdForUser(profile.id, availablePetIds);
      const dmId = profile.id === currentUser.id ? undefined : dmConversationByUserId[profile.id];
      const unread = dmId ? unreadByConversationId[dmId] ?? 0 : 0;
      const forcedSlot = FORCED_USER_SLOT[profile.display_name];
      const position = FALLBACK_TEAMMATE_POSITIONS[index % FALLBACK_TEAMMATE_POSITIONS.length]!;
      list.push({
        profile,
        petId,
        label: profile.id === currentUser.id ? "You" : profile.display_name,
        x: position.x,
        y: position.y,
        slotKey: forcedSlot ?? "default",
        stationId: null,
        isSelf: profile.id === currentUser.id,
        unread,
        isLeader: false,
      });
    });

    return list;
  }, [
    allProfiles,
    availablePetIds,
    currentUser.id,
    currentUserPetId,
    dmConversationByUserId,
    leaderId,
    stationLayout,
    unreadByConversationId,
  ]);

  const xpFor = (userId: string) => totalXpByUserId[userId] ?? 0;

  return (
    <div className="team-pet-dashboard">
      <div className="team-pet-dashboard-inner">
        <header className="team-pet-dashboard-header">
          <div className="team-pet-dashboard-header-title">
            <h2 className="team-pet-dashboard-title">Team Dashboard</h2>
          </div>
          <div className="team-pet-dashboard-header-actions">
            <button
              type="button"
              className="team-dashboard-header-btn team-dashboard-header-btn--logout"
              onClick={onLogout}
              aria-label="Log out"
              title="Log out"
            >
              <svg
                className="team-dashboard-header-btn-logout-icon"
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </header>

        <div className="team-pet-dashboard-map-area team-map-section dashboard-map-section" aria-label="Team map">
          <div className="dashboard-map-stage">
            <img className="dashboard-map-bg" src="/assets/background.png" alt="" aria-hidden="true" />
            <div className="dashboard-map-overlays">
              {pins.map(({ profile, petId, label, x, y, slotKey, stationId, isSelf, unread, isLeader }) => {
              const isOnline = onlineUserIds.has(profile.id);
              const totalXp = xpFor(profile.id);
              const hasForcedSlot = slotKey !== "default";
              const isDraggableStation = Boolean(stationId) && !isLeader;
              const isActiveDropTarget =
                Boolean(stationId) && !isLeader && dropStationId === stationId && draggingStationId !== stationId;
              const isDragging = Boolean(stationId) && draggingStationId === stationId;

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
                    className={`team-pet-map-pin ${isSelf ? "team-pet-map-pin--self" : ""} ${isLeader ? "team-pet-map-pin--leader" : ""} ${hasForcedSlot ? `pet-slot--${slotKey}` : ""} ${isDraggableStation ? "team-pet-map-pin--draggable" : ""} ${isActiveDropTarget ? "team-pet-map-pin--drop-target" : ""} ${isDragging ? "team-pet-map-pin--dragging" : ""}`}
                    style={hasForcedSlot ? undefined : { left: `${x}%`, top: `${y}%` }}
                    onDragOver={(event) => handleDragOver(event, stationId)}
                    onDrop={(event) => handleDrop(event, stationId)}
                    onDragLeave={() => {
                      if (dropStationId === stationId) {
                        setDropStationId(null);
                      }
                    }}
                  >
                    {isSelf ? (
                      <div
                        className="team-pet-map-pin-hit"
                        aria-label={isLeader && isSelf ? "You, Ari Wang" : `You, ${profile.display_name}`}
                        draggable={isDraggableStation}
                        onDragStart={(event) => handleDragStart(event, stationId, isLeader)}
                        onDragEnd={handleDragEnd}
                      >
                        {inner}
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="team-pet-map-pin-hit"
                        onClick={() => onOpenTeammateDm(profile.id)}
                        aria-label={`Open chat with ${profile.display_name}`}
                        draggable={isDraggableStation}
                        onDragStart={(event) => handleDragStart(event, stationId, isLeader)}
                        onDragEnd={handleDragEnd}
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
