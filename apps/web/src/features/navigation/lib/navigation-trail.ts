/**
 * The in-app pages this tab visited, oldest first. It lives in session storage,
 * so a refresh keeps it while a new tab or a bookmark starts empty. A back
 * button uses it to tell a real in-app previous page from a direct visit.
 */
export const NAVIGATION_TRAIL_KEY = "lela:navigation-trail";

const MAX_ENTRIES = 50;

/**
 * Records a visit to `pathname`. Returning to the entry before the last one
 * pops it, so browser back and forward keep the trail in step with history.
 */
export function recordVisit(
  trail: readonly string[],
  pathname: string,
): string[] {
  if (trail.at(-1) === pathname) return [...trail];
  if (trail.length >= 2 && trail[trail.length - 2] === pathname) {
    return trail.slice(0, -1);
  }
  return [...trail, pathname].slice(-MAX_ENTRIES);
}

/** Whether the tab has a previous page inside the app to return to. */
export function hasInAppPrevious(trail: readonly string[]): boolean {
  return trail.length >= 2;
}

/** Reads the stored trail, treating missing or malformed data as empty. */
export function readTrail(storage: Pick<Storage, "getItem">): string[] {
  try {
    const raw = storage.getItem(NAVIGATION_TRAIL_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) &&
      parsed.every((item) => typeof item === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

/** Stores the trail. Storage can be unavailable in private windows, so failures are ignored. */
export function writeTrail(
  storage: Pick<Storage, "setItem">,
  trail: readonly string[],
): void {
  try {
    storage.setItem(NAVIGATION_TRAIL_KEY, JSON.stringify(trail));
  } catch {
    // Without storage the back button falls back to its parent listing.
  }
}
