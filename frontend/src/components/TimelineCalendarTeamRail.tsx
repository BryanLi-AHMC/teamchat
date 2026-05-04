import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import type { InternalProfile } from "../lib/authProfile";
import { createCalendarEvent, findBusyConflictsForProposedSlot, type CalendarEventRow } from "../lib/calendarEvents";

export type TimelineCalendarTeamRailProps = {
  currentProfile: InternalProfile;
  teammates: InternalProfile[];
  selectedCalendarUserId: string;
  onSelectCalendarUserId: (userId: string) => void;
  renderPresencePetAvatar: (profile: InternalProfile | undefined, size: "xs" | "sm" | "md" | "lg" | "xl", extraClass?: string) => ReactNode;
  onCalendarChanged: () => void;
};

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TimelineCalendarTeamRail({
  currentProfile,
  teammates,
  selectedCalendarUserId,
  onSelectCalendarUserId,
  renderPresencePetAvatar,
  onCalendarChanged,
}: TimelineCalendarTeamRailProps) {
  const [collabOpen, setCollabOpen] = useState(false);
  const [collabTitle, setCollabTitle] = useState("");
  const [collabStarts, setCollabStarts] = useState(() => {
    const s = new Date();
    s.setMinutes(0, 0, 0);
    if (s < new Date()) s.setHours(s.getHours() + 1);
    const e = new Date(s);
    e.setHours(e.getHours() + 1);
    return { start: toDatetimeLocalValue(s), end: toDatetimeLocalValue(e) };
  });
  const [collabWithIds, setCollabWithIds] = useState<Set<string>>(() => new Set());
  const [collabSaving, setCollabSaving] = useState(false);
  const [collabError, setCollabError] = useState("");
  const [collabConflictBlocks, setCollabConflictBlocks] = useState<
    { userId: string; displayName: string; conflicts: CalendarEventRow[] }[] | null
  >(null);

  const displayNameById = useMemo(() => {
    const m: Record<string, string> = { [currentProfile.id]: currentProfile.display_name };
    for (const t of teammates) {
      m[t.id] = t.display_name;
    }
    return m;
  }, [currentProfile, teammates]);

  const pickablePeers = useMemo(
    () => teammates.filter((t) => t.id !== currentProfile.id),
    [teammates, currentProfile.id]
  );

  const rows = useMemo(() => {
    const rest = teammates.filter((t) => t.id !== currentProfile.id).sort((a, b) => a.display_name.localeCompare(b.display_name));
    return [{ profile: currentProfile, label: "You" as const }, ...rest.map((p) => ({ profile: p, label: undefined as undefined }))];
  }, [currentProfile, teammates]);

  const toggleCollabPeer = (id: string) => {
    setCollabConflictBlocks(null);
    setCollabWithIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runCollabSave = async (forceDespiteConflicts: boolean) => {
    setCollabError("");
    const title = collabTitle.trim();
    if (!title) {
      setCollabError("Add a title for this collab or meeting.");
      return;
    }
    if (collabWithIds.size === 0) {
      setCollabError("Pick at least one teammate.");
      return;
    }
    const start = new Date(collabStarts.start);
    const end = new Date(collabStarts.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setCollabError("End time must be after start time.");
      return;
    }
    if (!forceDespiteConflicts) {
      const participantIds = [currentProfile.id, ...collabWithIds];
      const conflicts = await findBusyConflictsForProposedSlot(participantIds, displayNameById, start, end);
      if (conflicts.length > 0) {
        setCollabConflictBlocks(conflicts);
        return;
      }
    }
    setCollabConflictBlocks(null);
    setCollabSaving(true);
    try {
      await createCalendarEvent({
        userId: currentProfile.id,
        title,
        startsAt: start,
        endsAt: end,
        collaboratorUserIds: [...collabWithIds],
      });
      setCollabOpen(false);
      setCollabTitle("");
      setCollabWithIds(new Set());
      onCalendarChanged();
    } catch (err) {
      setCollabError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setCollabSaving(false);
    }
  };

  const submitCollab = async (e: FormEvent) => {
    e.preventDefault();
    await runCollabSave(false);
  };

  return (
    <div className="timeline-calendar-team-rail hub-rail-timeline-daily sidebar-tab-sheet--timeline">
      <div className="timeline-calendar-team-rail__head">
        <h3 className="timeline-calendar-team-rail__title">Team calendars</h3>
        <button type="button" className="timeline-calendar-team-rail__collab-btn" onClick={() => setCollabOpen(true)}>
          Schedule collab / meeting
        </button>
      </div>
      <ul className="timeline-calendar-team-rail__list" role="list">
        {rows.map(({ profile, label }) => {
          const selected = profile.id === selectedCalendarUserId;
          return (
            <li key={profile.id} className="timeline-calendar-team-rail__item">
              <button
                type="button"
                className={`timeline-calendar-team-rail__row${selected ? " timeline-calendar-team-rail__row--active" : ""}`}
                onClick={() => onSelectCalendarUserId(profile.id)}
                aria-pressed={selected}
              >
                <span className="timeline-calendar-team-rail__avatar">{renderPresencePetAvatar(profile, "sm", "")}</span>
                <span className="timeline-calendar-team-rail__name">{label ?? profile.display_name}</span>
                {selected ? <span className="timeline-calendar-team-rail__badge">Viewing</span> : null}
              </button>
            </li>
          );
        })}
      </ul>

      {collabOpen ? (
        <div className="timeline-calendar-team-rail-modal-root" role="dialog" aria-modal="true" aria-labelledby="tctr-collab-title">
          <button
            type="button"
            className="timeline-calendar-team-rail-modal-backdrop"
            aria-label="Close"
            onClick={() => {
              setCollabOpen(false);
              setCollabConflictBlocks(null);
            }}
          />
          <form className="timeline-calendar-team-rail-modal" onSubmit={(e) => void submitCollab(e)}>
            <h2 id="tctr-collab-title" className="timeline-calendar-team-rail-modal__title">
              Collab or meeting
            </h2>
            <p className="timeline-calendar-team-rail-modal__muted">
              Saves the same event on <strong>your</strong> calendar and on each selected teammate&apos;s calendar, with
              everyone else listed as collaborators on their copy.
            </p>
            {collabError ? <p className="timeline-calendar-team-rail-modal__error">{collabError}</p> : null}
            {collabConflictBlocks?.length ? (
              <div className="timeline-calendar-team-rail-modal__warn" role="status">
                <strong>Scheduling conflict</strong>
                <ul className="timeline-calendar-team-rail-modal__warn-list">
                  {collabConflictBlocks.flatMap((b) =>
                    b.conflicts.map((ev) => {
                      const until = new Date(ev.ends_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
                      const title = ev.title?.trim() || "(No title)";
                      return (
                        <li key={`${b.userId}-${ev.id}`}>
                          {b.displayName} is busy until {until} (“{title}”).
                        </li>
                      );
                    })
                  )}
                </ul>
                <div className="timeline-calendar-team-rail-modal__warn-actions">
                  <button
                    type="button"
                    className="timeline-calendar-team-rail-modal__cancel"
                    onClick={() => setCollabConflictBlocks(null)}
                    disabled={collabSaving}
                  >
                    Choose another time
                  </button>
                  <button
                    type="button"
                    className="timeline-calendar-team-rail-modal__save"
                    onClick={() => void runCollabSave(true)}
                    disabled={collabSaving}
                  >
                    Schedule anyway
                  </button>
                </div>
              </div>
            ) : null}
            <label className="timeline-calendar-team-rail-modal__label">
              Title
              <input
                className="timeline-calendar-team-rail-modal__input"
                value={collabTitle}
                onChange={(e) => {
                  setCollabTitle(e.target.value);
                  setCollabConflictBlocks(null);
                }}
                placeholder="e.g. Design review, Sprint planning"
                autoFocus
              />
            </label>
            <label className="timeline-calendar-team-rail-modal__label">
              Starts
              <input
                type="datetime-local"
                className="timeline-calendar-team-rail-modal__input"
                value={collabStarts.start}
                onChange={(e) => {
                  setCollabStarts((s) => ({ ...s, start: e.target.value }));
                  setCollabConflictBlocks(null);
                }}
              />
            </label>
            <label className="timeline-calendar-team-rail-modal__label">
              Ends
              <input
                type="datetime-local"
                className="timeline-calendar-team-rail-modal__input"
                value={collabStarts.end}
                onChange={(e) => {
                  setCollabStarts((s) => ({ ...s, end: e.target.value }));
                  setCollabConflictBlocks(null);
                }}
              />
            </label>
            <fieldset className="timeline-calendar-team-rail-modal__fieldset">
              <legend className="timeline-calendar-team-rail-modal__legend">With</legend>
              {pickablePeers.length === 0 ? (
                <p className="timeline-calendar-team-rail-modal__muted">No teammates loaded yet.</p>
              ) : (
                <div className="timeline-calendar-team-rail-modal__checks">
                  {pickablePeers.map((p) => (
                    <label key={p.id} className="timeline-calendar-team-rail-modal__check">
                      <input
                        type="checkbox"
                        checked={collabWithIds.has(p.id)}
                        onChange={() => toggleCollabPeer(p.id)}
                      />
                      <span>{p.display_name}</span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <div className="timeline-calendar-team-rail-modal__actions">
              <button
                type="button"
                className="timeline-calendar-team-rail-modal__cancel"
                onClick={() => {
                  setCollabOpen(false);
                  setCollabConflictBlocks(null);
                }}
                disabled={collabSaving}
              >
                Cancel
              </button>
              <button type="submit" className="timeline-calendar-team-rail-modal__save" disabled={collabSaving}>
                {collabSaving ? "Saving…" : "Save to my calendar"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
