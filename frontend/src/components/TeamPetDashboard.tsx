import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  onOpenTeammateDm: (userId: string) => void;
  /** Center “You” pin: open identity / pet & theme (sidebar-equivalent). */
  onOpenSelfIdentity: () => void;
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
const SELF_MAP_PCT_PREFIX = "teamchat.selfMapPct.";

function clampMapPinPct(v: number): number {
  return Math.min(96, Math.max(4, v));
}

function loadSelfMapPct(userId: string): { x: number; y: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${SELF_MAP_PCT_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const rec = parsed as Record<string, unknown>;
    const x = Number(rec.x);
    const y = Number(rec.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: clampMapPinPct(x), y: clampMapPinPct(y) };
  } catch {
    return null;
  }
}

function persistSelfMapPct(userId: string, p: { x: number; y: number }): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${SELF_MAP_PCT_PREFIX}${userId}`,
      JSON.stringify({ x: clampMapPinPct(p.x), y: clampMapPinPct(p.y) })
    );
  } catch {
    /* ignore */
  }
}
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

function nonCenterLayoutHasDuplicateAssignee(layout: DashboardStationLayout): boolean {
  const seen = new Set<string>();
  for (const stationId of NON_CENTER_STATION_IDS) {
    const id = layout[stationId];
    if (!id) continue;
    if (seen.has(id)) return true;
    seen.add(id);
  }
  return false;
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

  const merged = mergeSavedLayoutWithDefault(defaults, saved);
  if (nonCenterLayoutHasDuplicateAssignee(merged)) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore storage failures */
    }
    return defaults;
  }
  return merged;
}

function formatUnread(count: number): string {
  return count > 99 ? "99+" : `${count}`;
}

/** Map “world” is larger than the viewport so users can pan (Google Maps–style). */
const MAP_WORLD_FRACTION = 1.8;
const MAP_SCALE_MIN = 0.72;
const MAP_SCALE_MAX = 2.6;

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

/** One pin per user; prefer a desk station over an overflow duplicate (fixes two “You” + dead drag). */
function dedupeMapPinsByProfileId(pins: MapPinModel[]): MapPinModel[] {
  const best = new Map<string, MapPinModel>();
  for (const pin of pins) {
    const id = pin.profile.id;
    const prev = best.get(id);
    if (!prev) {
      best.set(id, pin);
      continue;
    }
    const prevDesk = prev.stationId != null;
    const pinDesk = pin.stationId != null;
    if (pinDesk && !prevDesk) {
      best.set(id, pin);
    }
  }
  const out = [...best.values()];
  out.sort((a, b) => {
    const rank = (p: MapPinModel) => {
      if (!p.stationId) return 900;
      if (p.stationId === "center") return 0;
      const idx = NON_CENTER_STATION_IDS.indexOf(p.stationId as NonCenterStationId);
      return idx >= 0 ? 1 + idx : 800;
    };
    return rank(a) - rank(b) || a.profile.display_name.localeCompare(b.profile.display_name);
  });
  return out;
}

export function TeamPetDashboard({
  currentUser,
  teammates,
  currentUserPetId,
  availablePetIds,
  onlineUserIds,
  dmConversationByUserId,
  unreadByConversationId,
  totalXpByUserId,
  onOpenTeammateDm,
  onOpenSelfIdentity,
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
  const [selfMapPct, setSelfMapPct] = useState<{ x: number; y: number } | null>(() =>
    loadSelfMapPct(currentUser.id)
  );

  const mapViewportRef = useRef<HTMLDivElement | null>(null);
  const mapWorldRef = useRef<HTMLDivElement | null>(null);
  const selfDragSessionRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originPct: { x: number; y: number };
    moved: boolean;
  } | null>(null);
  const mapPanSessionRef = useRef<{ startClientX: number; startClientY: number; startPanX: number; startPanY: number } | null>(
    null
  );
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const [mapScale, setMapScale] = useState(1);

  const getMapPanBounds = useCallback(() => {
    const el = mapViewportRef.current;
    if (!el) {
      return { maxX: 0, maxY: 0 };
    }
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const dw = vw * MAP_WORLD_FRACTION * mapScale;
    const dh = vh * MAP_WORLD_FRACTION * mapScale;
    return {
      maxX: Math.max(0, (dw - vw) / 2),
      maxY: Math.max(0, (dh - vh) / 2),
    };
  }, [mapScale]);

  const clampMapPan = useCallback(
    (x: number, y: number) => {
      const { maxX, maxY } = getMapPanBounds();
      return {
        x: Math.min(maxX, Math.max(-maxX, x)),
        y: Math.min(maxY, Math.max(-maxY, y)),
      };
    },
    [getMapPanBounds]
  );

  useLayoutEffect(() => {
    setMapPan((prev) => clampMapPan(prev.x, prev.y));
  }, [clampMapPan, mapScale]);

  useLayoutEffect(() => {
    const el = mapViewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      return;
    }
    const ro = new ResizeObserver(() => {
      setMapPan((prev) => clampMapPan(prev.x, prev.y));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [clampMapPan]);

  useEffect(() => {
    const el = mapViewportRef.current;
    if (!el) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0014);
      setMapScale((prev) => {
        const next = Math.min(MAP_SCALE_MAX, Math.max(MAP_SCALE_MIN, prev * factor));
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const isMapPanTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) {
      return false;
    }
    return !target.closest("button.team-pet-map-pin-hit");
  }, []);

  const handleMapViewportPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      if (!isMapPanTarget(event.target)) {
        return;
      }
      mapPanSessionRef.current = {
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPanX: mapPan.x,
        startPanY: mapPan.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [isMapPanTarget, mapPan.x, mapPan.y]
  );

  const handleMapViewportPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const session = mapPanSessionRef.current;
      if (!session) {
        return;
      }
      const dx = event.clientX - session.startClientX;
      const dy = event.clientY - session.startClientY;
      setMapPan(clampMapPan(session.startPanX + dx, session.startPanY + dy));
    },
    [clampMapPan]
  );

  const handleMapViewportPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    mapPanSessionRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* not captured */
    }
  }, []);

  const handleMapViewportLostPointerCapture = useCallback(() => {
    mapPanSessionRef.current = null;
  }, []);

  useEffect(() => {
    setStationLayout(loadInitialLayout(currentUser, allProfiles, leaderId));
  }, [allProfiles, currentUser, leaderId]);

  useEffect(() => {
    setSelfMapPct(loadSelfMapPct(currentUser.id));
  }, [currentUser.id]);

  const handleSelfPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, layoutXPct: number, layoutYPct: number) => {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      if (event.shiftKey) {
        setSelfMapPct(null);
        try {
          window.localStorage.removeItem(`${SELF_MAP_PCT_PREFIX}${currentUser.id}`);
        } catch {
          /* ignore */
        }
        return;
      }
      const origin = selfMapPct ?? { x: layoutXPct, y: layoutYPct };
      selfDragSessionRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        originPct: { ...origin },
        moved: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [currentUser.id, selfMapPct]
  );

  const handleSelfPointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const session = selfDragSessionRef.current;
    if (!session || event.pointerId !== session.pointerId) {
      return;
    }
    const world = mapWorldRef.current;
    if (!world) {
      return;
    }
    const dx = event.clientX - session.startClientX;
    const dy = event.clientY - session.startClientY;
    if (dx * dx + dy * dy > 36) {
      session.moved = true;
    }
    const r = world.getBoundingClientRect();
    const w = Math.max(1, r.width);
    const h = Math.max(1, r.height);
    setSelfMapPct({
      x: clampMapPinPct(session.originPct.x + (dx / w) * 100),
      y: clampMapPinPct(session.originPct.y + (dy / h) * 100),
    });
  }, []);

  const handleSelfPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const session = selfDragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* not captured */
      }
      selfDragSessionRef.current = null;
      if (!session.moved) {
        onOpenSelfIdentity();
        return;
      }
      const world = mapWorldRef.current;
      if (!world) {
        return;
      }
      const dx = event.clientX - session.startClientX;
      const dy = event.clientY - session.startClientY;
      const r = world.getBoundingClientRect();
      const w = Math.max(1, r.width);
      const h = Math.max(1, r.height);
      const final = {
        x: clampMapPinPct(session.originPct.x + (dx / w) * 100),
        y: clampMapPinPct(session.originPct.y + (dy / h) * 100),
      };
      setSelfMapPct(final);
      persistSelfMapPct(currentUser.id, final);
    },
    [currentUser.id, onOpenSelfIdentity]
  );

  const handleSelfPointerCancel = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const session = selfDragSessionRef.current;
    if (!session || event.pointerId !== session.pointerId) {
      return;
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* not captured */
    }
    selfDragSessionRef.current = null;
  }, []);

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

    return dedupeMapPinsByProfileId(list);
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

  const mapPins = useMemo(
    () => pins.filter((pin) => pin.isSelf || onlineUserIds.has(pin.profile.id)),
    [pins, onlineUserIds]
  );

  return (
    <div className="team-pet-dashboard">
      <div className="team-pet-dashboard-inner">
        <div className="team-pet-dashboard-canvas">
          <div className="team-pet-dashboard-map-area team-map-section dashboard-map-section" aria-label="Team map">
            <div className="dashboard-map-stage dashboard-map-stage--immersive">
              <div
                ref={mapViewportRef}
                className="dashboard-map-viewport"
                aria-label="Team map: drag to move, scroll wheel to zoom"
                style={{ "--dashboard-map-world-fraction": MAP_WORLD_FRACTION } as CSSProperties}
                onPointerDown={handleMapViewportPointerDown}
                onPointerMove={handleMapViewportPointerMove}
                onPointerUp={handleMapViewportPointerUp}
                onPointerCancel={handleMapViewportPointerUp}
                onLostPointerCapture={handleMapViewportLostPointerCapture}
              >
                <div
                  ref={mapWorldRef}
                  className="dashboard-map-world"
                  style={{
                    transform: `translate(calc(-50% + ${mapPan.x}px), calc(-50% + ${mapPan.y}px)) scale(${mapScale})`,
                  }}
                >
                  <img
                    className="dashboard-map-bg"
                    src="/assets/background.png"
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                  />
                  <div className="dashboard-map-overlays">
              {mapPins.map(({ profile, petId, label, x, y, slotKey, stationId: _stationId, isSelf, unread, isLeader }) => {
              const isOnline = onlineUserIds.has(profile.id);
              const presenceOnline = isSelf || isOnline;
              const totalXp = xpFor(profile.id);
              const hasForcedSlot = slotKey !== "default";
              const displayXPct = isSelf && selfMapPct ? selfMapPct.x : x;
              const displayYPct = isSelf && selfMapPct ? selfMapPct.y : y;
              const slotClass = hasForcedSlot && !isSelf ? `pet-slot--${slotKey}` : "";

              const inner = (
                <>
                  <div className={`team-pet-map-pin-visual ${isLeader && !isSelf ? "team-pet-map-pin-visual--leader" : ""}`}>
                    <PetAvatar
                      petId={petId}
                      label={profile.display_name}
                      size="xl"
                      clip="soft"
                      animated={false}
                      className="team-pet-map-pin-avatar"
                    />
                    <span
                      className={`team-pet-map-presence ${presenceOnline ? "team-pet-map-presence-online" : "team-pet-map-presence-offline"}`}
                      aria-label={presenceOnline ? "Online" : "Offline"}
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
                    className={`team-pet-map-pin ${isSelf ? "team-pet-map-pin--self" : ""} ${isLeader ? "team-pet-map-pin--leader" : ""} ${slotClass} ${isSelf ? "team-pet-map-pin--draggable" : ""}`}
                    style={slotClass ? undefined : { left: `${displayXPct}%`, top: `${displayYPct}%` }}
                  >
                    {isSelf ? (
                      <button
                        type="button"
                        className="team-pet-map-pin-hit"
                        title="Drag to move on the map. Short tap opens appearance. Shift+click clears your saved spot."
                        aria-label={
                          isLeader && isSelf
                            ? "You, Ari Wang — open identity and appearance"
                            : `You, ${profile.display_name} — open identity and appearance`
                        }
                        draggable={false}
                        onPointerDown={(e) => handleSelfPointerDown(e, x, y)}
                        onPointerMove={handleSelfPointerMove}
                        onPointerUp={handleSelfPointerUp}
                        onPointerCancel={handleSelfPointerCancel}
                      >
                        {inner}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="team-pet-map-pin-hit"
                        onClick={() => onOpenTeammateDm(profile.id)}
                        aria-label={`Open chat with ${profile.display_name}`}
                        draggable={false}
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
        </div>

        <header className="team-pet-dashboard-header team-pet-dashboard-header--over-map">
          <div className="team-pet-dashboard-header-title">
            <h2 className="team-pet-dashboard-title">Team Dashboard</h2>
          </div>
        </header>
      </div>
    </div>
  );
}
