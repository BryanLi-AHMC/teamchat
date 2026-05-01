/** Local calendar yyyy-mm-dd from an ISO timestamp (matches grouping for server `created_at`). */
export function getDateKey(isoDate: string) {
  const date = new Date(isoDate);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLocalDateKey(d: Date) {
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatTimelineDateLabel(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (dateKey === getLocalDateKey(today)) {
    return "Today";
  }
  if (dateKey === getLocalDateKey(yesterday)) {
    return "Yesterday";
  }
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Sunday-first week containing `reference + weekOffset * 7` days. */
export function getWeekDaysSunday(weekOffset: number): Date[] {
  const today = new Date();
  const ref = new Date(today);
  ref.setDate(today.getDate() + weekOffset * 7);
  const start = new Date(ref);
  start.setDate(ref.getDate() - ref.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}
