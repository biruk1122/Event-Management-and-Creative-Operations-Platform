/**
 * Reads every page of a paged list and returns all of its items. The API caps a
 * page, so a picker that needs the whole set must walk the pages; stopping at
 * the first page would silently hide everything after it.
 *
 * The walk stops when the total is reached, when a page comes back empty, or
 * at `maxPages` as a guard. Hitting the guard is reported, not hidden.
 */
export async function collectAllPages<T>(
  fetchPage: (page: number) => Promise<{ items: readonly T[]; total: number }>,
  options: { maxPages?: number } = {},
): Promise<T[]> {
  const maxPages = options.maxPages ?? 50;
  const collected: T[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await fetchPage(page);
    collected.push(...result.items);
    if (collected.length >= result.total || result.items.length === 0) {
      return collected;
    }
  }
  throw new Error("Too many records to show. Narrow the search and try again.");
}
