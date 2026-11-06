import { clientEnvironment } from "@/env/client";

/**
 * The timezone event times are entered in and shown in. Storage stays UTC: the
 * API takes and returns UTC instants only, and every conversion between the
 * wall clock and UTC happens here, once.
 */
export const APP_TIME_ZONE = clientEnvironment.NEXT_PUBLIC_APP_TIMEZONE;

const PARTS: Intl.DateTimeFormatOptions = {
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
};

/** The zone's offset from UTC at an instant, in milliseconds. */
function offsetAt(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    ...PARTS,
    timeZone,
  }).formatToParts(new Date(instant));
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  const wallAsUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second"),
  );
  return wallAsUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * A wall-clock `YYYY-MM-DDTHH:mm` in `timeZone`, as the UTC instant it names.
 * Null when the input is not a complete date and time.
 */
export function zonedLocalToUtcIso(
  local: string,
  timeZone: string = APP_TIME_ZONE,
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!match) return null;
  const wall = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
  // Two passes settle the offset even when the guess lands across a shift.
  const first = wall - offsetAt(wall, timeZone);
  const second = wall - offsetAt(first, timeZone);
  return new Date(second).toISOString();
}

/** The UTC instant as a wall-clock `YYYY-MM-DDTHH:mm` in `timeZone`. */
export function utcToZonedLocal(
  iso: string,
  timeZone: string = APP_TIME_ZONE,
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    ...PARTS,
    timeZone,
  }).formatToParts(new Date(iso));
  const read = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${read("year")}-${read("month")}-${read("day")}T${read("hour")}:${read("minute")}`;
}

/** Formats an instant for display in `timeZone`. */
export function formatInZone(
  iso: string,
  options: Intl.DateTimeFormatOptions,
  timeZone: string = APP_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat("en", { ...options, timeZone }).format(
    new Date(iso),
  );
}
