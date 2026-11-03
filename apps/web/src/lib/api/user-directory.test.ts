import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("./browser", () => ({ browserApi: { GET: get } }));

const { listAllUsers } = await import("./user-directory");

const user = (id: string) => ({ id, email: `${id}@x.com` });
const page = (ids: string[], total: number) => ({
  data: { items: ids.map(user), page: 1, pageSize: 100, total },
  response: { ok: true, status: 200 },
});

describe("listAllUsers", () => {
  beforeEach(() => get.mockReset());

  it("reads one page when it already holds every user", async () => {
    get.mockResolvedValueOnce(page(["a", "b"], 2));
    const result = await listAllUsers();
    expect(result.data?.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("merges later pages until the total is reached", async () => {
    get
      .mockResolvedValueOnce(page(["a", "b"], 3))
      .mockResolvedValueOnce(page(["c"], 3));
    const result = await listAllUsers();
    expect(result.data?.items.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(get).toHaveBeenNthCalledWith(
      2,
      "/api/v1/users",
      expect.objectContaining({
        params: { query: { page: 2, pageSize: 100 } },
      }),
    );
  });

  it("stops on an empty page even if the total says more remain", async () => {
    get
      .mockResolvedValueOnce(page(["a"], 5))
      .mockResolvedValueOnce(page([], 5));
    const result = await listAllUsers();
    expect(result.data?.items.map((item) => item.id)).toEqual(["a"]);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("returns a failed page as-is so callers keep their error handling", async () => {
    const denied = {
      error: { status: 403 },
      response: { ok: false, status: 403 },
    };
    get.mockResolvedValueOnce(page(["a"], 2)).mockResolvedValueOnce(denied);
    await expect(listAllUsers()).resolves.toBe(denied);
  });
});
