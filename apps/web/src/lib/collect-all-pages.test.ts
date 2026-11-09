import { describe, expect, it, vi } from "vitest";

import { collectAllPages } from "./collect-all-pages";

const ALL = Array.from({ length: 230 }, (_, index) => `item-${index}`);

function pager(pageSize: number) {
  return vi.fn((page: number) => {
    const start = (page - 1) * pageSize;
    return Promise.resolve({
      items: ALL.slice(start, start + pageSize),
      total: ALL.length,
    });
  });
}

describe("collectAllPages", () => {
  it("returns every item across all pages, not only the first", async () => {
    const fetchPage = pager(100);
    const items = await collectAllPages(fetchPage);
    expect(items).toHaveLength(230);
    expect(items[229]).toBe("item-229");
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("stops when the server returns an empty page", async () => {
    const fetchPage = vi.fn(() =>
      Promise.resolve({ items: [] as string[], total: 999 }),
    );
    await expect(collectAllPages(fetchPage)).resolves.toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("reports rather than hides a list beyond the page guard", async () => {
    const fetchPage = pager(1);
    await expect(collectAllPages(fetchPage, { maxPages: 5 })).rejects.toThrow(
      "Too many records to show",
    );
  });
});
