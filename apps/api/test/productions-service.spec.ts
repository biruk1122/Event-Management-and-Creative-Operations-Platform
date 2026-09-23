import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductionRecord } from "../src/productions/infrastructure/productions.repository.js";
import { ProductionsService } from "../src/productions/productions.service.js";
import {
  workspaceNotFound,
  workspaceParticipantNotFound,
  workspaceTeamNotAssigned,
  workspaceTeamNotFound,
  workspaceUserNotFound,
} from "../src/workspaces/workspaces.errors.js";

const ACTOR = "actor-1";
const record = (
  overrides: Partial<ProductionRecord> = {},
): ProductionRecord => ({
  id: "production-1",
  workspaceId: "workspace-1",
  name: "Launch film",
  productionType: "Video",
  description: null,
  startAt: null,
  endAt: null,
  deadlineAt: null,
  status: "PLANNED",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  createdBy: null,
  manager: null,
  teams: [],
  participants: [],
  talents: [],
  ...overrides,
});

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(HttpException);
  await promise.catch((error: unknown) => {
    expect((error as HttpException).getResponse()).toMatchObject({ code });
  });
}

describe("ProductionsService", () => {
  const repository = {
    list: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    assignTalent: vi.fn(),
    unassignTalent: vi.fn(),
    delete: vi.fn(),
  };
  const workspaces = {
    setManager: vi.fn(),
    assignTeam: vi.fn(),
    unassignTeam: vi.fn(),
    addParticipant: vi.fn(),
    removeParticipant: vi.fn(),
  };
  const permissions = { hasGrant: vi.fn() };
  const service = new ProductionsService(
    repository as never,
    workspaces as never,
    permissions as never,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    repository.list.mockResolvedValue({ items: [], total: 0 });
    repository.findById.mockResolvedValue(record());
    repository.create.mockResolvedValue(record());
    repository.update.mockResolvedValue(record());
    repository.updateStatus.mockResolvedValue(record({ status: "ACTIVE" }));
    repository.assignTalent.mockResolvedValue("assigned");
    repository.unassignTalent.mockResolvedValue(true);
    repository.delete.mockResolvedValue("deleted");
    permissions.hasGrant.mockResolvedValue(true);
  });

  it.each([
    [
      "list",
      "project.read",
      () => service.list(ACTOR, { page: 1, pageSize: 25 }),
    ],
    [
      "create",
      "project.create",
      () => service.create(ACTOR, { name: "Film", productionType: "Video" }),
    ],
    [
      "update",
      "project.update",
      () => service.update(ACTOR, "production-1", {}),
    ],
    [
      "transition",
      "project.transition_status",
      () => service.transition(ACTOR, "production-1", "ACTIVE"),
    ],
    [
      "manager",
      "project.assign",
      () => service.setManager(ACTOR, "production-1", null),
    ],
    [
      "talent",
      "project.assign",
      () => service.assignTalent(ACTOR, "production-1", "talent-1", "Lead"),
    ],
    ["delete", "project.delete", () => service.remove(ACTOR, "production-1")],
  ])("%s requires %s at organization scope", async (_label, key, call) => {
    permissions.hasGrant.mockResolvedValue(false);
    await expectCode(call(), "PERMISSION_DENIED");
    expect(permissions.hasGrant).toHaveBeenCalledWith(
      ACTOR,
      key,
      "ORGANIZATION",
    );
  });

  it("rejects a reversed schedule before persistence", async () => {
    await expectCode(
      service.create(ACTOR, {
        name: "Film",
        productionType: "Video",
        startAt: "2026-02-02T00:00:00.000Z",
        endAt: "2026-02-01T00:00:00.000Z",
      }),
      "PRODUCTION_SCHEDULE_INVALID",
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it.each([
    ["PLANNED", "ACTIVE", true],
    ["PLANNED", "COMPLETED", false],
    ["ACTIVE", "COMPLETED", true],
    ["COMPLETED", "ACTIVE", false],
    ["CANCELLED", "PLANNED", false],
  ] as const)("transition %s to %s allowed=%s", async (from, to, allowed) => {
    repository.findById.mockResolvedValue(record({ status: from }));
    if (allowed) {
      await service.transition(ACTOR, "production-1", to);
      expect(repository.updateStatus).toHaveBeenCalledWith(
        "production-1",
        from,
        to,
      );
    } else {
      await expectCode(
        service.transition(ACTOR, "production-1", to),
        "PRODUCTION_TRANSITION_INVALID",
      );
      expect(repository.updateStatus).not.toHaveBeenCalled();
    }
  });

  it("reports a concurrent lifecycle change as a conflict", async () => {
    repository.updateStatus.mockResolvedValue("status_changed");
    await expectCode(
      service.transition(ACTOR, "production-1", "ACTIVE"),
      "PRODUCTION_TRANSITION_INVALID",
    );
  });

  it("delegates manager changes with the actor to the workspace application service", async () => {
    await service.setManager(ACTOR, "production-1", null);
    expect(workspaces.setManager).toHaveBeenCalledWith(
      ACTOR,
      "workspace-1",
      null,
    );
  });

  it.each([
    ["setManager", "setManager", workspaceUserNotFound, "USER_NOT_FOUND"],
    ["assignTeam", "assignTeam", workspaceTeamNotFound, "TEAM_NOT_FOUND"],
    [
      "unassignTeam",
      "unassignTeam",
      workspaceTeamNotAssigned,
      "PRODUCTION_TEAM_NOT_ASSIGNED",
    ],
    [
      "addParticipant",
      "addParticipant",
      workspaceUserNotFound,
      "USER_NOT_FOUND",
    ],
    [
      "removeParticipant",
      "removeParticipant",
      workspaceParticipantNotFound,
      "PRODUCTION_PARTICIPANT_NOT_ASSIGNED",
    ],
  ] as const)(
    "%s preserves the production API error code",
    async (method, mock, failure, code) => {
      workspaces[mock].mockRejectedValue(failure());
      const call =
        method === "setManager"
          ? service.setManager(ACTOR, "production-1", null)
          : service[method](ACTOR, "production-1", "member-1");
      await expectCode(call, code);
    },
  );

  it("maps a raced-away workspace to production not found", async () => {
    workspaces.assignTeam.mockRejectedValue(workspaceNotFound());
    await expectCode(
      service.assignTeam(ACTOR, "production-1", "team-1"),
      "PRODUCTION_NOT_FOUND",
    );
  });

  it("reports duplicate talent assignment as a conflict", async () => {
    repository.assignTalent.mockResolvedValue("already_assigned");
    await expectCode(
      service.assignTalent(ACTOR, "production-1", "talent-1", "Lead"),
      "PRODUCTION_TALENT_ALREADY_ASSIGNED",
    );
  });
});
