import { describe, expect, it } from "vitest";
import { defaultFilters, readSelection, selectionUrl } from "./analytics-url";
const defaults = defaultFilters(new Date("2024-12-31T23:59:59Z"));
describe("analytics URL state", () => {
  it("uses bounded UTC calendar defaults including year rollover", () => {
    expect(defaults).toMatchObject({
      from: "2024-12-01",
      toExclusive: "2025-01-01",
      pageSize: 25,
    });
    expect(
      readSelection(new URLSearchParams(), "departments", defaults).measure,
    ).toBe("departments");
  });
  it("round trips period, subject and page without scope or snapshot parameters", () => {
    const selection = {
      measure: "employees" as const,
      filters: {
        ...defaults,
        subjectId: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
        pageSize: 50,
      },
      page: 2,
    };
    const url = selectionUrl(selection);
    expect(
      readSelection(new URLSearchParams(url.split("?")[1]), "tasks", defaults),
    ).toEqual({ ...selection, error: null });
  });
  it.each([
    "measure=unknown",
    "measure=events&page=-1",
    "measure=events&page=402",
    "measure=employees&pageSize=101",
    "measure=monthly&from=2026-09-02&toExclusive=2026-10-01",
    "measure=tasks&from=",
  ])(
    "rejects malformed URL %s without silently broadening the range",
    (value) => {
      expect(
        readSelection(new URLSearchParams(value), "tasks", defaults).error,
      ).not.toBeNull();
    },
  );
  it("omits dates/IDs that are inapplicable to the selected measure", () => {
    expect(
      selectionUrl({ measure: "campaigns", filters: defaults, page: 2 }),
    ).not.toContain("from=");
    expect(
      selectionUrl({
        measure: "monthly",
        filters: { ...defaults, subjectId: "secret" },
        page: 9,
      }),
    ).not.toMatch(/subjectId|page=/);
  });
});
