import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "../src/generated/prisma/client.js";
import { MarketingService } from "../src/marketing/marketing.service.js";

const record = {
  campaignId: "campaign-id",
  campaignType: "MARKETING",
  strategy: "Partner outreach",
  createdAt: new Date("2026-09-01T00:00:00Z"),
  updatedAt: new Date("2026-09-02T00:00:00Z"),
};

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error("Expected a Problem Details exception");
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getResponse()).toMatchObject({ code });
  }
}

describe("MarketingService", () => {
  const campaigns = { get: vi.fn() };
  const permissions = { hasGrant: vi.fn() };
  const repository = {
    find: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
  let service: MarketingService;

  beforeEach(() => {
    vi.resetAllMocks();
    campaigns.get.mockResolvedValue({ campaignType: "MARKETING" });
    permissions.hasGrant.mockResolvedValue(true);
    repository.find.mockResolvedValue(record);
    repository.create.mockResolvedValue(record);
    repository.update.mockResolvedValue(record);
    repository.remove.mockResolvedValue(true);
    service = new MarketingService(
      campaigns as never,
      permissions as never,
      repository as never,
    );
  });

  it("reads strategy through the exported campaign query", async () => {
    expect(await service.get("actor", "campaign-id")).toMatchObject({
      campaignId: "campaign-id",
      strategy: "Partner outreach",
      updatedAt: "2026-09-02T00:00:00.000Z",
    });
    expect(campaigns.get).toHaveBeenCalledWith("actor", "campaign-id");
  });

  it("hides non-marketing campaigns before querying marketing data", async () => {
    campaigns.get.mockResolvedValue({ campaignType: "PROMOTION" });
    await expectCode(
      service.get("actor", "campaign-id"),
      "MARKETING_CAMPAIGN_NOT_FOUND",
    );
    expect(repository.find).not.toHaveBeenCalled();
  });

  it("does not query strategy data when the shared campaign lookup denies access", async () => {
    const denied = new HttpException({ code: "PERMISSION_DENIED" }, 403);
    campaigns.get.mockRejectedValue(denied);
    await expect(service.get("actor", "campaign-id")).rejects.toBe(denied);
    expect(repository.find).not.toHaveBeenCalled();
  });

  it("returns not-found when a campaign has no strategy", async () => {
    repository.find.mockResolvedValue(null);
    await expectCode(
      service.get("actor", "campaign-id"),
      "MARKETING_STRATEGY_NOT_FOUND",
    );
  });

  it("requires organization-scoped update permission before mutations", async () => {
    permissions.hasGrant.mockResolvedValue(false);
    await expectCode(
      service.create("actor", "campaign-id", "New approach"),
      "PERMISSION_DENIED",
    );
    expect(permissions.hasGrant).toHaveBeenCalledWith(
      "actor",
      "campaign.update",
      "ORGANIZATION",
    );
    expect(repository.create).not.toHaveBeenCalled();
    await expectCode(
      service.update("actor", "campaign-id", "New approach"),
      "PERMISSION_DENIED",
    );
    await expectCode(
      service.remove("actor", "campaign-id"),
      "PERMISSION_DENIED",
    );
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.remove).not.toHaveBeenCalled();
  });

  it("trims strategy text and reports duplicate attachment as a conflict", async () => {
    await service.create("actor", "campaign-id", "  Partner outreach  ");
    expect(repository.create).toHaveBeenCalledWith(
      "campaign-id",
      "Partner outreach",
    );
    repository.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "7.10.0",
      }),
    );
    await expectCode(
      service.create("actor", "campaign-id", "Again"),
      "MARKETING_STRATEGY_CONFLICT",
    );
  });

  it("returns stable not-found for a raced-away campaign or strategy", async () => {
    repository.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("missing", {
        code: "P2003",
        clientVersion: "7.10.0",
      }),
    );
    await expectCode(
      service.create("actor", "campaign-id", "Approach"),
      "MARKETING_CAMPAIGN_NOT_FOUND",
    );
    repository.update.mockResolvedValue(null);
    await expectCode(
      service.update("actor", "campaign-id", "Approach"),
      "MARKETING_STRATEGY_NOT_FOUND",
    );
    repository.remove.mockResolvedValue(false);
    await expectCode(
      service.remove("actor", "campaign-id"),
      "MARKETING_STRATEGY_NOT_FOUND",
    );
  });

  it("does not disguise unexpected storage failures as conflicts", async () => {
    const failure = new Error("storage unavailable");
    repository.create.mockRejectedValue(failure);
    await expect(
      service.create("actor", "campaign-id", "Approach"),
    ).rejects.toBe(failure);
  });

  it("updates and removes only the strategy extension", async () => {
    await service.update("actor", "campaign-id", "  New approach  ");
    expect(repository.update).toHaveBeenCalledWith(
      "campaign-id",
      "New approach",
    );
    await service.remove("actor", "campaign-id");
    expect(repository.remove).toHaveBeenCalledWith("campaign-id");
  });
});
