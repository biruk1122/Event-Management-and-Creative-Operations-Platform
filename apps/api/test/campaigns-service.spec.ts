import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CampaignsService } from "../src/campaigns/campaigns.service.js";
import type {
  CampaignActivityRecord,
  CampaignRecord,
} from "../src/campaigns/infrastructure/campaigns.repository.js";
import type { PermissionScope } from "../src/generated/prisma/client.js";

const ACTOR = "actor-1";

function makeCampaign(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: "cmp-1",
    workspaceId: "ws-1",
    name: "Launch",
    campaignType: "MARKETING",
    description: null,
    audience: null,
    status: "PLANNED",
    startAt: null,
    endAt: null,
    eventId: null,
    productName: null,
    budgetAmount: null,
    budgetCurrency: null,
    progress: { completedActivities: 0, totalActivities: 0, percent: null },
    manager: null,
    teams: [],
    participants: [],
    createdBy: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

function makeActivity(
  overrides: Partial<CampaignActivityRecord> = {},
): CampaignActivityRecord {
  return {
    id: "act-1",
    campaignId: "cmp-1",
    name: "Teaser",
    description: null,
    status: "PLANNED",
    startAt: null,
    endAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

async function expectCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(HttpException);
  await promise.catch((error: unknown) => {
    const response = (error as HttpException).getResponse() as {
      code?: string;
    };
    expect(response.code).toBe(code);
  });
}

describe("CampaignsService", () => {
  let repository: {
    list: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
    setBudget: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    listActivities: ReturnType<typeof vi.fn>;
    findActivity: ReturnType<typeof vi.fn>;
    createActivity: ReturnType<typeof vi.fn>;
    updateActivity: ReturnType<typeof vi.fn>;
    deleteActivity: ReturnType<typeof vi.fn>;
  };
  let workspaces: {
    setManager: ReturnType<typeof vi.fn>;
    assignTeam: ReturnType<typeof vi.fn>;
    unassignTeam: ReturnType<typeof vi.fn>;
  };
  let permissions: {
    hasGrant: ReturnType<
      typeof vi.fn<
        (u: string, k: string, s: PermissionScope) => Promise<boolean>
      >
    >;
  };
  let service: CampaignsService;

  beforeEach(() => {
    repository = {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      findById: vi.fn().mockResolvedValue(makeCampaign()),
      create: vi.fn().mockResolvedValue(makeCampaign()),
      update: vi.fn().mockResolvedValue(makeCampaign()),
      updateStatus: vi.fn().mockResolvedValue(makeCampaign()),
      setBudget: vi
        .fn()
        .mockResolvedValue(
          makeCampaign({ budgetAmount: "10.00", budgetCurrency: "USD" }),
        ),
      delete: vi.fn().mockResolvedValue("deleted"),
      listActivities: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      findActivity: vi.fn().mockResolvedValue(makeActivity()),
      createActivity: vi.fn().mockResolvedValue(makeActivity()),
      updateActivity: vi.fn().mockResolvedValue(makeActivity()),
      deleteActivity: vi.fn().mockResolvedValue("deleted"),
    };
    workspaces = {
      setManager: vi.fn().mockResolvedValue({}),
      assignTeam: vi.fn().mockResolvedValue({}),
      unassignTeam: vi.fn().mockResolvedValue({}),
    };
    permissions = { hasGrant: vi.fn().mockResolvedValue(true) };
    service = new CampaignsService(
      repository as never,
      workspaces as never,
      permissions as never,
    );
  });

  function grantOnly(...allowed: [string, PermissionScope][]): void {
    permissions.hasGrant.mockImplementation((_userId, key, scope) =>
      Promise.resolve(allowed.some(([k, s]) => k === key && s === scope)),
    );
  }

  describe("authorization is by the exact campaign key at ORGANIZATION scope", () => {
    it.each([
      [
        "list",
        (s: CampaignsService) => s.list(ACTOR, { page: 1, pageSize: 25 }),
      ],
      ["get", (s: CampaignsService) => s.get(ACTOR, "cmp-1")],
      [
        "create",
        (s: CampaignsService) =>
          s.create(ACTOR, { name: "x", campaignType: "MARKETING" }),
      ],
      ["update", (s: CampaignsService) => s.update(ACTOR, "cmp-1", {})],
      [
        "transition",
        (s: CampaignsService) => s.transition(ACTOR, "cmp-1", "ACTIVE"),
      ],
      [
        "setManager",
        (s: CampaignsService) => s.setManager(ACTOR, "cmp-1", null),
      ],
      [
        "assignTeam",
        (s: CampaignsService) => s.assignTeam(ACTOR, "cmp-1", "team-1"),
      ],
      [
        "unassignTeam",
        (s: CampaignsService) => s.unassignTeam(ACTOR, "cmp-1", "team-1"),
      ],
      ["getBudget", (s: CampaignsService) => s.getBudget(ACTOR, "cmp-1")],
      [
        "setBudget",
        (s: CampaignsService) =>
          s.setBudget(ACTOR, "cmp-1", { amount: 1, currency: "USD" }),
      ],
      ["remove", (s: CampaignsService) => s.remove(ACTOR, "cmp-1")],
      [
        "listActivities",
        (s: CampaignsService) =>
          s.listActivities(ACTOR, "cmp-1", { page: 1, pageSize: 25 }),
      ],
      [
        "createActivity",
        (s: CampaignsService) =>
          s.createActivity(ACTOR, "cmp-1", { name: "x" }),
      ],
      [
        "updateActivity",
        (s: CampaignsService) =>
          s.updateActivity(ACTOR, "cmp-1", "act-1", { name: "y" }),
      ],
      [
        "removeActivity",
        (s: CampaignsService) => s.removeActivity(ACTOR, "cmp-1", "act-1"),
      ],
    ] as const)("%s is denied without a grant", async (_label, call) => {
      grantOnly();
      await expectCode(call(service), "PERMISSION_DENIED");
    });

    it.each([
      ["campaign.read", "DEPARTMENT"],
      ["campaign.read", "SELF"],
    ] as const)(
      "read is denied for a %s grant at %s scope",
      async (key, scope) => {
        grantOnly([key, scope]);
        await expectCode(
          service.list(ACTOR, { page: 1, pageSize: 25 }),
          "PERMISSION_DENIED",
        );
      },
    );

    it("each write path checks its own key", async () => {
      const table: [string, () => Promise<unknown>][] = [
        [
          "campaign.create",
          () => service.create(ACTOR, { name: "x", campaignType: "PROMOTION" }),
        ],
        ["campaign.update", () => service.update(ACTOR, "cmp-1", {})],
        [
          "campaign.transition_status",
          () => service.transition(ACTOR, "cmp-1", "ACTIVE"),
        ],
        ["campaign.assign", () => service.setManager(ACTOR, "cmp-1", null)],
        ["campaign.assign", () => service.assignTeam(ACTOR, "cmp-1", "team-1")],
        [
          "campaign.assign",
          () => service.unassignTeam(ACTOR, "cmp-1", "team-1"),
        ],
        ["campaign.budget.read", () => service.getBudget(ACTOR, "cmp-1")],
        [
          "campaign.budget.update",
          () => service.setBudget(ACTOR, "cmp-1", { amount: 1, currency: "X" }),
        ],
        ["campaign.delete", () => service.remove(ACTOR, "cmp-1")],
        [
          "campaign.activity.manage",
          () => service.createActivity(ACTOR, "cmp-1", { name: "x" }),
        ],
        [
          "campaign.activity.manage",
          () => service.updateActivity(ACTOR, "cmp-1", "act-1", {}),
        ],
        [
          "campaign.activity.manage",
          () => service.removeActivity(ACTOR, "cmp-1", "act-1"),
        ],
      ];
      for (const [key, call] of table) {
        // Holding every key except the one this path needs must still deny.
        permissions.hasGrant.mockImplementation((_u, k) =>
          Promise.resolve(k !== key),
        );
        await expectCode(call(), "PERMISSION_DENIED");
      }
    });

    it("keeps the budget behind its own keys, not campaign.read", async () => {
      grantOnly(["campaign.read", "ORGANIZATION"]);
      await expectCode(service.getBudget(ACTOR, "cmp-1"), "PERMISSION_DENIED");
    });

    it("reads activities with campaign.read and writes them with activity.manage", async () => {
      grantOnly(["campaign.read", "ORGANIZATION"]);
      await expect(
        service.listActivities(ACTOR, "cmp-1", { page: 1, pageSize: 25 }),
      ).resolves.toMatchObject({ total: 0 });
      await expectCode(
        service.createActivity(ACTOR, "cmp-1", { name: "x" }),
        "PERMISSION_DENIED",
      );
    });

    it("404s an unknown campaign before evaluating any grant", async () => {
      repository.findById.mockResolvedValue(null);
      grantOnly();
      await expectCode(service.get(ACTOR, "nope"), "CAMPAIGN_NOT_FOUND");
      await expectCode(
        service.createActivity(ACTOR, "nope", { name: "x" }),
        "CAMPAIGN_NOT_FOUND",
      );
    });
  });

  describe("create and update policy", () => {
    it("trims text and stamps the acting user as author", async () => {
      await service.create(ACTOR, {
        name: "  Push  ",
        campaignType: "PROMOTION",
        description: "  Big.  ",
        audience: "  Everyone  ",
        productName: "  Widget  ",
      });

      expect(repository.create).toHaveBeenCalledWith({
        name: "Push",
        campaignType: "PROMOTION",
        createdById: ACTOR,
        description: "Big.",
        audience: "Everyone",
        productName: "Widget",
      });
    });

    it("rejects an end before the start on create and never writes", async () => {
      await expectCode(
        service.create(ACTOR, {
          name: "x",
          campaignType: "MARKETING",
          startAt: "2026-10-02T00:00:00.000Z",
          endAt: "2026-10-01T00:00:00.000Z",
        }),
        "CAMPAIGN_SCHEDULE_INVALID",
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("rejects both an event and a product on create", async () => {
      await expectCode(
        service.create(ACTOR, {
          name: "x",
          campaignType: "MARKETING",
          eventId: "evt-1",
          productName: "Widget",
        }),
        "CAMPAIGN_RELATED_SUBJECT_CONFLICT",
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("maps repository failures to stable problem codes", async () => {
      repository.create.mockResolvedValueOnce("manager_not_found");
      await expectCode(
        service.create(ACTOR, { name: "x", campaignType: "MARKETING" }),
        "USER_NOT_FOUND",
      );
      repository.create.mockResolvedValueOnce("event_not_found");
      await expectCode(
        service.create(ACTOR, { name: "x", campaignType: "MARKETING" }),
        "EVENT_NOT_FOUND",
      );
      repository.update.mockResolvedValueOnce("not_found");
      await expectCode(
        service.update(ACTOR, "cmp-1", {}),
        "CAMPAIGN_NOT_FOUND",
      );
      repository.update.mockResolvedValueOnce("event_not_found");
      await expectCode(
        service.update(ACTOR, "cmp-1", { eventId: "evt-x" }),
        "EVENT_NOT_FOUND",
      );
    });

    it("judges the schedule on the values after the patch", async () => {
      repository.findById.mockResolvedValue(
        makeCampaign({ startAt: new Date("2026-10-05T00:00:00.000Z") }),
      );

      await expectCode(
        service.update(ACTOR, "cmp-1", { endAt: "2026-10-01T00:00:00.000Z" }),
        "CAMPAIGN_SCHEDULE_INVALID",
      );
      // Clearing the start makes the same end valid.
      await expect(
        service.update(ACTOR, "cmp-1", {
          startAt: null,
          endAt: "2026-10-01T00:00:00.000Z",
        }),
      ).resolves.toBeDefined();
    });

    it("judges the related subject on the values after the patch", async () => {
      repository.findById.mockResolvedValue(
        makeCampaign({ productName: "Widget" }),
      );

      await expectCode(
        service.update(ACTOR, "cmp-1", { eventId: "evt-1" }),
        "CAMPAIGN_RELATED_SUBJECT_CONFLICT",
      );
      // Switching subject in one request clears the old one.
      await expect(
        service.update(ACTOR, "cmp-1", { eventId: "evt-1", productName: null }),
      ).resolves.toBeDefined();
      expect(repository.update).toHaveBeenLastCalledWith("cmp-1", {
        eventId: "evt-1",
        productName: null,
      });
    });

    it("only sends the fields the caller set", async () => {
      await service.update(ACTOR, "cmp-1", { name: "  New  ", audience: null });

      expect(repository.update).toHaveBeenCalledWith("cmp-1", {
        name: "New",
        audience: null,
      });
    });

    it("never exposes the budget on the campaign response", async () => {
      repository.findById.mockResolvedValue(
        makeCampaign({ budgetAmount: "5.00", budgetCurrency: "USD" }),
      );

      const response = await service.get(ACTOR, "cmp-1");

      expect(response).not.toHaveProperty("budgetAmount");
      expect(response).not.toHaveProperty("budgetCurrency");
      expect(response).not.toHaveProperty("budget");
    });
  });

  describe("lifecycle", () => {
    it.each([
      ["PLANNED", "ACTIVE"],
      ["PLANNED", "CANCELLED"],
      ["ACTIVE", "COMPLETED"],
      ["ACTIVE", "CANCELLED"],
    ] as const)("allows %s -> %s", async (from, to) => {
      repository.findById.mockResolvedValue(makeCampaign({ status: from }));

      await service.transition(ACTOR, "cmp-1", to);

      expect(repository.updateStatus).toHaveBeenCalledWith("cmp-1", to);
    });

    it.each([
      ["PLANNED", "COMPLETED"],
      ["PLANNED", "PLANNED"],
      ["ACTIVE", "PLANNED"],
      ["COMPLETED", "ACTIVE"],
      ["COMPLETED", "CANCELLED"],
      ["CANCELLED", "PLANNED"],
      ["CANCELLED", "ACTIVE"],
    ] as const)("rejects %s -> %s", async (from, to) => {
      repository.findById.mockResolvedValue(makeCampaign({ status: from }));

      await expectCode(
        service.transition(ACTOR, "cmp-1", to),
        "CAMPAIGN_INVALID_TRANSITION",
      );
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it("404s when the campaign disappears between load and update", async () => {
      repository.updateStatus.mockResolvedValueOnce("not_found");
      await expectCode(
        service.transition(ACTOR, "cmp-1", "ACTIVE"),
        "CAMPAIGN_NOT_FOUND",
      );
    });
  });

  describe("manager and teams reuse the workspace composition", () => {
    it("assigns and clears the manager on the campaign's workspace", async () => {
      await service.setManager(ACTOR, "cmp-1", "user-1");
      expect(workspaces.setManager).toHaveBeenCalledWith("ws-1", "user-1");

      workspaces.setManager.mockResolvedValueOnce("manager_not_found");
      await expectCode(
        service.setManager(ACTOR, "cmp-1", "ghost"),
        "USER_NOT_FOUND",
      );
      workspaces.setManager.mockResolvedValueOnce("not_found");
      await expectCode(
        service.setManager(ACTOR, "cmp-1", null),
        "CAMPAIGN_NOT_FOUND",
      );
    });

    it("maps team assignment outcomes", async () => {
      await service.assignTeam(ACTOR, "cmp-1", "team-1");
      expect(workspaces.assignTeam).toHaveBeenCalledWith("ws-1", "team-1");

      workspaces.assignTeam.mockResolvedValueOnce("team_not_found");
      await expectCode(
        service.assignTeam(ACTOR, "cmp-1", "ghost"),
        "CAMPAIGN_TEAM_NOT_FOUND",
      );
      workspaces.assignTeam.mockResolvedValueOnce("workspace_not_found");
      await expectCode(
        service.assignTeam(ACTOR, "cmp-1", "team-1"),
        "CAMPAIGN_NOT_FOUND",
      );

      await service.unassignTeam(ACTOR, "cmp-1", "team-1");
      expect(workspaces.unassignTeam).toHaveBeenCalledWith("ws-1", "team-1");
      workspaces.unassignTeam.mockResolvedValueOnce("not_assigned");
      await expectCode(
        service.unassignTeam(ACTOR, "cmp-1", "team-1"),
        "CAMPAIGN_TEAM_NOT_ASSIGNED",
      );
    });
  });

  describe("budget", () => {
    it("reads the stored amount and currency", async () => {
      repository.findById.mockResolvedValue(
        makeCampaign({ budgetAmount: "25000.50", budgetCurrency: "ETB" }),
      );

      await expect(service.getBudget(ACTOR, "cmp-1")).resolves.toEqual({
        amount: "25000.50",
        currency: "ETB",
      });
    });

    it("stores the amount with two fraction digits", async () => {
      await service.setBudget(ACTOR, "cmp-1", { amount: 10, currency: "USD" });

      expect(repository.setBudget).toHaveBeenCalledWith(
        "cmp-1",
        "10.00",
        "USD",
      );
    });

    it("clears the budget when both are null", async () => {
      repository.setBudget.mockResolvedValue(makeCampaign());

      await expect(
        service.setBudget(ACTOR, "cmp-1", { amount: null, currency: null }),
      ).resolves.toEqual({ amount: null, currency: null });
      expect(repository.setBudget).toHaveBeenCalledWith("cmp-1", null, null);
    });

    it("rejects an amount without a currency and the reverse", async () => {
      await expectCode(
        service.setBudget(ACTOR, "cmp-1", { amount: 5, currency: null }),
        "CAMPAIGN_BUDGET_INCOMPLETE",
      );
      await expectCode(
        service.setBudget(ACTOR, "cmp-1", { amount: null, currency: "USD" }),
        "CAMPAIGN_BUDGET_INCOMPLETE",
      );
      expect(repository.setBudget).not.toHaveBeenCalled();
    });
  });

  describe("delete", () => {
    it("removes the campaign", async () => {
      await expect(service.remove(ACTOR, "cmp-1")).resolves.toBeUndefined();
      expect(repository.delete).toHaveBeenCalledWith("cmp-1");
    });

    it("maps repository outcomes to stable problem codes", async () => {
      repository.delete.mockResolvedValueOnce("has_managed_files");
      await expectCode(
        service.remove(ACTOR, "cmp-1"),
        "CAMPAIGN_HAS_MANAGED_FILES",
      );
      repository.delete.mockResolvedValueOnce("not_found");
      await expectCode(service.remove(ACTOR, "cmp-1"), "CAMPAIGN_NOT_FOUND");
    });
  });

  describe("list", () => {
    it("passes only the filters that were set and echoes the paging", async () => {
      repository.list.mockResolvedValue({
        items: [makeCampaign()],
        total: 41,
      });

      const page = await service.list(ACTOR, {
        page: 2,
        pageSize: 10,
        status: "ACTIVE",
        campaignType: "PROMOTION",
        search: "  launch ",
        startingAfter: "2026-10-01T00:00:00.000Z",
      });

      expect(repository.list).toHaveBeenCalledWith({
        status: "ACTIVE",
        campaignType: "PROMOTION",
        search: "launch",
        startingAfter: new Date("2026-10-01T00:00:00.000Z"),
        page: 2,
        pageSize: 10,
      });
      expect(page).toMatchObject({ page: 2, pageSize: 10, total: 41 });
      expect(page.items).toHaveLength(1);
    });

    it("maps ISO dates and progress on the response", async () => {
      repository.findById.mockResolvedValue(
        makeCampaign({
          startAt: new Date("2026-10-01T18:00:00.000Z"),
          progress: { completedActivities: 1, totalActivities: 4, percent: 25 },
        }),
      );

      const response = await service.get(ACTOR, "cmp-1");

      expect(response.startAt).toBe("2026-10-01T18:00:00.000Z");
      expect(response.endAt).toBeNull();
      expect(response.progress).toEqual({
        completedActivities: 1,
        totalActivities: 4,
        percent: 25,
      });
    });
  });

  describe("activities", () => {
    it("creates an activity trimmed, with the optional fields only when set", async () => {
      await service.createActivity(ACTOR, "cmp-1", {
        name: "  Teaser  ",
        description: "  Post it.  ",
        status: "IN_PROGRESS",
        startAt: "2026-10-01T00:00:00.000Z",
      });

      expect(repository.createActivity).toHaveBeenCalledWith("cmp-1", {
        name: "Teaser",
        description: "Post it.",
        status: "IN_PROGRESS",
        startAt: new Date("2026-10-01T00:00:00.000Z"),
      });
    });

    it("rejects an activity end before its start", async () => {
      await expectCode(
        service.createActivity(ACTOR, "cmp-1", {
          name: "x",
          startAt: "2026-10-02T00:00:00.000Z",
          endAt: "2026-10-01T00:00:00.000Z",
        }),
        "CAMPAIGN_ACTIVITY_SCHEDULE_INVALID",
      );
      expect(repository.createActivity).not.toHaveBeenCalled();
    });

    it("404s creating under a campaign that disappeared", async () => {
      repository.createActivity.mockResolvedValueOnce("campaign_not_found");
      await expectCode(
        service.createActivity(ACTOR, "cmp-1", { name: "x" }),
        "CAMPAIGN_NOT_FOUND",
      );
    });

    it("404s an unknown activity on update and delete", async () => {
      repository.findActivity.mockResolvedValueOnce(null);
      await expectCode(
        service.updateActivity(ACTOR, "cmp-1", "ghost", { name: "y" }),
        "CAMPAIGN_ACTIVITY_NOT_FOUND",
      );
      repository.deleteActivity.mockResolvedValueOnce("not_found");
      await expectCode(
        service.removeActivity(ACTOR, "cmp-1", "ghost"),
        "CAMPAIGN_ACTIVITY_NOT_FOUND",
      );
    });

    it("judges an activity's schedule on the values after the patch", async () => {
      repository.findActivity.mockResolvedValue(
        makeActivity({ startAt: new Date("2026-10-05T00:00:00.000Z") }),
      );

      await expectCode(
        service.updateActivity(ACTOR, "cmp-1", "act-1", {
          endAt: "2026-10-01T00:00:00.000Z",
        }),
        "CAMPAIGN_ACTIVITY_SCHEDULE_INVALID",
      );
    });

    it("sets any activity status, since no transition graph is defined", async () => {
      for (const status of [
        "COMPLETED",
        "PLANNED",
        "CANCELLED",
        "IN_PROGRESS",
      ] as const) {
        await service.updateActivity(ACTOR, "cmp-1", "act-1", { status });
        expect(repository.updateActivity).toHaveBeenLastCalledWith(
          "cmp-1",
          "act-1",
          { status },
        );
      }
    });

    it("lists a campaign's activities with the paging echoed", async () => {
      repository.listActivities.mockResolvedValue({
        items: [makeActivity()],
        total: 9,
      });

      const page = await service.listActivities(ACTOR, "cmp-1", {
        page: 3,
        pageSize: 2,
        status: "COMPLETED",
      });

      expect(repository.listActivities).toHaveBeenCalledWith("cmp-1", {
        status: "COMPLETED",
        page: 3,
        pageSize: 2,
      });
      expect(page).toMatchObject({ page: 3, pageSize: 2, total: 9 });
      expect(page.items[0]?.startAt).toBeNull();
    });
  });
});
