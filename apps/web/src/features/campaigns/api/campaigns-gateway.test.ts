import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assignCampaignManager,
  assignCampaignTeam,
  createCampaign,
  createCampaignActivity,
  deleteCampaign,
  deleteCampaignActivity,
  getCampaign,
  getCampaignBudget,
  listAssignableEvents,
  listAssignableTeams,
  listAssignableUsers,
  listCampaignActivities,
  listCampaigns,
  removeCampaignTeam,
  setCampaignBudget,
  transitionCampaign,
  updateCampaign,
  updateCampaignActivity,
} from "./campaigns-gateway";
import type {
  CampaignActivityValues,
  CreateCampaignValues,
  EditCampaignValues,
} from "../lib/campaigns-outcome";

const { get, post, patch, put, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post, PATCH: patch, PUT: put, DELETE: del },
}));

const ok = (data: unknown, status = 200) => ({
  data,
  response: { ok: true, status },
});
const fail = (code: string, status: number, errors?: unknown) => ({
  error: { code, status, ...(errors ? { errors } : {}) },
  response: { ok: false, status },
});

const createValues: CreateCampaignValues = {
  name: "  Autumn Push  ",
  campaignType: "PROMOTION",
  description: "  Awareness.  ",
  audience: "  Young adults  ",
  startAt: "2026-10-04T18:00",
  endAt: "",
  eventId: null,
  productName: "",
  managerId: null,
};

const editValues: EditCampaignValues = {
  name: "Autumn",
  campaignType: "MARKETING",
  description: "",
  audience: "",
  startAt: "2026-10-04T18:00",
  endAt: "",
  eventId: "evt-1",
  productName: "",
};

const activityValues: CampaignActivityValues = {
  name: "  Teaser  ",
  description: "",
  status: "PLANNED",
  startAt: "",
  endAt: "2026-10-05T09:30",
};

afterEach(() => {
  vi.resetAllMocks();
  document.cookie = "csrf_token=; Max-Age=0; path=/";
});

describe("campaigns gateway reads", () => {
  it("sends the page window and forwards active filters", async () => {
    get.mockResolvedValue(ok({ items: [], page: 1, pageSize: 10, total: 0 }));

    await listCampaigns({
      status: "ACTIVE",
      campaignType: "PROMOTION",
      search: "  aurora  ",
      eventId: "evt-1",
      managerId: "u1",
      page: 2,
      pageSize: 10,
    });

    const [path, options] = get.mock.calls[0]!;
    expect(path).toBe("/api/v1/campaigns");
    expect(options.params.query).toEqual({
      page: 2,
      pageSize: 10,
      status: "ACTIVE",
      campaignType: "PROMOTION",
      search: "aurora",
      eventId: "evt-1",
      managerId: "u1",
    });
    expect(options.cache).toBe("no-store");
  });

  it("omits blank filters and defaults the window", async () => {
    get.mockResolvedValue(ok({ items: [], page: 1, pageSize: 25, total: 0 }));

    await listCampaigns({ status: null, campaignType: null, search: "   " });

    const [, options] = get.mock.calls[0]!;
    expect(options.params.query).toEqual({ page: 1, pageSize: 25 });
  });

  it("passes the abort signal through", async () => {
    get.mockResolvedValue(ok({ items: [], page: 1, pageSize: 25, total: 0 }));
    const controller = new AbortController();

    await listCampaigns({}, controller.signal);

    expect(get.mock.calls[0]![1].signal).toBe(controller.signal);
  });

  it.each([
    [401, "Your session expired. Sign in again."],
    [403, "You do not have access to this area."],
    [404, "This campaign no longer exists. Refresh the list."],
    [500, "We could not load the data. Try again."],
  ])(
    "throws a typed error with a recovery message for a %s list response",
    async (status, message) => {
      get.mockResolvedValue({ data: undefined, response: { status } });

      await expect(listCampaigns({})).rejects.toMatchObject({
        name: "CampaignsRequestError",
        status,
        message,
      });
    },
  );

  it("resolves null from getCampaign on a non-OK response", async () => {
    get.mockResolvedValue({ data: undefined, response: { status: 404 } });

    expect(await getCampaign("cmp-1")).toBeNull();
  });

  it("returns the campaign body from getCampaign", async () => {
    get.mockResolvedValue(ok({ id: "cmp-1" }));

    expect(await getCampaign("cmp-1")).toEqual({ id: "cmp-1" });
    expect(get.mock.calls[0]![0]).toBe("/api/v1/campaigns/{id}");
    expect(get.mock.calls[0]![1].params.path).toEqual({ id: "cmp-1" });
  });

  it("resolves a null budget when the caller may not read it", async () => {
    get.mockResolvedValue({ data: undefined, response: { status: 403 } });

    expect(await getCampaignBudget("cmp-1")).toBeNull();
  });

  it("returns the budget body", async () => {
    get.mockResolvedValue(ok({ amount: "25000.00", currency: "ETB" }));

    expect(await getCampaignBudget("cmp-1")).toEqual({
      amount: "25000.00",
      currency: "ETB",
    });
  });

  it("maps assignable users, teams, and events from their list endpoints", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/users")
        return ok({
          items: [{ id: "u1", email: "a@b.c", firstName: "A", lastName: null }],
        });
      if (path === "/api/v1/teams")
        return ok({ items: [{ id: "t1", name: "Content Studio" }] });
      return ok({ items: [{ id: "evt-1", name: "Orbit Launch" }] });
    });

    expect(await listAssignableUsers()).toEqual([
      { id: "u1", email: "a@b.c", firstName: "A", lastName: null },
    ]);
    expect(await listAssignableTeams()).toEqual([
      { id: "t1", name: "Content Studio" },
    ]);
    expect(await listAssignableEvents()).toEqual([
      { id: "evt-1", name: "Orbit Launch" },
    ]);
  });

  it("returns [] for assignable reads the caller cannot make", async () => {
    get.mockResolvedValue({ data: undefined, response: { status: 403 } });

    expect(await listAssignableUsers()).toEqual([]);
    expect(await listAssignableTeams()).toEqual([]);
    expect(await listAssignableEvents()).toEqual([]);
  });
});

describe("campaigns gateway activity paging", () => {
  const item = (id: string) => ({ id, campaignId: "cmp-1" });

  it("reads one page when it holds every activity", async () => {
    get.mockResolvedValue(ok({ items: [item("a1")], page: 1, total: 1 }));

    expect(await listCampaignActivities("cmp-1")).toEqual([item("a1")]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]![0]).toBe("/api/v1/campaigns/{id}/activities");
    expect(get.mock.calls[0]![1].params).toEqual({
      path: { id: "cmp-1" },
      query: { page: 1, pageSize: 100 },
    });
  });

  it("pages until it has collected every activity, in order", async () => {
    get
      .mockResolvedValueOnce(ok({ items: [item("a1"), item("a2")], total: 3 }))
      .mockResolvedValueOnce(ok({ items: [item("a3")], total: 3 }));

    expect(await listCampaignActivities("cmp-1")).toEqual([
      item("a1"),
      item("a2"),
      item("a3"),
    ]);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[1]![1].params.query.page).toBe(2);
  });

  it("resolves an empty list for a campaign with no activities", async () => {
    get.mockResolvedValue(ok({ items: [], page: 1, total: 0 }));

    expect(await listCampaignActivities("cmp-1")).toEqual([]);
  });

  it("resolves null instead of a truncated list when a later page fails", async () => {
    get
      .mockResolvedValueOnce(ok({ items: [item("a1")], total: 3 }))
      .mockResolvedValueOnce({ data: undefined, response: { status: 500 } });

    expect(await listCampaignActivities("cmp-1")).toBeNull();
  });

  it("resolves null when the first page cannot be read", async () => {
    get.mockResolvedValue({ data: undefined, response: { status: 404 } });

    expect(await listCampaignActivities("cmp-1")).toBeNull();
  });

  it("stops if the API keeps returning empty pages", async () => {
    get.mockResolvedValue(ok({ items: [], total: 5 }));

    expect(await listCampaignActivities("cmp-1")).toEqual([]);
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe("campaigns gateway campaign writes", () => {
  it("builds a create body: trims text, drops blanks, converts the schedule to UTC", async () => {
    post.mockResolvedValue(ok({ id: "cmp-1" }, 201));
    document.cookie = "csrf_token=tok";

    const outcome = await createCampaign(createValues);

    expect(outcome).toEqual({ status: "success", campaign: { id: "cmp-1" } });
    const [path, options] = post.mock.calls[0]!;
    expect(path).toBe("/api/v1/campaigns");
    expect(options.body).toEqual({
      name: "Autumn Push",
      campaignType: "PROMOTION",
      description: "Awareness.",
      audience: "Young adults",
      startAt: "2026-10-04T18:00:00.000Z",
    });
    expect(options.headers).toEqual({ "x-csrf-token": "tok" });
  });

  it("sends an event subject or a product subject, never a blank one", async () => {
    post.mockResolvedValue(ok({ id: "cmp-1" }, 201));

    await createCampaign({
      ...createValues,
      eventId: "evt-1",
      managerId: "u1",
    });
    await createCampaign({ ...createValues, productName: "  Orbit  " });

    expect(post.mock.calls[0]![1].body).toMatchObject({
      eventId: "evt-1",
      managerId: "u1",
    });
    expect(post.mock.calls[0]![1].body).not.toHaveProperty("productName");
    expect(post.mock.calls[1]![1].body).toMatchObject({ productName: "Orbit" });
    expect(post.mock.calls[1]![1].body).not.toHaveProperty("eventId");
  });

  it("omits the CSRF header when there is no token", async () => {
    post.mockResolvedValue(ok({ id: "cmp-1" }, 201));

    await createCampaign(createValues);

    expect(post.mock.calls[0]![1].headers).toEqual({});
  });

  it("builds an update body: sends every field and nulls blank optionals", async () => {
    patch.mockResolvedValue(ok({ id: "cmp-1" }));
    document.cookie = "csrf_token=tok";

    const outcome = await updateCampaign("cmp-1", editValues);

    expect(outcome).toEqual({ status: "success", campaign: { id: "cmp-1" } });
    const [path, options] = patch.mock.calls[0]!;
    expect(path).toBe("/api/v1/campaigns/{id}");
    expect(options.params.path).toEqual({ id: "cmp-1" });
    expect(options.body).toEqual({
      name: "Autumn",
      campaignType: "MARKETING",
      description: null,
      audience: null,
      startAt: "2026-10-04T18:00:00.000Z",
      endAt: null,
      eventId: "evt-1",
      productName: null,
    });
    expect(options.headers).toEqual({ "x-csrf-token": "tok" });
  });

  it("clears the event when switching the subject to a product", async () => {
    patch.mockResolvedValue(ok({ id: "cmp-1" }));

    await updateCampaign("cmp-1", {
      ...editValues,
      eventId: null,
      productName: "Orbit",
    });

    expect(patch.mock.calls[0]![1].body).toMatchObject({
      eventId: null,
      productName: "Orbit",
    });
  });

  it("posts a transition", async () => {
    post.mockResolvedValue(ok({ id: "cmp-1", status: "ACTIVE" }));

    const outcome = await transitionCampaign("cmp-1", "ACTIVE");

    expect(outcome.status).toBe("success");
    expect(post.mock.calls[0]![0]).toBe("/api/v1/campaigns/{id}/transition");
    expect(post.mock.calls[0]![1].body).toEqual({ status: "ACTIVE" });
  });

  it("puts a manager, including clearing it with null", async () => {
    put.mockResolvedValue(ok({ id: "cmp-1" }));

    await assignCampaignManager("cmp-1", "u1");
    await assignCampaignManager("cmp-1", null);

    expect(put.mock.calls[0]![0]).toBe("/api/v1/campaigns/{id}/manager");
    expect(put.mock.calls[0]![1].body).toEqual({ managerId: "u1" });
    expect(put.mock.calls[1]![1].body).toEqual({ managerId: null });
  });

  it("assigns and removes a team on the team route", async () => {
    put.mockResolvedValue(ok({ id: "cmp-1" }));
    del.mockResolvedValue(ok({ id: "cmp-1" }));

    await assignCampaignTeam("cmp-1", "t1");
    await removeCampaignTeam("cmp-1", "t1");

    expect(put.mock.calls[0]![0]).toBe("/api/v1/campaigns/{id}/teams/{teamId}");
    expect(put.mock.calls[0]![1].params.path).toEqual({
      id: "cmp-1",
      teamId: "t1",
    });
    expect(del.mock.calls[0]![0]).toBe("/api/v1/campaigns/{id}/teams/{teamId}");
  });

  it("puts a budget and clears it with nulls", async () => {
    put.mockResolvedValue(ok({ amount: "10.00", currency: "USD" }));

    expect(await setCampaignBudget("cmp-1", 10, "USD")).toEqual({
      status: "success",
      budget: { amount: "10.00", currency: "USD" },
    });
    await setCampaignBudget("cmp-1", null, null);

    expect(put.mock.calls[0]![0]).toBe("/api/v1/campaigns/{id}/budget");
    expect(put.mock.calls[0]![1].body).toEqual({ amount: 10, currency: "USD" });
    expect(put.mock.calls[1]![1].body).toEqual({
      amount: null,
      currency: null,
    });
  });

  it("deletes a campaign and reports success on any OK response", async () => {
    document.cookie = "csrf_token=tok";
    del.mockResolvedValue({ response: { ok: true, status: 204 } });

    expect(await deleteCampaign("cmp-1")).toEqual({ status: "success" });
    expect(del.mock.calls[0]![0]).toBe("/api/v1/campaigns/{id}");
    expect(del.mock.calls[0]![1].headers).toEqual({ "x-csrf-token": "tok" });
  });
});

describe("campaigns gateway failure mapping", () => {
  describe("create", () => {
    it.each([
      ["USER_NOT_FOUND", 404, "manager_not_found"],
      ["EVENT_NOT_FOUND", 404, "event_not_found"],
      ["CAMPAIGN_RELATED_SUBJECT_CONFLICT", 400, "subject_conflict"],
      ["CAMPAIGN_SCHEDULE_INVALID", 400, "schedule_invalid"],
    ])("maps %s to %s", async (code, status, expected) => {
      post.mockResolvedValue(fail(code, status));

      expect(await createCampaign(createValues)).toEqual({ status: expected });
    });

    it("maps validation errors to per-field messages, dropping unknown fields", async () => {
      post.mockResolvedValue(
        fail("VALIDATION_ERROR", 400, {
          name: ["name must not be blank"],
          audience: "audience must not be blank",
          somethingElse: ["ignored"],
        }),
      );

      expect(await createCampaign(createValues)).toEqual({
        status: "field_errors",
        fieldErrors: {
          name: "name must not be blank",
          audience: "audience must not be blank",
        },
      });
    });

    it("falls back to unexpected for a validation error naming no known field", async () => {
      post.mockResolvedValue(
        fail("VALIDATION_ERROR", 400, { somethingElse: ["nope"] }),
      );

      expect(await createCampaign(createValues)).toEqual({
        status: "unexpected",
      });
    });

    it.each([401, 403])(
      "maps a bare %s to permission_denied",
      async (status) => {
        post.mockResolvedValue({ error: {}, response: { ok: false, status } });

        expect(await createCampaign(createValues)).toEqual({
          status: "permission_denied",
        });
      },
    );

    it("maps an unknown failure and a thrown error to unexpected", async () => {
      post.mockResolvedValueOnce(fail("SOMETHING_NEW", 500));
      post.mockRejectedValueOnce(new Error("network down"));

      expect(await createCampaign(createValues)).toEqual({
        status: "unexpected",
      });
      expect(await createCampaign(createValues)).toEqual({
        status: "unexpected",
      });
    });
  });

  describe("update", () => {
    it.each([
      ["CAMPAIGN_NOT_FOUND", 404, "not_found"],
      ["EVENT_NOT_FOUND", 404, "event_not_found"],
      ["CAMPAIGN_RELATED_SUBJECT_CONFLICT", 400, "subject_conflict"],
      ["CAMPAIGN_SCHEDULE_INVALID", 400, "schedule_invalid"],
    ])("maps %s to %s", async (code, status, expected) => {
      patch.mockResolvedValue(fail(code, status));

      expect(await updateCampaign("cmp-1", editValues)).toEqual({
        status: expected,
      });
    });

    it("maps a validation error on a form field", async () => {
      patch.mockResolvedValue(
        fail("VALIDATION_ERROR", 400, { productName: ["too long"] }),
      );

      expect(await updateCampaign("cmp-1", editValues)).toEqual({
        status: "field_errors",
        fieldErrors: { productName: "too long" },
      });
    });
  });

  describe("transition, manager, and team", () => {
    it("maps transition failures", async () => {
      post.mockResolvedValueOnce(fail("CAMPAIGN_INVALID_TRANSITION", 409));
      post.mockResolvedValueOnce(fail("CAMPAIGN_NOT_FOUND", 404));

      expect(await transitionCampaign("cmp-1", "ACTIVE")).toEqual({
        status: "invalid_transition",
      });
      expect(await transitionCampaign("cmp-1", "ACTIVE")).toEqual({
        status: "not_found",
      });
    });

    it("maps manager failures", async () => {
      put.mockResolvedValueOnce(fail("USER_NOT_FOUND", 404));
      put.mockResolvedValueOnce(fail("CAMPAIGN_NOT_FOUND", 404));

      expect(await assignCampaignManager("cmp-1", "ghost")).toEqual({
        status: "manager_not_found",
      });
      expect(await assignCampaignManager("cmp-1", null)).toEqual({
        status: "not_found",
      });
    });

    it("maps team failures on assign and unassign", async () => {
      put.mockResolvedValueOnce(fail("CAMPAIGN_TEAM_NOT_FOUND", 404));
      del.mockResolvedValueOnce(fail("CAMPAIGN_TEAM_NOT_ASSIGNED", 409));
      del.mockResolvedValueOnce(fail("CAMPAIGN_NOT_FOUND", 404));

      expect(await assignCampaignTeam("cmp-1", "ghost")).toEqual({
        status: "team_not_found",
      });
      expect(await removeCampaignTeam("cmp-1", "t1")).toEqual({
        status: "not_assigned",
      });
      expect(await removeCampaignTeam("cmp-1", "t1")).toEqual({
        status: "not_found",
      });
    });

    it("maps a permission failure on each write to permission_denied", async () => {
      const denied = { error: {}, response: { ok: false, status: 403 } };
      post.mockResolvedValue(denied);
      put.mockResolvedValue(denied);
      del.mockResolvedValue(denied);

      expect(await transitionCampaign("cmp-1", "ACTIVE")).toEqual({
        status: "permission_denied",
      });
      expect(await assignCampaignManager("cmp-1", null)).toEqual({
        status: "permission_denied",
      });
      expect(await assignCampaignTeam("cmp-1", "t1")).toEqual({
        status: "permission_denied",
      });
      expect(await deleteCampaign("cmp-1")).toEqual({
        status: "permission_denied",
      });
    });
  });

  describe("budget", () => {
    it("maps an incomplete budget", async () => {
      put.mockResolvedValue(fail("CAMPAIGN_BUDGET_INCOMPLETE", 400));

      expect(await setCampaignBudget("cmp-1", 5, null)).toEqual({
        status: "budget_incomplete",
      });
    });

    it("maps validation errors on the amount and currency", async () => {
      put.mockResolvedValue(
        fail("VALIDATION_ERROR", 400, {
          amount: ["must not be less than 0"],
          currency: ["currency must be a three-letter ISO-4217 code"],
        }),
      );

      expect(await setCampaignBudget("cmp-1", -1, "us")).toEqual({
        status: "field_errors",
        fieldErrors: {
          amount: "must not be less than 0",
          currency: "currency must be a three-letter ISO-4217 code",
        },
      });
    });

    it("maps a missing campaign and a missing budget permission", async () => {
      put.mockResolvedValueOnce(fail("CAMPAIGN_NOT_FOUND", 404));
      put.mockResolvedValueOnce({
        error: {},
        response: { ok: false, status: 403 },
      });

      expect(await setCampaignBudget("cmp-1", 1, "USD")).toEqual({
        status: "not_found",
      });
      expect(await setCampaignBudget("cmp-1", 1, "USD")).toEqual({
        status: "permission_denied",
      });
    });
  });

  describe("delete", () => {
    it("maps attached files, a missing campaign, and other failures", async () => {
      del.mockResolvedValueOnce(fail("CAMPAIGN_HAS_MANAGED_FILES", 409));
      del.mockResolvedValueOnce(fail("CAMPAIGN_NOT_FOUND", 404));
      del.mockResolvedValueOnce(fail("SOMETHING_NEW", 500));
      del.mockRejectedValueOnce(new Error("network down"));

      expect(await deleteCampaign("cmp-1")).toEqual({
        status: "has_managed_files",
      });
      expect(await deleteCampaign("cmp-1")).toEqual({ status: "not_found" });
      expect(await deleteCampaign("cmp-1")).toEqual({ status: "unexpected" });
      expect(await deleteCampaign("cmp-1")).toEqual({ status: "unexpected" });
    });
  });
});

describe("campaigns gateway activities", () => {
  it("builds an activity create body: trims, drops blanks, converts to UTC", async () => {
    post.mockResolvedValue(ok({ id: "a1" }, 201));
    document.cookie = "csrf_token=tok";

    const outcome = await createCampaignActivity("cmp-1", activityValues);

    expect(outcome).toEqual({ status: "success", activity: { id: "a1" } });
    const [path, options] = post.mock.calls[0]!;
    expect(path).toBe("/api/v1/campaigns/{id}/activities");
    expect(options.params.path).toEqual({ id: "cmp-1" });
    expect(options.body).toEqual({
      name: "Teaser",
      status: "PLANNED",
      endAt: "2026-10-05T09:30:00.000Z",
    });
    expect(options.headers).toEqual({ "x-csrf-token": "tok" });
  });

  it("builds an activity update body: every field, blanks as null", async () => {
    patch.mockResolvedValue(ok({ id: "a1" }));

    await updateCampaignActivity("cmp-1", "a1", {
      ...activityValues,
      status: "COMPLETED",
    });

    const [path, options] = patch.mock.calls[0]!;
    expect(path).toBe("/api/v1/campaigns/{id}/activities/{activityId}");
    expect(options.params.path).toEqual({ id: "cmp-1", activityId: "a1" });
    expect(options.body).toEqual({
      name: "Teaser",
      description: null,
      status: "COMPLETED",
      startAt: null,
      endAt: "2026-10-05T09:30:00.000Z",
    });
  });

  it("deletes an activity", async () => {
    del.mockResolvedValue({ response: { ok: true, status: 204 } });

    expect(await deleteCampaignActivity("cmp-1", "a1")).toEqual({
      status: "success",
    });
    expect(del.mock.calls[0]![0]).toBe(
      "/api/v1/campaigns/{id}/activities/{activityId}",
    );
    expect(del.mock.calls[0]![1].params.path).toEqual({
      id: "cmp-1",
      activityId: "a1",
    });
  });

  it.each([
    ["CAMPAIGN_ACTIVITY_SCHEDULE_INVALID", 400, "schedule_invalid"],
    ["CAMPAIGN_NOT_FOUND", 404, "not_found"],
    ["CAMPAIGN_ACTIVITY_NOT_FOUND", 404, "not_found"],
  ])("maps %s to %s when saving", async (code, status, expected) => {
    post.mockResolvedValueOnce(fail(code, status));
    patch.mockResolvedValueOnce(fail(code, status));

    expect(await createCampaignActivity("cmp-1", activityValues)).toEqual({
      status: expected,
    });
    expect(await updateCampaignActivity("cmp-1", "a1", activityValues)).toEqual(
      { status: expected },
    );
  });

  it("maps validation errors on an activity field", async () => {
    post.mockResolvedValue(
      fail("VALIDATION_ERROR", 400, { name: ["name must not be blank"] }),
    );

    expect(await createCampaignActivity("cmp-1", activityValues)).toEqual({
      status: "field_errors",
      fieldErrors: { name: "name must not be blank" },
    });
  });

  it("maps a permission failure and an unexpected failure when saving", async () => {
    post.mockResolvedValueOnce({
      error: {},
      response: { ok: false, status: 403 },
    });
    patch.mockRejectedValueOnce(new Error("network down"));

    expect(await createCampaignActivity("cmp-1", activityValues)).toEqual({
      status: "permission_denied",
    });
    expect(await updateCampaignActivity("cmp-1", "a1", activityValues)).toEqual(
      { status: "unexpected" },
    );
  });

  it("maps activity delete failures", async () => {
    del.mockResolvedValueOnce(fail("CAMPAIGN_ACTIVITY_NOT_FOUND", 404));
    del.mockResolvedValueOnce({
      error: {},
      response: { ok: false, status: 403 },
    });
    del.mockResolvedValueOnce(fail("SOMETHING_NEW", 500));
    del.mockRejectedValueOnce(new Error("network down"));

    expect(await deleteCampaignActivity("cmp-1", "a1")).toEqual({
      status: "not_found",
    });
    expect(await deleteCampaignActivity("cmp-1", "a1")).toEqual({
      status: "permission_denied",
    });
    expect(await deleteCampaignActivity("cmp-1", "a1")).toEqual({
      status: "unexpected",
    });
    expect(await deleteCampaignActivity("cmp-1", "a1")).toEqual({
      status: "unexpected",
    });
  });
});
