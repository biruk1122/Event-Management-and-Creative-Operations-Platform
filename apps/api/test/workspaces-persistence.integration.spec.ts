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
  });
});
