import {
  ConflictException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { permissionDenied } from "../src/common/security/security.errors.js";
import { PromotionService } from "../src/promotion/promotion.service.js";
import { isUuid } from "../src/promotion/infrastructure/promotion.repository.js";
import { Prisma } from "../src/generated/prisma/client.js";

const ACTOR = "actor";
const CAMPAIGN = "campaign";
const ACTIVITY = "activity";
const TALENT = "00000000-0000-0000-0000-000000000001";

const record = {
  campaignActivityId: ACTIVITY,
  campaignId: CAMPAIGN,
  channel: "RADIO_PROMOTION",
  location: null,
  requiredResources: null,
  assignees: [],
  activity: {
    id: ACTIVITY,
    campaignId: CAMPAIGN,
    name: "Radio spot",
    description: null,
    status: "PLANNED",
    startAt: null,
    endAt: null,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    updatedAt: new Date("2026-09-01T00:00:00Z"),
  },
  talents: [],
} as const;

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error("Expected a Problem Details exception");
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getResponse()).toMatchObject({ code });
  }
}

describe("PromotionService", () => {
  it("accepts a complete UUID path segment and rejects a truncated one", () => {
    expect(isUuid("01a0d45e-d753-7a12-a952-979287d9b100")).toBe(true);
    expect(isUuid("01a0d45e-d753-7a12-979287d9b100")).toBe(false);
  });
  const campaigns = {
    get: vi.fn(),
    getActivity: vi.fn(),
    assertCampaignPermission: vi.fn(),
  };
  const permissions = { hasGrant: vi.fn() };
  const talentAssignments = {
    archiveHook: vi.fn(() => () => Promise.resolve()),
    create: vi.fn(),
    cancelActiveForWork: vi.fn(),
  };
  const repository = {
    list: vi.fn(),
    find: vi.fn(),
    attach: vi.fn(),
    updateChannel: vi.fn(),
    remove: vi.fn(),
    assign: vi.fn(),
    unassign: vi.fn(),
  };
  let service: PromotionService;

  beforeEach(() => {
    vi.resetAllMocks();
    campaigns.get.mockResolvedValue({ campaignType: "PROMOTION" });
    campaigns.getActivity.mockResolvedValue(record.activity);
    campaigns.assertCampaignPermission.mockResolvedValue(undefined);
    permissions.hasGrant.mockResolvedValue(true);
    repository.find.mockResolvedValue(record);
    repository.attach.mockResolvedValue(record);
    repository.list.mockResolvedValue({ items: [record], total: 1 });
    service = new PromotionService(
      campaigns as never,
      permissions as never,
      repository as never,
      talentAssignments as never,
      {} as never,
    );
  });

  it("hides marketing campaigns and never queries promotion details for them", async () => {
    campaigns.get.mockResolvedValue({ campaignType: "MARKETING" });
    await expectCode(
      service.list(ACTOR, CAMPAIGN, { page: 1, pageSize: 25 }),
      "PROMOTION_CAMPAIGN_NOT_FOUND",
    );
    expect(repository.list).not.toHaveBeenCalled();
  });

  it("checks the manage permission against the campaign's own department", async () => {
    campaigns.assertCampaignPermission.mockRejectedValue(permissionDenied());
    await expectCode(
      service.attach(ACTOR, CAMPAIGN, ACTIVITY, { channel: "RADIO_PROMOTION" }),
      "PERMISSION_DENIED",
    );
    expect(campaigns.assertCampaignPermission).toHaveBeenCalledWith(
      ACTOR,
      CAMPAIGN,
      "campaign.activity.manage",
    );
    expect(repository.attach).not.toHaveBeenCalled();
  });

  it("no longer requires an organization-scoped grant to manage a detail (EVE-229)", async () => {
    permissions.hasGrant.mockResolvedValue(false);
    await service.attach(ACTOR, CAMPAIGN, ACTIVITY, {
      channel: "RADIO_PROMOTION",
    });
    expect(repository.attach).toHaveBeenCalled();
  });

  it("rejects duplicate initial talents before a write", async () => {
    await expectCode(
      service.attach(ACTOR, CAMPAIGN, ACTIVITY, {
        channel: "RADIO_PROMOTION",
        talents: [
          { talentId: TALENT, role: "Host" },
          { talentId: TALENT, role: "Singer" },
        ],
      }),
      "PROMOTION_DUPLICATE_TALENT",
    );
    expect(repository.attach).not.toHaveBeenCalled();
  });

  it("requires talent.assign and passes trimmed roles to the atomic attach", async () => {
    const result = await service.attach(ACTOR, CAMPAIGN, ACTIVITY, {
      channel: "RADIO_PROMOTION",
      talents: [{ talentId: TALENT, role: "  Host  " }],
    });
    expect(permissions.hasGrant).toHaveBeenCalledWith(
      ACTOR,
      "talent.assign",
      "ORGANIZATION",
    );
    expect(repository.attach).toHaveBeenCalledWith(
      CAMPAIGN,
      ACTIVITY,
      "RADIO_PROMOTION",
      [{ talentId: TALENT, role: "Host" }],
    );
    expect(result.activity.status).toBe("PLANNED");
  });

  it("returns a conflict when promotion details already exist", async () => {
    repository.attach.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "7.10.0",
      }),
    );
    await expectCode(
      service.attach(ACTOR, CAMPAIGN, ACTIVITY, {
        channel: "RADIO_PROMOTION",
      }),
      "PROMOTION_DETAIL_CONFLICT",
    );
  });

  it("returns not-found for an activity with no promotion detail", async () => {
    repository.find.mockResolvedValue(null);
    await expectCode(
      service.get(ACTOR, CAMPAIGN, ACTIVITY),
      "PROMOTION_ACTIVITY_NOT_FOUND",
    );
  });

  it("returns a stable not-found for an invalid unassignment id", async () => {
    await expectCode(
      service.unassignTalent(ACTOR, CAMPAIGN, ACTIVITY, "not-a-uuid", "req-1"),
      "PROMOTION_ASSIGNMENT_NOT_FOUND",
    );
    expect(talentAssignments.cancelActiveForWork).not.toHaveBeenCalled();
  });

  it("requires talent.assign before writing an initial talent assignment", async () => {
    permissions.hasGrant.mockImplementation((_actor: string, key: string) =>
      Promise.resolve(key !== "talent.assign"),
    );
    await expectCode(
      service.attach(ACTOR, CAMPAIGN, ACTIVITY, {
        channel: "SOCIAL_MEDIA",
        talents: [{ talentId: TALENT, role: "Host" }],
      }),
      "PERMISSION_DENIED",
    );
    expect(repository.attach).not.toHaveBeenCalled();
  });

  it("does not query details when campaign activity ownership fails", async () => {
    campaigns.getActivity.mockRejectedValue(
      new HttpException({ code: "CAMPAIGN_ACTIVITY_NOT_FOUND" }, 404),
    );
    await expectCode(
      service.get(ACTOR, CAMPAIGN, ACTIVITY),
      "CAMPAIGN_ACTIVITY_NOT_FOUND",
    );
    expect(repository.find).not.toHaveBeenCalled();
  });

  it("maps failed channel changes and removals to stable not-found errors", async () => {
    repository.updateChannel.mockResolvedValue(null);
    repository.remove.mockResolvedValue("not_found");
    await expectCode(
      service.updateChannel(ACTOR, CAMPAIGN, ACTIVITY, {
        channel: "SOCIAL_MEDIA",
      }),
      "PROMOTION_ACTIVITY_NOT_FOUND",
    );
    await expectCode(
      service.remove(ACTOR, CAMPAIGN, ACTIVITY, "req-1"),
      "PROMOTION_ACTIVITY_NOT_FOUND",
    );
  });

  it("maps missing and duplicate talents without swallowing unrelated failures", async () => {
    talentAssignments.create
      .mockRejectedValueOnce(
        new NotFoundException({ code: "TALENT_NOT_FOUND" }),
      )
      .mockRejectedValueOnce(
        new ConflictException({ code: "TALENT_ASSIGNMENT_DUPLICATE" }),
      )
      .mockRejectedValueOnce(new Error("database unavailable"));
    await expectCode(
      service.assignTalent(
        ACTOR,
        CAMPAIGN,
        ACTIVITY,
        {
          talentId: TALENT,
          role: "Host",
        },
        "req-1",
      ),
      "TALENT_NOT_FOUND",
    );
    await expectCode(
      service.assignTalent(
        ACTOR,
        CAMPAIGN,
        ACTIVITY,
        {
          talentId: TALENT,
          role: "Host",
        },
        "req-1",
      ),
      "PROMOTION_ASSIGNMENT_CONFLICT",
    );
    await expect(
      service.assignTalent(
        ACTOR,
        CAMPAIGN,
        ACTIVITY,
        {
          talentId: TALENT,
          role: "Host",
        },
        "req-1",
      ),
    ).rejects.toThrow("database unavailable");
  });
});

describe("PromotionService workspace summaries (EVE-234)", () => {
  const visibility = { organization: false, departmentId: "dept-promo" };
  const campaigns = {
    readableCampaignFilter: vi.fn(),
    listBudgetSummaries: vi.fn(),
  };
  const permissions = {
    hasGrant: vi.fn(),
    getAccessContext: vi.fn(),
    getOverseenDepartments: vi.fn(),
  };
  const partners = { statusCountsForDepartment: vi.fn() };
  const repository = {
    upcomingEvents: vi.fn(),
    campaignStatusCounts: vi.fn(),
    latestMetrics: vi.fn(),
    findActiveDepartmentIdByName: vi.fn(),
  };
  const event = {
    id: "event-1",
    name: "Launch night",
    eventType: "CONCERT",
    status: "READY",
    startAt: new Date("2026-12-01T18:00:00Z"),
    endAt: null,
    location: "Addis Ababa",
    organizerName: null,
    department: { name: "Event Office" },
    campaigns: [{ id: "c-1", name: "Launch push", status: "ACTIVE" }],
  };
  let service: PromotionService;

  beforeEach(() => {
    vi.resetAllMocks();
    permissions.hasGrant.mockResolvedValue(false);
    permissions.getAccessContext.mockResolvedValue({
      role: "DEPARTMENT_MANAGER",
      department: { id: "dept-promo", name: "Promotion", active: true },
    });
    permissions.getOverseenDepartments.mockResolvedValue([]);
    campaigns.readableCampaignFilter.mockResolvedValue(visibility);
    repository.upcomingEvents.mockResolvedValue({ items: [event], total: 3 });
    repository.findActiveDepartmentIdByName.mockResolvedValue("dept-promo");
    service = new PromotionService(
      campaigns as never,
      permissions as never,
      repository as never,
      {} as never,
      partners as never,
    );
  });

  it("refuses the event schedule to staff outside Promotion and its oversight", async () => {
    permissions.getAccessContext.mockResolvedValue({
      role: "DEPARTMENT_MEMBER",
      department: { id: "dept-mkt", name: "Marketing", active: true },
    });
    await expect(
      service.upcomingEvents(ACTOR, { page: 1, pageSize: 25 }),
    ).rejects.toThrow(permissionDenied().message);
    expect(repository.upcomingEvents).not.toHaveBeenCalled();
  });

  it("lets the manager overseeing Promotion read the schedule", async () => {
    permissions.getAccessContext.mockResolvedValue({
      role: "DEPARTMENT_MANAGER",
      department: { id: "dept-mkt", name: "Marketing", active: true },
    });
    permissions.getOverseenDepartments.mockResolvedValue([
      { id: "dept-promo", name: "Promotion" },
    ]);
    const result = await service.upcomingEvents(ACTOR, {
      page: 1,
      pageSize: 25,
    });
    expect(result.items[0]).toMatchObject({
      name: "Launch night",
      startAt: "2026-12-01T18:00:00.000Z",
      departmentName: "Event Office",
      campaigns: [{ id: "c-1" }],
    });
    expect(repository.upcomingEvents).toHaveBeenCalledWith(
      expect.objectContaining({ visibility }),
    );
  });

  it("summarizes campaigns, budget per currency and the latest indicators", async () => {
    repository.campaignStatusCounts.mockResolvedValue([
      { status: "ACTIVE", count: 2 },
      { status: "COMPLETED", count: 1 },
    ]);
    repository.latestMetrics.mockResolvedValue([
      { campaignId: "c-1", key: "REACH", value: new Prisma.Decimal("1000.50") },
      { campaignId: "c-2", key: "REACH", value: new Prisma.Decimal("250") },
    ]);
    partners.statusCountsForDepartment.mockResolvedValue([
      { status: "COMMITTED", count: 1 },
    ]);
    campaigns.listBudgetSummaries.mockResolvedValue({
      items: [
        {
          currency: "ETB",
          allocated: "1000.00",
          approved: "400.10",
          pending: "100.00",
          overBudget: false,
        },
        {
          currency: "ETB",
          allocated: null,
          approved: "50.00",
          pending: "0.00",
          overBudget: true,
        },
        {
          currency: null,
          allocated: null,
          approved: "0.00",
          pending: "0.00",
          overBudget: false,
        },
      ],
      page: 1,
      pageSize: 100,
      total: 3,
    });
    const overview = await service.overview(ACTOR);
    expect(overview).toMatchObject({
      totalCampaigns: 3,
      upcomingEventCount: 3,
      partnershipsByStatus: [{ status: "COMMITTED", count: 1 }],
      budget: [
        {
          currency: "ETB",
          allocated: "1000.00",
          approved: "450.10",
          pending: "100.00",
          campaignCount: 2,
          overBudgetCount: 1,
        },
      ],
      performance: [{ key: "REACH", value: "1250.50", campaignCount: 2 }],
    });
  });

  it("leaves out the budget when the caller cannot read budgets", async () => {
    repository.campaignStatusCounts.mockResolvedValue([]);
    repository.latestMetrics.mockResolvedValue([]);
    partners.statusCountsForDepartment.mockResolvedValue(null);
    campaigns.listBudgetSummaries.mockRejectedValue(permissionDenied());
    const overview = await service.overview(ACTOR);
    expect(overview.budget).toBeNull();
    expect(overview.partnershipsByStatus).toBeNull();
    expect(overview.totalCampaigns).toBe(0);
  });
});
