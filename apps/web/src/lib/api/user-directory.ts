"use client";

import { browserApi } from "./browser";

const PAGE_SIZE = 100;
// Upper bound on pages read for one picker, so a runaway total can never turn
// one open dropdown into an unbounded request loop.
const MAX_PAGES = 50;

/** Reads every page of `GET /api/v1/users` for the people pickers. The API
 * caps a page at 100 and orders by last name, so reading only the first page
 * silently dropped everyone past the 100th person. Returns the same
 * `{ data, error, response }` shape as one `browserApi.GET`, with every page's
 * items merged into `data.items`, so callers keep their own error handling. A
 * failed page is returned as-is. */
export async function listAllUsers(signal?: AbortSignal) {
  const first = await readPage(1, signal);
  if (!first.data) return first;
  const items = [...first.data.items];
  for (
    let page = 2;
    items.length < first.data.total && page <= MAX_PAGES;
    page++
  ) {
    const next = await readPage(page, signal);
    if (!next.data) return next;
    if (next.data.items.length === 0) break;
    items.push(...next.data.items);
  }
  return { ...first, data: { ...first.data, items } };
}

function readPage(page: number, signal?: AbortSignal) {
  return browserApi.GET("/api/v1/users", {
    // The generated types model `page`/`pageSize` as an empty object; they
    // are plain integers on the wire.
    params: { query: { page, pageSize: PAGE_SIZE } as never },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
}
