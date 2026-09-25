import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  const campaigns = { get: vi.fn(), getActivity: vi.fn() };
  const permissions = { hasGrant: vi.fn() };
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
    permissions.hasGrant.mockResolvedValue(true);
    repository.find.mockResolvedValue(record);
    repository.attach.mockResolvedValue(record);
    repository.list.mockResolvedValue({ items: [record], total: 1 });
    service = new PromotionService(
      campaigns as never,
      permissions as never,
      repository as never,
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

  it("requires the organization-scoped manage grant for attachment", async () => {
    permissions.hasGrant.mockResolvedValue(false);
    await expectCode(
      service.attach(ACTOR, CAMPAIGN, ACTIVITY, { channel: "RADIO_PROMOTION" }),
      "PERMISSION_DENIED",
    );
    expect(repository.attach).not.toHaveBeenCalled();
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
      service.unassignTalent(ACTOR, CAMPAIGN, ACTIVITY, "not-a-uuid"),
      "PROMOTION_ASSIGNMENT_NOT_FOUND",
    );
    expect(repository.unassign).not.toHaveBeenCalled();
  });
});
