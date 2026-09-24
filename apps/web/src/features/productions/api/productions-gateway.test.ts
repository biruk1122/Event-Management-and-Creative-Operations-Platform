import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createProduction,
  deleteProduction,
  getProduction,
  listProductions,
  ProductionMutationError,
  ProductionRequestError,
  updateProduction,
} from "./productions-gateway";

const { get, post, patch, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}));
vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post, PATCH: patch, DELETE: del },
}));
vi.mock("@/lib/api/csrf", () => ({ readCsrfToken: () => "test-csrf" }));

const response = (data: unknown, status = 200) => ({
  data,
  response: { status, ok: status >= 200 && status < 300 },
});
const values = {
  name: " Film ",
  productionType: " Video ",
  description: "",
  startAt: "2026-10-01",
  endAt: "",
  deadlineAt: "2026-10-20",
};

beforeEach(() => vi.resetAllMocks());

describe("production API gateway", () => {
  it("sends scoped pagination and filters to the generated list route", async () => {
    get.mockResolvedValue(
      response({ items: [], page: 2, pageSize: 10, total: 12 }),
    );
    const result = await listProductions({
      page: 2,
      pageSize: 10,
      status: "ACTIVE",
      search: " film ",
    });
    expect(result.total).toBe(12);
    expect(get).toHaveBeenCalledWith(
      "/api/v1/productions",
      expect.objectContaining({
        params: {
          query: { page: 2, pageSize: 10, status: "ACTIVE", search: "film" },
        },
      }),
    );
  });

  it("rejects an unauthorized detail response", async () => {
    get.mockResolvedValue({ response: { status: 403 } });
    await expect(getProduction("p1")).rejects.toBeInstanceOf(
      ProductionRequestError,
    );
  });

  it("builds create and update bodies with UTC dates and explicit nullable clears", async () => {
    post.mockResolvedValue(response({ id: "p1" }, 201));
    patch.mockResolvedValue(response({ id: "p1" }));
    await createProduction(values);
    expect(post).toHaveBeenCalledWith(
      "/api/v1/productions",
      expect.objectContaining({
        body: {
          name: "Film",
          productionType: "Video",
          startAt: "2026-10-01T00:00:00.000Z",
          deadlineAt: "2026-10-20T00:00:00.000Z",
        },
        headers: { "x-csrf-token": "test-csrf" },
      }),
    );
    await updateProduction("p1", values);
    expect(patch).toHaveBeenCalledWith(
      "/api/v1/productions/{id}",
      expect.objectContaining({
        params: { path: { id: "p1" } },
        body: {
          name: "Film",
          productionType: "Video",
          description: null,
          startAt: "2026-10-01T00:00:00.000Z",
          endAt: null,
          deadlineAt: "2026-10-20T00:00:00.000Z",
        },
      }),
    );
  });

  it("maps Problem Details field errors without losing the change", async () => {
    post.mockResolvedValue({
      error: {
        code: "VALIDATION_ERROR",
        status: 400,
        errors: { productionType: ["Enter a type."] },
      },
      response: { status: 400 },
    });
    await expect(createProduction(values)).rejects.toMatchObject({
      fieldErrors: { productionType: "Enter a type." },
    } satisfies Partial<ProductionMutationError>);
  });

  it("accepts a no-content delete and maps a blocked delete", async () => {
    del
      .mockResolvedValueOnce({ response: { status: 204, ok: true } })
      .mockResolvedValueOnce({
        error: { code: "PRODUCTION_WORKSPACE_IN_USE", status: 409 },
        response: { status: 409, ok: false },
      });
    await expect(deleteProduction("p1")).resolves.toBeUndefined();
    await expect(deleteProduction("p1")).rejects.toThrow(/connected work/);
  });
});
