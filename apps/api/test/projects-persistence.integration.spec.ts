import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  PrismaClient,
  type ProjectStatus,
} from "../src/generated/prisma/client.js";
import {
  ProjectsRepository,
  type CreateProjectInput,
  type ProjectRecord,
} from "../src/projects/infrastructure/projects.repository.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

const MISSING_UUID = "00000000-0000-0000-0000-000000000000";

const EVERY_STATUS: ProjectStatus[] = [
  "PLANNED",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
];

/**
 * PRJ-03 - verifies `ProjectsRepository` policy and persistence against a real
 * isolated PostgreSQL 18 schema: the two-write create/delete transactions and
 * their rollback, the field-merge semantics of a patch, the database CHECK
 * constraints that back the service validation, the optional event
 * cross-reference (a soft peer, not ownership), the managed-files-aware
 * delete conflict (FIL-02), deterministic pagination, and the filter matrix.
 * Every test provisions its own rows in an isolated schema, so the suite is
 * order-independent.
 */
describe("general project management persistence", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let repository: ProjectsRepository;

  let actorId: string;
  let departmentId: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: db.url },
        { schema: db.schema },
      ),
    });
    repository = new ProjectsRepository(prisma as never);

    actorId = (
      await prisma.user.create({
        data: {
          email: "author@projects.test",
          firstName: "Ada",
          lastName: "Author",
        },
      })
    ).id;
    departmentId = (
      await prisma.department.create({ data: { name: "Production" } })
    ).id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.drop();
  });

  let counter = 0;
  async function makeUser(
    firstName: string | null = "Mem",
    lastName: string | null = "Ber",
  ): Promise<string> {
    counter += 1;
    const user = await prisma.user.create({
      data: { email: `person-${counter}@projects.test`, firstName, lastName },
    });
    return user.id;
  }
  async function makeTeam(name = `Team ${(counter += 1)}`): Promise<string> {
    const team = await prisma.team.create({ data: { name, departmentId } });
    return team.id;
  }
  async function makeEvent(name = `Event ${(counter += 1)}`): Promise<string> {
    const workspace = await prisma.workspace.create({
      data: { kind: "EVENT" },
    });
    const event = await prisma.event.create({
      data: {
        workspaceId: workspace.id,
        name,
        eventType: "CONCERT",
      },
    });
    return event.id;
  }
  async function create(
    overrides: Partial<CreateProjectInput> = {},
  ): Promise<ProjectRecord> {
    counter += 1;
    const result = await repository.create({
      name: `Project ${counter}`,
      createdById: actorId,
      ...overrides,
    });
    if (typeof result === "string") {
      throw new Error(`unexpected create outcome: ${result}`);
    }
    return result;
  }

  describe("create pairs a project with its connected workspace atomically", () => {
    it("writes both rows with server defaults and links them", async () => {
      const project = await create();

      const workspace = await prisma.workspace.findUniqueOrThrow({
        where: { id: project.workspaceId },
      });
      expect(workspace.kind).toBe("PROJECT");
      expect(workspace.managerId).toBeNull();

      expect(project.status).toBe("PLANNED");
      expect(project.description).toBeNull();
      expect(project.startAt).toBeNull();
      expect(project.endAt).toBeNull();
      expect(project.eventId).toBeNull();
      expect(project.createdBy).toMatchObject({ id: actorId });
      expect(project.createdAt).toBeInstanceOf(Date);
      expect(project.teams).toEqual([]);
      expect(project.participants).toEqual([]);
    });

    it("applies an optional manager to the workspace, not the project row", async () => {
      const managerId = await makeUser("Manny", "Ager");
      const project = await create({ managerId });

      expect(project.manager).toMatchObject({ id: managerId });
      const workspace = await prisma.workspace.findUniqueOrThrow({
        where: { id: project.workspaceId },
      });
      expect(workspace.managerId).toBe(managerId);
    });

    it("rolls back the workspace when the manager id has no user", async () => {
      const projects = await prisma.project.count();
      const workspaces = await prisma.workspace.count();

      expect(
        await repository.create({
          name: "Ghost Manager",
          createdById: actorId,
          managerId: MISSING_UUID,
        }),
      ).toBe("manager_not_found");

      expect(await prisma.project.count()).toBe(projects);
      expect(await prisma.workspace.count()).toBe(workspaces);
    });

    it("reports an unknown related event before opening the transaction", async () => {
      const projects = await prisma.project.count();
      const workspaces = await prisma.workspace.count();

      expect(
        await repository.create({
          name: "Ghost Event",
          createdById: actorId,
          eventId: MISSING_UUID,
        }),
      ).toBe("event_not_found");

      expect(await prisma.project.count()).toBe(projects);
      expect(await prisma.workspace.count()).toBe(workspaces);
    });

    it("links to a real event", async () => {
      const eventId = await makeEvent();
      const project = await create({ eventId });
      expect(project.eventId).toBe(eventId);
    });

    it("rolls back the workspace when a database CHECK rejects the project", async () => {
      const workspaces = await prisma.workspace.count();

      await expect(
        repository.create({ name: "   ", createdById: actorId }),
      ).rejects.toThrow();

      expect(await prisma.workspace.count()).toBe(workspaces);
    });
  });

  describe("findById", () => {
    it("returns null for an unknown id and for a non-uuid string", async () => {
      expect(await repository.findById(MISSING_UUID)).toBeNull();
      expect(await repository.findById("not-a-uuid")).toBeNull();
    });

    it("reflects the connected workspace composition, sorted", async () => {
      const project = await create();
      const zebra = await makeTeam("Zebra Crew");
      const alpha = await makeTeam("Alpha Crew");
      const younger = await makeUser("Bea", "Young");
      const older = await makeUser("Cal", "Old");

      await prisma.workspaceTeam.createMany({
        data: [
          { workspaceId: project.workspaceId, teamId: zebra },
          { workspaceId: project.workspaceId, teamId: alpha },
        ],
      });
      await prisma.workspaceParticipant.createMany({
        data: [
          { workspaceId: project.workspaceId, userId: younger },
          { workspaceId: project.workspaceId, userId: older },
        ],
      });

      const reloaded = await repository.findById(project.id);
      expect(reloaded?.teams.map((t) => t.name)).toEqual([
        "Alpha Crew",
        "Zebra Crew",
      ]);
      expect(reloaded?.participants.map((p) => p.lastName)).toEqual([
        "Old",
        "Young",
      ]);
    });

    it("clears createdBy when the author is deleted, keeping the project", async () => {
      const author = await makeUser("Tem", "Porary");
      const project = await create({ createdById: author });

      await prisma.user.delete({ where: { id: author } });

      const reloaded = await repository.findById(project.id);
      expect(reloaded).not.toBeNull();
      expect(reloaded?.createdBy).toBeNull();
    });

    it("clears the event link, sparing the project, when the event is deleted", async () => {
      const eventId = await makeEvent();
      const project = await create({ eventId });

      const event = await prisma.event.findUniqueOrThrow({
        where: { id: eventId },
      });
      await prisma.event.delete({ where: { id: eventId } });
      await prisma.workspace.delete({ where: { id: event.workspaceId } });

      const reloaded = await repository.findById(project.id);
      expect(reloaded).not.toBeNull();
      expect(reloaded?.eventId).toBeNull();
    });
  });

  describe("update merges only the fields it is given", () => {
    it("leaves omitted columns untouched and clears a nullable one on null", async () => {
      const project = await create({ description: "First" });

      const patched = await repository.update(project.id, {
        name: "Renamed",
        description: null,
      });
      if (typeof patched === "string") throw new Error(patched);

      expect(patched.name).toBe("Renamed");
      expect(patched.description).toBeNull();
    });

    it("advances updated_at", async () => {
      const project = await create();
      const before = project.updatedAt.getTime();
      await new Promise((resolve) => setTimeout(resolve, 5));

      const patched = await repository.update(project.id, { name: "Later" });
      if (typeof patched === "string") throw new Error(patched);
      expect(patched.updatedAt.getTime()).toBeGreaterThan(before);
    });

    it("connects and disconnects the related event", async () => {
      const eventId = await makeEvent();
      const project = await create();

      const linked = await repository.update(project.id, { eventId });
      if (typeof linked === "string") throw new Error(linked);
      expect(linked.eventId).toBe(eventId);

      const unlinked = await repository.update(project.id, { eventId: null });
      if (typeof unlinked === "string") throw new Error(unlinked);
      expect(unlinked.eventId).toBeNull();
    });

    it("reports an unknown related event and leaves the project untouched", async () => {
      const project = await create();
      expect(
        await repository.update(project.id, { eventId: MISSING_UUID }),
      ).toBe("event_not_found");
      expect((await repository.findById(project.id))?.eventId).toBeNull();
    });

    it("returns not_found for an unknown id and a non-uuid string", async () => {
      expect(await repository.update(MISSING_UUID, { name: "x" })).toBe(
        "not_found",
      );
      expect(await repository.update("not-a-uuid", { name: "x" })).toBe(
        "not_found",
      );
    });

    it("is backed by the schedule CHECK when given an out-of-order pair", async () => {
      const project = await create({
        startAt: new Date("2026-05-10T00:00:00.000Z"),
      });

      await expect(
        repository.update(project.id, {
          endAt: new Date("2026-05-01T00:00:00.000Z"),
        }),
      ).rejects.toThrow();

      expect((await repository.findById(project.id))?.endAt).toBeNull();
    });

    it("is backed by the not-blank name CHECK", async () => {
      const project = await create();
      await expect(
        repository.update(project.id, { name: "   " }),
      ).rejects.toThrow();
      expect((await repository.findById(project.id))?.name).toBe(project.name);
    });
  });

  describe("updateStatus", () => {
    it("persists each lifecycle state", async () => {
      for (const status of EVERY_STATUS) {
        const project = await create();
        const updated = await repository.updateStatus(
          project.id,
          "PLANNED",
          status,
        );
        if (typeof updated === "string") throw new Error(updated);
        expect(updated.status).toBe(status);
        expect((await repository.findById(project.id))?.status).toBe(status);
      }
    });

    it("returns not_found for an unknown id and a non-uuid string", async () => {
      expect(
        await repository.updateStatus(MISSING_UUID, "PLANNED", "ACTIVE"),
      ).toBe("not_found");
      expect(
        await repository.updateStatus("not-a-uuid", "PLANNED", "ACTIVE"),
      ).toBe("not_found");
    });
  });

  describe("status changes are compare-and-swap", () => {
    it("refuses a stale expected status and leaves the project as it is", async () => {
      const project = await create();
      await repository.updateStatus(project.id, "PLANNED", "CANCELLED");

      const result = await repository.updateStatus(
        project.id,
        "PLANNED",
        "ACTIVE",
      );

      expect(result).toBe("status_changed");
      expect((await repository.findById(project.id))?.status).toBe("CANCELLED");
    });

    it("applies only when the expected status still matches", async () => {
      const project = await create();
      await repository.updateStatus(project.id, "PLANNED", "ACTIVE");

      expect(
        await repository.updateStatus(project.id, "ACTIVE", "COMPLETED"),
      ).toMatchObject({ status: "COMPLETED" });
    });

    it("lets exactly one of two racing transitions win", async () => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const project = await create();

        const results = await Promise.all([
          repository.updateStatus(project.id, "PLANNED", "CANCELLED"),
          repository.updateStatus(project.id, "PLANNED", "ACTIVE"),
        ]);

        const winners = results.filter((result) => typeof result !== "string");
        expect(winners).toHaveLength(1);
        expect(
          results.filter((result) => result === "status_changed"),
        ).toHaveLength(1);
        // The stored status is the winner's target, never overwritten.
        const winner = winners[0] as ProjectRecord;
        expect((await repository.findById(project.id))?.status).toBe(
          winner.status,
        );
      }
    });
  });

  describe("delete removes the project and its workspace together", () => {
    it("deletes both rows and is idempotent on a second call", async () => {
      const project = await create();

      expect(await repository.delete(project.id)).toBe("deleted");
      expect(await repository.delete(project.id)).toBe("not_found");

      expect(
        await prisma.project.findUnique({ where: { id: project.id } }),
      ).toBeNull();
      expect(
        await prisma.workspace.findUnique({
          where: { id: project.workspaceId },
        }),
      ).toBeNull();
    });

    it("spares the referenced event, team, and users, dropping only the join rows", async () => {
      const eventId = await makeEvent();
      const project = await create({ eventId });
      const teamId = await makeTeam();
      const userId = await makeUser();
      await prisma.workspaceTeam.create({
        data: { workspaceId: project.workspaceId, teamId },
      });
      await prisma.workspaceParticipant.create({
        data: { workspaceId: project.workspaceId, userId },
      });

      expect(await repository.delete(project.id)).toBe("deleted");

      expect(await prisma.workspaceTeam.count({ where: { teamId } })).toBe(0);
      expect(
        await prisma.workspaceParticipant.count({ where: { userId } }),
      ).toBe(0);
      expect(
        await prisma.event.findUnique({ where: { id: eventId } }),
      ).not.toBeNull();
      expect(
        await prisma.team.findUnique({ where: { id: teamId } }),
      ).not.toBeNull();
      expect(
        await prisma.user.findUnique({ where: { id: userId } }),
      ).not.toBeNull();
    });

    it("returns not_found for a non-uuid string", async () => {
      expect(await repository.delete("not-a-uuid")).toBe("not_found");
    });

    it("cannot be short-circuited: the RESTRICT FK blocks deleting the workspace first", async () => {
      const project = await create();
      await expect(
        prisma.workspace.delete({ where: { id: project.workspaceId } }),
      ).rejects.toThrow();
      expect(
        await prisma.project.findUnique({ where: { id: project.id } }),
      ).not.toBeNull();
    });

    it("clears an UNAVAILABLE managed file's intent link, then deletes cleanly", async () => {
      const project = await create();
      await prisma.managedFile.create({
        data: {
          storageKey: `unavailable-${project.id}`,
          originalFilename: "rejected.pdf",
          declaredMediaType: "application/pdf",
          declaredSizeBytes: 1024,
          state: "UNAVAILABLE",
          intentExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
          unavailableAt: new Date("2026-06-01T00:00:00.000Z"),
          cleanupAfter: new Date("2026-06-08T00:00:00.000Z"),
          intentWorkspaceId: project.workspaceId,
        },
      });

      expect(await repository.delete(project.id)).toBe("deleted");
      expect(
        await prisma.workspace.findUnique({
          where: { id: project.workspaceId },
        }),
      ).toBeNull();
    });

    it("reports has_managed_files and deletes nothing when a file is attached", async () => {
      const project = await create();
      // The AVAILABLE-requires-attachment rule is a deferred constraint
      // trigger (checked at commit, not per statement), so both inserts must
      // land in the same transaction or the managed file's own insert commits
      // and fails the check before the attachment exists.
      await prisma.$transaction(async (tx) => {
        const managedFile = await tx.managedFile.create({
          data: {
            storageKey: `attached-${project.id}`,
            originalFilename: "brief.pdf",
            declaredMediaType: "application/pdf",
            declaredSizeBytes: 2048,
            state: "AVAILABLE",
            intentExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
            uploadedAt: new Date("2026-06-01T00:00:00.000Z"),
            availableAt: new Date("2026-06-01T00:00:01.000Z"),
            verifiedMediaType: "application/pdf",
            verifiedSizeBytes: 2048,
          },
        });
        await tx.workspaceFileAttachment.create({
          data: {
            workspaceId: project.workspaceId,
            managedFileId: managedFile.id,
          },
        });
      });

      expect(await repository.delete(project.id)).toBe("has_managed_files");

      expect(
        await prisma.project.findUnique({ where: { id: project.id } }),
      ).not.toBeNull();
      expect(
        await prisma.workspace.findUnique({
          where: { id: project.workspaceId },
        }),
      ).not.toBeNull();
    });
  });

  describe("list filters", () => {
    it("narrows by status, event, manager, name, and a start-time window", async () => {
      const managerId = await makeUser("Fil", "Ter");
      const eventId = await makeEvent();
      const tagged = await create({
        name: "Quarterly Filter Marker Rollout",
        managerId,
        eventId,
        startAt: new Date("2028-06-15T00:00:00.000Z"),
      });
      await repository.updateStatus(tagged.id, "PLANNED", "ACTIVE");
      await create({ name: "Unrelated" });

      const byEvent = await repository.list({
        eventId,
        page: 1,
        pageSize: 100,
      });
      expect(byEvent.items.map((p) => p.id)).toEqual([tagged.id]);

      const byStatus = await repository.list({
        status: "ACTIVE",
        eventId,
        page: 1,
        pageSize: 100,
      });
      expect(byStatus.items.map((p) => p.id)).toContain(tagged.id);
      expect(byStatus.items.every((p) => p.status === "ACTIVE")).toBe(true);

      const byManager = await repository.list({
        managerId,
        page: 1,
        pageSize: 100,
      });
      expect(byManager.items.map((p) => p.id)).toEqual([tagged.id]);

      const bySearch = await repository.list({
        search: "filter marker",
        page: 1,
        pageSize: 100,
      });
      expect(bySearch.items.map((p) => p.id)).toEqual([tagged.id]);

      const inWindow = await repository.list({
        startingAfter: new Date("2028-01-01T00:00:00.000Z"),
        startingBefore: new Date("2028-12-31T00:00:00.000Z"),
        page: 1,
        pageSize: 100,
      });
      expect(inWindow.items.map((p) => p.id)).toEqual([tagged.id]);

      const outOfWindow = await repository.list({
        startingAfter: new Date("2029-01-01T00:00:00.000Z"),
        page: 1,
        pageSize: 100,
      });
      expect(outOfWindow.items.map((p) => p.id)).not.toContain(tagged.id);
    });

    it("matches the name case-insensitively", async () => {
      const project = await create({ name: "MiXeD CaSe Marker" });
      const found = await repository.list({
        search: "mixed case marker",
        page: 1,
        pageSize: 100,
      });
      expect(found.items.map((p) => p.id)).toContain(project.id);
    });
  });

  describe("list pagination is deterministic", () => {
    it("walks equal-timestamp rows once each, with a stable total and an empty tail", async () => {
      // A marker unique to this test isolates its rows from every other
      // project the suite creates, so `total` is exactly 7.
      const marker = `Pagewalk ${(counter += 1)}`;
      const created = await Promise.all(
        Array.from({ length: 7 }, (_, index) =>
          create({ name: `${marker} ${index}` }),
        ),
      );
      const ids = new Set(created.map((p) => p.id));

      const seen: string[] = [];
      let total = -1;
      for (let page = 1; page <= 7; page += 1) {
        const result = await repository.list({
          search: marker,
          page,
          pageSize: 1,
        });
        expect(result.items).toHaveLength(1);
        seen.push(result.items[0]!.id);
        total = total === -1 ? result.total : total;
        expect(result.total).toBe(total);
      }

      expect(total).toBe(7);
      expect(new Set(seen).size).toBe(7);
      for (const id of ids) expect(seen).toContain(id);

      const beyond = await repository.list({
        search: marker,
        page: 8,
        pageSize: 1,
      });
      expect(beyond.items).toEqual([]);
      expect(beyond.total).toBe(total);
    });

    it("orders by created_at then id", async () => {
      const page = await repository.list({ page: 1, pageSize: 200 });
      const keys = page.items.map(
        (p) => `${p.createdAt.toISOString()}#${p.id}`,
      );
      expect(keys).toEqual([...keys].sort());
    });
  });
});
