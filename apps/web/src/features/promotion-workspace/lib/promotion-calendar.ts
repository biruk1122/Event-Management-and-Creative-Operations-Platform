import {
  APP_TIME_ZONE,
  utcToZonedLocal,
  zonedLocalToUtcIso,
} from "@/lib/app-timezone";

/** A calendar month, as the year and the 1-based month number. */
export interface CalendarMonth {
  year: number;
  month: number;
}

export type CalendarEntryKind = "event" | "activity" | "deadline";

/** One thing on the Promotion calendar (EVE-234). */
export interface CalendarEntry {
  id: string;
  kind: CalendarEntryKind;
  title: string;
  /** The instant it happens; for a deadline, when the task is due. */
  at: string;
  detail: string;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** The month containing `iso`, in the app timezone. */
export function monthOf(
  iso: string,
  timeZone: string = APP_TIME_ZONE,
): CalendarMonth {
  const local = utcToZonedLocal(iso, timeZone);
  return { year: Number(local.slice(0, 4)), month: Number(local.slice(5, 7)) };
}

export function shiftMonth(month: CalendarMonth, by: number): CalendarMonth {
  const index = month.year * 12 + (month.month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** The month's first and last instants (UTC), measured in the app timezone. */
export function monthRange(
  month: CalendarMonth,
  timeZone: string = APP_TIME_ZONE,
): { from: string; to: string } {
  const next = shiftMonth(month, 1);
  const from = zonedLocalToUtcIso(
    `${month.year}-${pad(month.month)}-01T00:00`,
    timeZone,
  )!;
  const nextStart = zonedLocalToUtcIso(
    `${next.year}-${pad(next.month)}-01T00:00`,
    timeZone,
  )!;
  return {
    from,
    to: new Date(new Date(nextStart).getTime() - 1).toISOString(),
  };
}

/** The `YYYY-MM-DD` day an instant falls on, in the app timezone. */
export function dayKey(iso: string, timeZone: string = APP_TIME_ZONE): string {
  return utcToZonedLocal(iso, timeZone).slice(0, 10);
}

/**
 * The weeks of a month grid, Monday first. Days outside the month are null,
 * so every week has seven cells.
 */
export function monthGrid(month: CalendarMonth): (string | null)[][] {
  const first = new Date(Date.UTC(month.year, month.month - 1, 1));
  const days = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from(
      { length: days },
      (_, index) => `${month.year}-${pad(month.month)}-${pad(index + 1)}`,
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

/** Entries grouped by day, in time order, days ascending. */
export function groupEntriesByDay(
  entries: readonly CalendarEntry[],
  timeZone: string = APP_TIME_ZONE,
): Map<string, CalendarEntry[]> {
  const sorted = [...entries].sort(
    (a, b) => a.at.localeCompare(b.at) || a.title.localeCompare(b.title),
  );
  const groups = new Map<string, CalendarEntry[]>();
  for (const entry of sorted) {
    const key = dayKey(entry.at, timeZone);
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

/** Whether `iso` falls inside the month, in the app timezone. */
export function inMonth(
  iso: string,
  month: CalendarMonth,
  timeZone: string = APP_TIME_ZONE,
): boolean {
  return dayKey(iso, timeZone).startsWith(`${month.year}-${pad(month.month)}-`);
}
