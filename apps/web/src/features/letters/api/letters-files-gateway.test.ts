import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLetterFileUrl, listLetterFiles } from "./letters-gateway";
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({ browserApi: { GET: get } }));
beforeEach(() => get.mockReset());
describe("letter file access", () => {
  it("loads subsequent attachment pages", async () => {
    get
      .mockResolvedValueOnce({
        data: { items: [{ id: "first" }], total: 2 },
        response: { status: 200 },
      })
      .mockResolvedValueOnce({
        data: { items: [{ id: "second" }], total: 2 },
        response: { status: 200 },
      });
    expect(await listLetterFiles("letter-1")).toEqual([
      { id: "first" },
      { id: "second" },
    ]);
    expect(get.mock.calls[1]?.[1].params.query.page).toBe(2);
  });
  it("reports authorization failures instead of pretending there are no files", async () => {
    get.mockResolvedValue({ response: { status: 403 } });
    await expect(listLetterFiles("letter-1")).rejects.toThrow(
      "You do not have access",
    );
    await expect(getLetterFileUrl("letter-1", "file-1")).rejects.toThrow(
      "You do not have access",
    );
  });
});
