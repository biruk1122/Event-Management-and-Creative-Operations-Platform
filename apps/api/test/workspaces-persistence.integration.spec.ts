import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../src/generated/prisma/client.js";
import { WorkspacesRepository } from "../src/workspaces/infrastructure/workspaces.repository.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

const MISSING_UUID = "00000000-0000-0000-0000-000000000000";

describe("connected workspace ownership persistence", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let repository: WorkspacesRepository;

  let departmentId: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: db.url },
        { schema: db.schema },
      ),
    });
    repository = new WorkspacesRepository(prisma as never);

    const department = await prisma.department.create({
      data: { name: "Production" },
    });
    departmentId = department.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.drop();
  });

  let counter = 0;
  async function makeUser(): Promise<string> {
    counter += 1;
    const user = await prisma.user.create({
      data: { email: `person-${counter}@workspace.test` },
    });
    return user.id;
  }
  async function makeTeam(name = `Team ${(counter += 1)}`): Promise<string> {
    const team = await prisma.team.create({
      data: { name, departmentId },
    });
    return team.id;
  }

  describe("create and setManager", () => {
    it("creates a workspace with server defaults and an empty composition", async () => {
      const created = await repository.create({
        kind: "EVENT",
        managerId: null,
      });
      expect(created).not.toBe("manager_not_found");
      if (created === "manager_not_found") return;

      expect(created.id).toEqual(expect.any(String));
      expect(created.kind).toBe("EVENT");
      expect(created.manager).toBeNull();
      expect(created.teams).toEqual([]);
      expect(created.participants).toEqual([]);
      expect(created.createdAt).toBeInstanceOf(Date);
    });

    it("maps a missing manager FK to a sentinel on create and setManager", async () => {
      expect(
        await repository.create({ kind: "EVENT", managerId: MISSING_UUID }),
      ).toBe("manager_not_found");

      const created = await repository.create({
        kind: "PROJECT",
        managerId: null,
      });
      if (created === "manager_not_found") throw new Error("unexpected");
      expect(await repository.setManager(created.id, MISSING_UUID)).toBe(
        "manager_not_found",
      );
      expect(await repository.setManager(MISSING_UUID, null)).toBe("not_found");
    });

    it("clears the manager at the database when the manager user is deleted", async () => {
      const managerId = await makeUser();
      const created = await repository.create({
        kind: "CAMPAIGN",
        managerId,
      });
      if (created === "manager_not_found") throw new Error("unexpected");

      await prisma.user.delete({ where: { id: managerId } });

      const reloaded = await repository.findById(created.id);
      expect(reloaded?.manager).toBeNull();
    });
  });

  describe("team assignment", () => {
    let workspaceId: string;

    beforeEach(async () => {
      const created = await repository.create({
        kind: "EVENT",
        managerId: null,
      });
      if (created === "manager_not_found") throw new Error("unexpected");
      workspaceId = created.id;
    });

    it("is idempotent and returns the refreshed record with one row", async () => {
      const teamId = await makeTeam();
      await repository.assignTeam(workspaceId, teamId);
      const second = await repository.assignTeam(workspaceId, teamId);

      expect(second).not.toBe("team_not_found");
      if (typeof second === "string") throw new Error(second);
      expect(second.teams).toHaveLength(1);
      expect(await prisma.workspaceTeam.count({ where: { workspaceId } })).toBe(
        1,
      );
    });

    it("distinguishes a missing workspace from a missing team", async () => {
      expect(await repository.assignTeam(MISSING_UUID, await makeTeam())).toBe(
        "workspace_not_found",
      );
      expect(await repository.assignTeam(workspaceId, MISSING_UUID)).toBe(
        "team_not_found",
      );
    });

    it("reports not_assigned when unassigning a team that is not assigned", async () => {
      expect(await repository.unassignTeam(workspaceId, await makeTeam())).toBe(
        "not_assigned",
      );
    });

    it("orders assigned teams by name", async () => {
      const zebra = await makeTeam("Zebra");
      const alpha = await makeTeam("Alpha");
      await repository.assignTeam(workspaceId, zebra);
      const result = await repository.assignTeam(workspaceId, alpha);
      if (typeof result === "string") throw new Error(result);
      expect(result.teams.map((t) => t.name)).toEqual(["Alpha", "Zebra"]);
    });
  });

  describe("participants", () => {
    let workspaceId: string;

    beforeEach(async () => {
      const created = await repository.create({
        kind: "PROJECT",
        managerId: null,
      });
      if (created === "manager_not_found") throw new Error("unexpected");
      workspaceId = created.id;
    });

    it("is idempotent and returns one row", async () => {
      const userId = await makeUser();
      await repository.addParticipant(workspaceId, userId);
      const second = await repository.addParticipant(workspaceId, userId);
      if (typeof second === "string") throw new Error(second);
      expect(second.participants).toHaveLength(1);
      expect(
        await prisma.workspaceParticipant.count({ where: { workspaceId } }),
      ).toBe(1);
    });

    it("distinguishes a missing workspace from a missing user", async () => {
      expect(
        await repository.addParticipant(MISSING_UUID, await makeUser()),
      ).toBe("workspace_not_found");
      expect(await repository.addParticipant(workspaceId, MISSING_UUID)).toBe(
        "user_not_found",
      );
    });

    it("reports not_a_participant when removing someone who is not one", async () => {
      expect(
        await repository.removeParticipant(workspaceId, await makeUser()),
      ).toBe("not_a_participant");
    });
  });

  describe("delete", () => {
    it("removes the root and cascades its join rows, sparing the referenced records", async () => {
      const created = await repository.create({
        kind: "EVENT",
        managerId: null,
      });
      if (created === "manager_not_found") throw new Error("unexpected");
      const teamId = await makeTeam();
      const userId = await makeUser();
      await repository.assignTeam(created.id, teamId);
      await repository.addParticipant(created.id, userId);

      expect(await repository.delete(created.id)).toBe("deleted");
      expect(await repository.delete(created.id)).toBe("not_found");

      expect(await prisma.workspaceTeam.count({ where: { teamId } })).toBe(0);
      expect(
        await prisma.workspaceParticipant.count({ where: { userId } }),
      ).toBe(0);
      expect(
        await prisma.team.findUnique({ where: { id: teamId } }),
      ).not.toBeNull();
      expect(
        await prisma.user.findUnique({ where: { id: userId } }),
      ).not.toBeNull();
    });

    it("refuses to delete a workspace still owned by an event, reporting 'in_use' instead of throwing", async () => {
      const created = await repository.create({
        kind: "EVENT",
        managerId: null,
      });
      if (created === "manager_not_found") throw new Error("unexpected");
      await prisma.event.create({
        data: {
          workspaceId: created.id,
          name: "Owning Event",
          eventType: "OTHER",
        },
      });

      expect(await repository.delete(created.id)).toBe("in_use");

      expect(
        await prisma.workspace.findUnique({ where: { id: created.id } }),
      ).not.toBeNull();
    });

    it("refuses to delete a workspace still owned by a project", async () => {
      const created = await repository.create({
        kind: "PROJECT",
        managerId: null,
      });
      if (created === "manager_not_found") throw new Error("unexpected");
      await prisma.project.create({
        data: { workspaceId: created.id, name: "Owning Project" },
      });

      expect(await repository.delete(created.id)).toBe("in_use");

      expect(
        await prisma.workspace.findUnique({ where: { id: created.id } }),
      ).not.toBeNull();
    });

    it("refuses to delete a workspace still owned by a campaign", async () => {
      const created = await repository.create({
        kind: "CAMPAIGN",
        managerId: null,
      });
      if (created === "manager_not_found") throw new Error("unexpected");
      await prisma.campaign.create({
        data: {
          workspaceId: created.id,
          name: "Owning Campaign",
          campaignType: "MARKETING",
        },
      });

      expect(await repository.delete(created.id)).toBe("in_use");

      expect(
        await prisma.workspace.findUnique({ where: { id: created.id } }),
      ).not.toBeNull();
    });
  });

  describe("list", () => {
    it("filters by kind and managerId and paginates", async () => {
      const managerId = await makeUser();
      await repository.create({ kind: "CAMPAIGN", managerId });
      await repository.create({ kind: "CAMPAIGN", managerId: null });
      await repository.create({ kind: "EVENT", managerId });

      const byKind = await repository.list({
        kind: "CAMPAIGN",
        page: 1,
        pageSize: 50,
      });
      expect(byKind.items.every((w) => w.kind === "CAMPAIGN")).toBe(true);
      expect(byKind.total).toBeGreaterThanOrEqual(2);

      const byManager = await repository.list({
        kind: "CAMPAIGN",
        managerId,
        page: 1,
        pageSize: 50,
      });
      expect(byManager.total).toBe(1);
      expect(byManager.items[0]?.manager?.id).toBe(managerId);

      const firstPage = await repository.list({
        kind: "CAMPAIGN",
        page: 1,
        pageSize: 1,
      });
      expect(firstPage.items).toHaveLength(1);
      expect(firstPage.total).toBe(byKind.total);
    });

    it("pages deterministically through equal-timestamp rows with no gaps or repeats", async () => {
      const created = await Promise.all(
        Array.from({ length: 7 }, () =>
          repository.create({ kind: "PRODUCTION", managerId: null }),
        ),
      );
      const ids = new Set(
        created.map((w) => {
          if (typeof w === "string") throw new Error(w);
          return w.id;
        }),
      );

      const seen: string[] = [];
      for (let page = 1; page <= 7; page += 1) {
        const result = await repository.list({
          kind: "PRODUCTION",
          page,
          pageSize: 1,
        });
        expect(result.items).toHaveLength(1);
        seen.push(result.items[0]!.id);
      }

      expect(new Set(seen).size).toBe(7);
      for (const id of ids) expect(seen).toContain(id);

      const beyond = await repository.list({
        kind: "PRODUCTION",
        page: 8,
        pageSize: 1,
      });
      expect(beyond.items).toEqual([]);
      expect(beyond.total).toBe(7);
    });
  });

  describe("a malformed id never reaches the uuid column", () => {
    it("returns not-found sentinels instead of a driver error", async () => {
      expect(await repository.findById("not-a-uuid")).toBeNull();
      expect(await repository.userExists("not-a-uuid")).toBe(false);

      const created = await repository.create({
        kind: "EVENT",
        managerId: null,
      });
      if (typeof created === "string") throw new Error(created);

      expect(await repository.assignTeam(created.id, "not-a-uuid")).toBe(
        "team_not_found",
      );
      expect(await repository.unassignTeam(created.id, "not-a-uuid")).toBe(
        "not_assigned",
      );
      expect(await repository.addParticipant(created.id, "not-a-uuid")).toBe(
        "user_not_found",
      );
      expect(await repository.removeParticipant(created.id, "not-a-uuid")).toBe(
        "not_a_participant",
      );
    });
  });

  describe("kind persists for every value", () => {
    it.each(["EVENT", "PROJECT", "PRODUCTION", "CAMPAIGN"] as const)(
      "round-trips %s through create and findById",
      async (kind) => {
        const created = await repository.create({ kind, managerId: null });
        if (typeof created === "string") throw new Error(created);
        expect(created.kind).toBe(kind);
        const reloaded = await repository.findById(created.id);
        expect(reloaded?.kind).toBe(kind);
      },
    );
  });

  describe("database constraints", () => {
    let workspaceId: string;

    beforeEach(async () => {
      const created = await repository.create({
        kind: "EVENT",
        managerId: null,
      });
      if (typeof created === "string") throw new Error(created);
      workspaceId = created.id;
    });

    it("rejects a duplicate (workspace, team) row at the database", async () => {
      const teamId = await makeTeam();
      await prisma.workspaceTeam.create({ data: { workspaceId, teamId } });
      await expect(
        prisma.workspaceTeam.create({ data: { workspaceId, teamId } }),
      ).rejects.toMatchObject({ code: "P2002" });
    });

    it("rejects a duplicate (workspace, user) participant row at the database", async () => {
      const userId = await makeUser();
      await prisma.workspaceParticipant.create({
        data: { workspaceId, userId },
      });
      await expect(
        prisma.workspaceParticipant.create({
          data: { workspaceId, userId },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
    });

    it("cascades a team deletion, clearing its workspace assignments only", async () => {
      const teamId = await makeTeam();
      const otherTeamId = await makeTeam();
      const second = await repository.create({
        kind: "EVENT",
        managerId: null,
      });
      if (typeof second === "string") throw new Error(second);
      await repository.assignTeam(workspaceId, teamId);
      await repository.assignTeam(second.id, teamId);
      await repository.assignTeam(workspaceId, otherTeamId);

      await prisma.team.delete({ where: { id: teamId } });

      expect(await prisma.workspaceTeam.count({ where: { teamId } })).toBe(0);
      const reloaded = await repository.findById(workspaceId);
      expect(reloaded?.teams.map((t) => t.id)).toEqual([otherTeamId]);
      expect(await repository.findById(second.id)).not.toBeNull();
    });

    it("cascades a user deletion, clearing their participant rows only", async () => {
      const userId = await makeUser();
      const second = await repository.create({
        kind: "PROJECT",
        managerId: null,
      });
      if (typeof second === "string") throw new Error(second);
      await repository.addParticipant(workspaceId, userId);
      await repository.addParticipant(second.id, userId);

      await prisma.user.delete({ where: { id: userId } });

      expect(
        await prisma.workspaceParticipant.count({ where: { userId } }),
      ).toBe(0);
      expect((await repository.findById(workspaceId))?.participants).toEqual(
        [],
      );
      expect(await repository.findById(second.id)).not.toBeNull();
    });
  });

  describe("concurrent writes converge without error", () => {
    let workspaceId: string;

    beforeEach(async () => {
      const created = await repository.create({
        kind: "CAMPAIGN",
        managerId: null,
      });
      if (typeof created === "string") throw new Error(created);
      workspaceId = created.id;
    });

    it("two simultaneous assignments of the same team leave exactly one row", async () => {
      const teamId = await makeTeam();
      const results = await Promise.all([
        repository.assignTeam(workspaceId, teamId),
        repository.assignTeam(workspaceId, teamId),
      ]);
      for (const result of results) {
        expect(typeof result).not.toBe("string");
      }
      expect(
        await prisma.workspaceTeam.count({ where: { workspaceId, teamId } }),
      ).toBe(1);
    });

    it("two simultaneous unassignments converge to zero rows, one reports not_assigned", async () => {
      const teamId = await makeTeam();
      await repository.assignTeam(workspaceId, teamId);

      const results = await Promise.all([
        repository.unassignTeam(workspaceId, teamId),
        repository.unassignTeam(workspaceId, teamId),
      ]);

      const sentinels = results.filter((r) => typeof r === "string");
      expect(sentinels.every((s) => s === "not_assigned")).toBe(true);
      expect(sentinels.length).toBeLessThanOrEqual(1);
      expect(
        await prisma.workspaceTeam.count({ where: { workspaceId, teamId } }),
      ).toBe(0);
    });

    it("two simultaneous participant adds leave exactly one row", async () => {
      const userId = await makeUser();
      const results = await Promise.all([
        repository.addParticipant(workspaceId, userId),
        repository.addParticipant(workspaceId, userId),
      ]);
      for (const result of results) {
        expect(typeof result).not.toBe("string");
      }
      expect(
        await prisma.workspaceParticipant.count({
          where: { workspaceId, userId },
        }),
      ).toBe(1);
    });
  });

  describe("setManager round trip", () => {
    it("assigns then clears the manager and advances updated_at", async () => {
      const created = await repository.create({
        kind: "EVENT",
        managerId: null,
      });
      if (typeof created === "string") throw new Error(created);
      const before = await prisma.workspace.findUniqueOrThrow({
        where: { id: created.id },
        select: { updatedAt: true },
      });

      const managerId = await makeUser();
      await new Promise((resolve) => setTimeout(resolve, 5));
      const assigned = await repository.setManager(created.id, managerId);
      if (typeof assigned === "string") throw new Error(assigned);
      expect(assigned.manager?.id).toBe(managerId);

      const after = await prisma.workspace.findUniqueOrThrow({
        where: { id: created.id },
        select: { updatedAt: true },
      });
      expect(after.updatedAt.getTime()).toBeGreaterThan(
        before.updatedAt.getTime(),
      );

      const cleared = await repository.setManager(created.id, null);
      if (typeof cleared === "string") throw new Error(cleared);
      expect(cleared.manager).toBeNull();
    });
  });
});
