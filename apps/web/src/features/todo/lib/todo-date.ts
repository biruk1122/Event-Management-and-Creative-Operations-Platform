/** A calendar date as "YYYY-MM-DD" - matches the API's own `dueDate` shape
 * (a `@db.Date` column). Always computed from local date components, never
 * a UTC conversion, since a due date is a calendar day, not an instant. */
export function toDateOnly(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayDateOnly(): string {
  return toDateOnly(new Date());
}

export function addDaysToDateOnly(base: string, days: number): string {
  const [year, month, day] = base.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!);
  date.setDate(date.getDate() + days);
  return toDateOnly(date);
}

/** Formats a "YYYY-MM-DD" due date, and its optional "HH:mm[:ss]" due time,
 * for display - e.g. "Oct 1" or "Oct 1, 9:00 AM". */
export function formatDueDate(dueDate: string, dueTime: string | null): string {
  const [year, month, day] = dueDate.split("-").map(Number);
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(year!, month! - 1, day!));
  if (!dueTime) return dateLabel;
  const [hour, minute] = dueTime.split(":").map(Number);
  const timeLabel = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(year!, month! - 1, day!, hour, minute));
  return `${dateLabel}, ${timeLabel}`;
}
