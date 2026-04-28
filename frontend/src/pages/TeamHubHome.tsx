import type { CSSProperties } from "react";
import { useCallback, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { PetAvatar } from "../components/PetAvatar";
import { getThemeCssVars, readStoredThemeId } from "../utils/theme";
import {
  PET_OPTIONS,
  PET_PIPELINE_HELPER_TEXT,
  getPetOptionById,
  isValidPetId,
  shouldShowPetPipelineHelper,
} from "../constants/pets";

const WORLD_BG_URL = "/assets/teamhub/world-bg.png";
const SELECTED_PET_STORAGE_KEY = "teamchat:selectedPetId";
const LEGACY_SELECTED_PET_STORAGE_KEY = "teamchat:selected-pet-id";

export type WorkspaceZone = {
  id: string;
  title: string;
  subtitle: string;
  xPct: number;
  yPct: number;
  /** Tailwind gradient classes for the card tint */
  themeClass: string;
};

const WORKSPACE_ZONES: WorkspaceZone[] = [
  {
    id: "dev-station",
    title: "Dev Station",
    subtitle: "Build & ship",
    xPct: 14,
    yPct: 42,
    themeClass: "from-violet-600/95 to-indigo-700/95",
  },
  {
    id: "design-lab",
    title: "Design Lab",
    subtitle: "UX & brand",
    xPct: 34,
    yPct: 28,
    themeClass: "from-fuchsia-500/95 to-pink-600/95",
  },
  {
    id: "data-lab",
    title: "Data Lab",
    subtitle: "Metrics & models",
    xPct: 58,
    yPct: 36,
    themeClass: "from-cyan-500/95 to-blue-600/95",
  },
  {
    id: "comm-hub",
    title: "Communication Hub",
    subtitle: "Team sync",
    xPct: 78,
    yPct: 52,
    themeClass: "from-emerald-500/95 to-teal-600/95",
  },
  {
    id: "ops-desk",
    title: "Operations Desk",
    subtitle: "Run the floor",
    xPct: 22,
    yPct: 68,
    themeClass: "from-amber-500/95 to-orange-600/95",
  },
  {
    id: "field-connect",
    title: "Field Connect",
    subtitle: "Out in the world",
    xPct: 48,
    yPct: 72,
    themeClass: "from-sky-500/95 to-blue-700/95",
  },
  {
    id: "focus-pod",
    title: "Focus Pod",
    subtitle: "Deep work",
    xPct: 72,
    yPct: 22,
    themeClass: "from-purple-600/95 to-violet-800/95",
  },
];

type CanvasPet = {
  id: string;
  userName: string;
  status: string;
  petId: string;
  xPct: number;
  yPct: number;
};

const SAMPLE_CANVAS_PETS: CanvasPet[] = [
  { id: "p1", userName: "Morgan", status: "Pairing on API", petId: "cat", xPct: 26, yPct: 55 },
  { id: "p2", userName: "Riley", status: "In design review", petId: "dog", xPct: 44, yPct: 48 },
  { id: "p3", userName: "Sam", status: "Writing specs", petId: "bunny", xPct: 63, yPct: 58 },
  { id: "p4", userName: "Jordan", status: "On a call", petId: "bee", xPct: 82, yPct: 34 },
  { id: "p5", userName: "Casey", status: "Focus mode", petId: "elephant", xPct: 38, yPct: 78 },
];

type TeamStatusRow = {
  name: string;
  task: string;
  progressPct: number;
  state: "Active" | "At Risk";
};

const TEAM_STATUS_MOCK: TeamStatusRow[] = [
  { name: "Jason", task: "Building bot", progressPct: 60, state: "Active" },
  { name: "Mona", task: "Cleaning noise", progressPct: 70, state: "Active" },
  { name: "Kevin", task: "3rd H&P today", progressPct: 30, state: "At Risk" },
  { name: "Dr. Thu", task: "Contacting case managers", progressPct: 50, state: "Active" },
  { name: "Shirley", task: "Optimizing prompt", progressPct: 80, state: "Active" },
];

const NAV_ITEMS: { label: string; to: string }[] = [
  { label: "Home", to: "/teamhub" },
  { label: "Messages", to: "/" },
  { label: "Tasks", to: "/teamhub" },
  { label: "Timeline", to: "/teamhub" },
  { label: "Team", to: "/teamhub" },
  { label: "Settings", to: "/teamhub" },
];

function isNavItemActive(pathname: string, item: (typeof NAV_ITEMS)[number]) {
  if (item.label === "Home") {
    return pathname === "/teamhub";
  }
  if (item.label === "Messages") {
    return pathname === "/" || pathname.startsWith("/chat");
  }
  return false;
}

function readStoredPetId(): string {
  const fallback = PET_OPTIONS[0]?.id ?? "";
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const next = localStorage.getItem(SELECTED_PET_STORAGE_KEY);
    if (next && isValidPetId(next)) {
      return next;
    }
    const legacy = localStorage.getItem(LEGACY_SELECTED_PET_STORAGE_KEY);
    if (legacy && isValidPetId(legacy)) {
      localStorage.setItem(SELECTED_PET_STORAGE_KEY, legacy);
      return legacy;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function ZoneCard({
  zone,
  onZoneClick,
}: {
  zone: WorkspaceZone;
  onZoneClick: (zone: WorkspaceZone) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onZoneClick(zone)}
      className="group absolute z-20 max-w-[min(200px,42vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl bg-gradient-to-br px-3 py-2 text-left text-white shadow-lg shadow-black/20 ring-1 ring-white/20 transition hover:z-30 hover:scale-[1.03] hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 md:max-w-[200px]"
      style={{ left: `${zone.xPct}%`, top: `${zone.yPct}%`, outlineColor: "var(--teamchat-accent)" }}
    >
      <span className={`pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br opacity-95 ${zone.themeClass}`} aria-hidden />
      <span className="relative z-10 block">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-white/90 md:text-xs">{zone.title}</span>
        <span className="mt-0.5 block text-[10px] text-white/80 md:text-[11px]">{zone.subtitle}</span>
      </span>
    </button>
  );
}

function TeamHubHome() {
  const location = useLocation();
  const [themeId] = useState(() => readStoredThemeId());
  const [bgFailed, setBgFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedPetId, setSelectedPetId] = useState<string>(() => readStoredPetId());
  const [draftPetId, setDraftPetId] = useState<string>(() => readStoredPetId());

  const points = 2840;
  const dayStreak = 12;
  const mockUser = useMemo(
    () => ({
      displayName: "Alex Rivera",
      xpPercent: 68,
      online: true,
    }),
    []
  );

  const handleZoneClick = useCallback((zone: WorkspaceZone) => {
    // Placeholder: wire to navigation or modals later
    console.info("[TeamHub] zone selected", zone.id);
  }, []);

  const handleSavePet = useCallback(() => {
    setSelectedPetId(draftPetId);
    try {
      localStorage.setItem(SELECTED_PET_STORAGE_KEY, draftPetId);
    } catch {
      /* ignore */
    }
    setPickerOpen(false);
  }, [draftPetId]);

  return (
    <div
      className="relative min-h-screen overflow-x-hidden bg-gradient-to-b from-slate-100 to-slate-200/90 text-slate-800"
      style={getThemeCssVars(themeId)}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-[1920px] flex-col lg:flex-row">
        {/* Left sidebar */}
        <aside className="flex w-full flex-col border-b border-slate-800/80 bg-[#12101c] text-slate-100 lg:min-h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r xl:w-72">
          <div className="flex items-center gap-2 px-4 py-5">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold text-white shadow-lg"
              style={{
                background: "linear-gradient(135deg, var(--teamchat-accent), color-mix(in srgb, var(--teamchat-accent) 45%, #0f172a))",
                boxShadow: "0 10px 24px var(--teamchat-glow)",
              }}
            >
              TH
            </div>
            <div>
              <p className="app-title text-lg font-semibold tracking-tight text-white">TeamHub</p>
              <p className="text-xs text-slate-400">Your team, one place</p>
            </div>
          </div>

          <nav className="flex flex-wrap gap-1 px-2 pb-3 lg:flex-col lg:flex-nowrap">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-white/10 ${
                  isNavItemActive(location.pathname, item) ? "bg-white/10 text-white" : "text-slate-300"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-auto space-y-3 px-3 pb-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <PetAvatar petId={selectedPetId} label={mockUser.displayName} size="lg" className="border-white/20" />
                  <span
                    className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-[#12101c] ${
                      mockUser.online ? "bg-emerald-400" : "bg-slate-500"
                    }`}
                    title={mockUser.online ? "Online" : "Offline"}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{mockUser.displayName}</p>
                  <p className="text-xs text-slate-400">{mockUser.online ? "Online" : "Away"}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${mockUser.xpPercent}%`,
                        background:
                          "linear-gradient(90deg, var(--teamchat-accent), color-mix(in srgb, var(--teamchat-accent) 55%, #f472b6))",
                      }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">XP {mockUser.xpPercent}% to next level</p>
                </div>
              </div>
            </div>

            <div
              className="rounded-2xl border p-3"
              style={{
                borderColor: "var(--teamchat-border)",
                background: "var(--teamchat-gradient)",
              }}
            >
              <p className="text-xs font-medium text-white/90">Streak & points</p>
              <div className="mt-2 flex items-end justify-between gap-2">
                <div>
                  <p className="text-2xl font-bold text-white">{points.toLocaleString()}</p>
                  <p className="text-[11px] text-white/75">team points</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-amber-300">{dayStreak} days</p>
                  <p className="text-[11px] text-amber-200/80">streak</p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <header className="sticky top-0 z-40 flex flex-col gap-3 border-b border-slate-200/80 bg-white/80 px-4 py-3 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-md">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3-3" strokeLinecap="round" />
                </svg>
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search TeamHub…"
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-inner shadow-slate-200/50 outline-none transition focus:ring-2"
                style={
                  {
                    ["--tw-ring-color" as string]: "color-mix(in srgb, var(--teamchat-accent) 45%, transparent)",
                  } as CSSProperties
                }
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <div
                className="flex items-center gap-2 rounded-full border bg-white/90 px-3 py-1.5 text-sm shadow-sm"
                style={{ borderColor: "var(--teamchat-border)" }}
              >
                <span className="text-slate-500">Points</span>
                <span className="font-semibold" style={{ color: "var(--teamchat-text)" }}>
                  {points.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-amber-200/80 bg-amber-50/90 px-3 py-1.5 text-sm shadow-sm">
                <span className="text-amber-800/80">Streak</span>
                <span className="font-semibold text-amber-700">{dayStreak}d</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDraftPetId(selectedPetId);
                  setPickerOpen(true);
                }}
                className="rounded-full px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-95"
                style={{
                  background: "var(--teamchat-accent)",
                  boxShadow: "0 4px 14px var(--teamchat-glow)",
                }}
              >
                Change pet
              </button>
            </div>
          </header>

          <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 xl:flex-row">
            {/* Canvas */}
            <section className="min-w-0 flex-1">
              <div className="mx-auto w-full max-w-full">
                <div
                  className="relative w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-200 shadow-lg shadow-slate-300/50 ring-1 ring-white/60"
                  style={{ aspectRatio: "16 / 10" }}
                >
                  {bgFailed ? (
                    <div className="absolute inset-0" style={{ background: "var(--teamchat-gradient)" }} aria-hidden />
                  ) : (
                    <img
                      src={WORLD_BG_URL}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                      onError={() => setBgFailed(true)}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/25 via-transparent to-slate-900/10" aria-hidden />

                  {WORKSPACE_ZONES.map((zone) => (
                    <ZoneCard key={zone.id} zone={zone} onZoneClick={handleZoneClick} />
                  ))}

                  {SAMPLE_CANVAS_PETS.map((pet, index) => {
                    const option = getPetOptionById(pet.petId);
                    if (!option) {
                      return null;
                    }
                    return (
                      <div
                        key={pet.id}
                        className="group absolute z-10"
                        style={{
                          left: `${pet.xPct}%`,
                          top: `${pet.yPct}%`,
                          animation: `teamhub-pet-bob 2.8s ease-in-out ${index * 0.35}s infinite`,
                        }}
                      >
                        <div className="relative">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/40 bg-white/90 shadow-md shadow-black/15 md:h-14 md:w-14">
                            <img src={option.imageUrl} alt="" className="h-10 w-10 object-contain md:h-12 md:w-12" />
                          </div>
                          <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 opacity-0 transition duration-200 group-hover:opacity-100">
                            <div className="whitespace-nowrap rounded-lg border border-slate-200 bg-white/95 px-2 py-1 text-center text-[10px] shadow-lg">
                              <p className="font-semibold text-slate-800">{pet.userName}</p>
                              <p className="text-slate-500">{pet.status}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-center text-xs text-slate-500">Tap a zone to focus your workspace (coming soon).</p>
              </div>
            </section>

            {/* Right panel */}
            <aside className="w-full shrink-0 space-y-4 xl:w-80">
              <div className="rounded-2xl border border-white/60 bg-white/90 p-4 shadow-lg shadow-slate-200/60 backdrop-blur">
                <h2 className="text-sm font-semibold text-slate-800">Team status</h2>
                <p className="text-xs text-slate-500">Live snapshot (sample data)</p>
                <ul className="mt-3 space-y-3">
                  {TEAM_STATUS_MOCK.map((row) => (
                    <li
                      key={row.name}
                      className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 transition hover:border-[color:var(--teamchat-border)] hover:bg-white"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{row.name}</p>
                          <p className="text-xs text-slate-600">{row.task}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            row.state === "At Risk" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {row.state}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full rounded-full ${row.state === "At Risk" ? "bg-amber-400" : ""}`}
                          style={{
                            width: `${row.progressPct}%`,
                            ...(row.state === "At Risk" ? {} : { background: "var(--teamchat-accent)" }),
                          }}
                        />
                      </div>
                      <p className="mt-1 text-right text-[10px] text-slate-500">{row.progressPct}%</p>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-white/60 bg-white/90 p-4 shadow-lg shadow-slate-200/60 backdrop-blur">
                <h2 className="text-sm font-semibold text-slate-800">Team announcements</h2>
                <ul className="mt-2 space-y-2 text-sm text-slate-700">
                  <li
                    className="rounded-lg px-3 py-2 text-slate-800"
                    style={{ background: "var(--teamchat-soft-bg)" }}
                  >
                    <span className="font-medium" style={{ color: "var(--teamchat-text)" }}>
                      Today:
                    </span>{" "}
                    Guild challenge ends at 5pm — finish your zone goals.
                  </li>
                  <li className="rounded-lg bg-slate-50 px-3 py-2">New pet skins drop Friday. Save your points.</li>
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </div>

      {/* Avatar picker */}
      {pickerOpen ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/80 bg-white/95 p-3 shadow-[0_-8px_30px_rgba(15,23,42,0.12)] backdrop-blur-md md:bottom-4 md:left-1/2 md:w-[min(720px,calc(100%-2rem))] md:-translate-x-1/2 md:rounded-2xl md:border md:shadow-2xl">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">Choose your pet</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSavePet}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:opacity-95"
                style={{ background: "var(--teamchat-accent)" }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                aria-label="Close pet picker"
              >
                Close
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {shouldShowPetPipelineHelper() ? (
              <p className="text-xs leading-snug text-slate-500" role="status">
                {PET_PIPELINE_HELPER_TEXT}
              </p>
            ) : null}
            <div className="grid max-h-[min(50vh,20rem)] grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2 overflow-y-auto overflow-x-hidden pb-1 [scrollbar-gutter:stable]">
              {PET_OPTIONS.map((pet) => {
                const isSelected = pet.id === draftPetId;
                return (
                  <button
                    key={pet.id}
                    type="button"
                    onClick={() => setDraftPetId(pet.id)}
                    className={`rounded-xl p-1 transition ${
                      isSelected
                        ? "ring-2 ring-[color:var(--teamchat-accent)] ring-offset-2 ring-offset-white"
                        : "ring-1 ring-transparent hover:ring-slate-200"
                    }`}
                  >
                    <img src={pet.imageUrl} alt="" className="mx-auto h-12 w-12 object-contain md:h-14 md:w-14" />
                    <span className="mt-0.5 block text-center text-[10px] text-slate-600">{pet.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default TeamHubHome;
