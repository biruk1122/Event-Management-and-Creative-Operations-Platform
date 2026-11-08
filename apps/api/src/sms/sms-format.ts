/** The app timezone. Messages show local times, so recipients see the time they expect. */
export const SMS_TIME_ZONE = "Africa/Addis_Ababa";

const FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: SMS_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** For example "09 Nov 2026, 14:30". Returns "not set" when there is no date. */
export function formatSmsDateTime(date: Date | null): string {
  if (!date) return "not set";
  return FORMATTER.format(date);
}

/** Shows a person's name, or a neutral fallback when no name is on record. */
export function smsPersonName(
  person: { firstName: string | null; lastName: string | null } | null,
  fallback: string,
): string {
  const name = [person?.firstName, person?.lastName]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .trim();
  return name.length > 0 ? name : fallback;
}
