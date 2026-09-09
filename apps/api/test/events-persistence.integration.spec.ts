import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  PrismaClient,
  type EventStatus,
  type EventType,
} from "../src/generated/prisma/client.js";
import {
  EventsRepository,
  type CreateEventInput,
  type EventRecord,
} from "../src/events/infrastructure/events.repository.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

const MISSING_UUID = "00000000-0000-0000-0000-000000000000";

const EVERY_TYPE: EventType[] = [
  "FILM_PREMIERE",
  "CONCERT",
  "ALBUM_RELEASE",
  "PRODUCT_LAUNCH",
  "CORPORATE_EVENT",
  "PROMOTIONAL_EVENT",
  "OTHER",
];
const EVERY_STATUS: EventStatus[] = [
  "PLANNING",
  "READY",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

/**
 * EVT-03 - verifies `EventsRepository` policy and persistence against a real
 * isolated PostgreSQL 18 schema: the two-write create/delete transactions and
 * their rollback, the field-merge semantics of a patch, the money round-trip,
 * the database CHECK constraints that back the service validation, deterministic
 * pagination, and the filter matrix. Every test provisions its own rows in an
 * isolated schema, so the suite is order-independent.
 */
describe("event management persistence", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let repository: EventsRepository;

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
    repository = new EventsRepository(prisma as never);

    actorId = (
      await prisma.user.create({
        data: {
          email: "author@events.test",
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
      data: { email: `person-${counter}@events.test`, firstName, lastName },
    });
    return user.id;
  }
  async function makeTeam(name = `Team ${(counter += 1)}`): Promise<string> {
    const team = await prisma.team.create({ data: { name, departmentId } });
    return team.id;
  }
  async function create(
    overrides: Partial<CreateEventInput> = {},
  ): Promise<EventRecord> {
    counter += 1;
    const result = await repository.create({
      name: `Event ${counter}`,
      eventType: "CONCERT",
      createdById: actorId,
      ...overrides,
    });
    if (typeof result === "string") {
      throw new Error(`unexpected create outcome: ${result}`);
    }
    return result;
  }

  describe("create pairs an event with its connected workspace atomically", () => {
    it("writes both rows with server defaults and links them", async () => {
      const event = await create();

      const workspace = await prisma.workspace.findUniqueOrThrow({
        where: { id: event.workspaceId },
      });
      expect(workspace.kind).toBe("EVENT");
      expect(workspace.managerId).toBeNull();

      expect(event.status).toBe("PLANNING");
      expect(event.description).toBeNull();
      expect(event.startAt).toBeNull();
      expect(event.endAt).toBeNull();
      expect(event.budgetAmount).toBeNull();
      expect(event.budgetCurrency).toBeNull();
      expect(event.createdBy).toMatchObject({ id: actorId });
      expect(event.createdAt).toBeInstanceOf(Date);
      expect(event.teams).toEqual([]);
      expect(event.participants).toEqual([]);
    });

    it("applies an optional manager to the workspace, not the event row", async () => {
      const managerId = await makeUser("Manny", "Ager");
      const event = await create({ managerId });

      expect(event.manager).toMatchObject({ id: managerId });
      const workspace = await prisma.workspace.findUniqueOrThrow({
        where: { id: event.workspaceId },
      });
      expect(workspace.managerId).toBe(managerId);
    });

    it("rolls back the workspace when the manager id has no user", async () => {
      const events = await prisma.event.count();
      const workspaces = await prisma.workspace.count();

      expect(
        await repository.create({
          name: "Ghost Manager",
          eventType: "CONCERT",
          createdById: actorId,
          managerId: MISSING_UUID,
        }),
      ).toBe("manager_not_found");

      expect(await prisma.event.count()).toBe(events);
      expect(await prisma.workspace.count()).toBe(workspaces);
    });

    it("rolls back the workspace when a database CHECK rejects the event", async () => {
      const workspaces = await prisma.workspace.count();

      await expect(
        repository.create({
          name: "   ",
          eventType: "CONCERT",
          createdById: actorId,
        }),
      ).rejects.toThrow();

      expect(await prisma.workspace.count()).toBe(workspaces);
    });

    it("round-trips every event type", async () => {
      for (const eventType of EVERY_TYPE) {
        const event = await create({ eventType });
        expect(event.eventType).toBe(eventType);
        expect((await repository.findById(event.id))?.eventType).toBe(
          eventType,
        );
      }
    });
  });

  describe("findById", () => {
    it("returns null for an unknown id and for a non-uuid string", async () => {
      expect(await repository.findById(MISSING_UUID)).toBeNull();
      expect(await repository.findById("not-a-uuid")).toBeNull();
    });

    it("reflects the connected workspace composition, sorted", async () => {
      const event = await create();
      const zebra = await makeTeam("Zebra Crew");
      const alpha = await makeTeam("Alpha Crew");
      const younger = await makeUser("Bea", "Young");
      const older = await makeUser("Cal", "Old");

      await prisma.workspaceTeam.createMany({
        data: [
          { workspaceId: event.workspaceId, teamId: zebra },
          { workspaceId: event.workspaceId, teamId: alpha },
        ],
      });
      await prisma.workspaceParticipant.createMany({
        data: [
          { workspaceId: event.workspaceId, userId: younger },
          { workspaceId: event.workspaceId, userId: older },
        ],
      });

      const reloaded = await repository.findById(event.id);
      expect(reloaded?.teams.map((t) => t.name)).toEqual([
        "Alpha Crew",
        "Zebra Crew",
      ]);
      expect(reloaded?.participants.map((p) => p.lastName)).toEqual([
        "Old",
        "Young",
      ]);
    });

    it("clears createdBy when the author is deleted, keeping the event", async () => {
      const author = await makeUser("Tem", "Porary");
      const event = await create({ createdById: author });

      await prisma.user.delete({ where: { id: author } });

      const reloaded = await repository.findById(event.id);
      expect(reloaded).not.toBeNull();
      expect(reloaded?.createdBy).toBeNull();
    });
  });

  describe("update merges only the fields it is given", () => {
    it("leaves omitted columns untouched and clears a nullable one on null", async () => {
      const event = await create({
        description: "First",
        location: "Hall A",
        organizerName: "Council",
      });

      const patched = await repository.update(event.id, {
        name: "Renamed",
        description: null,
      });
      if (typeof patched === "string") throw new Error(patched);

      expect(patched.name).toBe("Renamed");
      expect(patched.description).toBeNull();
      expect(patched.location).toBe("Hall A");
      expect(patched.organizerName).toBe("Council");
    });

    it("advances updated_at", async () => {
      const event = await create();
      const before = event.updatedAt.getTime();
      await new Promise((resolve) => setTimeout(resolve, 5));

      const patched = await repository.update(event.id, { name: "Later" });
      if (typeof patched === "string") throw new Error(patched);
      expect(patched.updatedAt.getTime()).toBeGreaterThan(before);
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
      const event = await create({
        startAt: new Date("2026-05-10T00:00:00.000Z"),
      });

      await expect(
        repository.update(event.id, {
          endAt: new Date("2026-05-01T00:00:00.000Z"),
        }),
      ).rejects.toThrow();

      expect((await repository.findById(event.id))?.endAt).toBeNull();
    });

    it("is backed by the not-blank name CHECK", async () => {
      const event = await create();
      await expect(
        repository.update(event.id, { name: "   " }),
      ).rejects.toThrow();
      expect((await repository.findById(event.id))?.name).toBe(event.name);
    });
  });

  describe("updateStatus", () => {
    it("persists each lifecycle state", async () => {
      for (const status of EVERY_STATUS) {
        const event = await create();
        const updated = await repository.updateStatus(event.id, status);
        if (typeof updated === "string") throw new Error(updated);
        expect(updated.status).toBe(status);
        expect((await repository.findById(event.id))?.status).toBe(status);
      }
    });

    it("returns not_found for an unknown id and a non-uuid string", async () => {
      expect(await repository.updateStatus(MISSING_UUID, "READY")).toBe(
        "not_found",
      );
      expect(await repository.updateStatus("not-a-uuid", "READY")).toBe(
        "not_found",
      );
    });
  });

  describe("setBudget round-trips money and is backed by the budget CHECK", () => {
    it("stores an amount and currency, reads them back normalised", async () => {
      const event = await create();

      const set = await repository.setBudget(event.id, "15000", "USD");
      if (typeof set === "string") throw new Error(set);
      expect(set.budgetAmount).toBe("15000.00");
      expect(set.budgetCurrency).toBe("USD");

      const stored = await prisma.event.findUniqueOrThrow({
        where: { id: event.id },
        select: { budgetAmount: true, budgetCurrency: true },
      });
      expect(stored.budgetAmount?.toString()).toBe("15000");
      expect(stored.budgetCurrency?.trim()).toBe("USD");

      const reloaded = await repository.findById(event.id);
      expect(reloaded?.budgetAmount).toBe("15000.00");
      expect(reloaded?.budgetCurrency).toBe("USD");
    });

    it("clears the budget when both values are null", async () => {
      const event = await create();
      await repository.setBudget(event.id, "2500.50", "EUR");

      const cleared = await repository.setBudget(event.id, null, null);
      if (typeof cleared === "string") throw new Error(cleared);
      expect(cleared.budgetAmount).toBeNull();
      expect(cleared.budgetCurrency).toBeNull();
    });

    it.each([
      ["an amount without a currency", "100.00", null],
      ["a currency without an amount", null, "USD"],
      ["a negative amount", "-1.00", "USD"],
      ["a lower-case currency", "10.00", "usd"],
      ["a two-letter currency", "10.00", "US"],
    ] as const)(
      "rejects %s at the database",
      async (_label, amount, currency) => {
        const event = await create();
        await expect(
          repository.setBudget(event.id, amount, currency),
        ).rejects.toThrow();
        const reloaded = await repository.findById(event.id);
        expect(reloaded?.budgetAmount).toBeNull();
        expect(reloaded?.budgetCurrency).toBeNull();
      },
    );

    it("returns not_found for an unknown id and a non-uuid string", async () => {
      expect(await repository.setBudget(MISSING_UUID, "1.00", "USD")).toBe(
        "not_found",
      );
      expect(await repository.setBudget("not-a-uuid", "1.00", "USD")).toBe(
        "not_found",
      );
    });
  });

  describe("delete removes the event and its workspace together", () => {
    it("deletes both rows and is idempotent on a second call", async () => {
      const event = await create();

      expect(await repository.delete(event.id)).toBe("deleted");
      expect(await repository.delete(event.id)).toBe("not_found");

      expect(
        await prisma.event.findUnique({ where: { id: event.id } }),
      ).toBeNull();
      expect(
        await prisma.workspace.findUnique({
          where: { id: event.workspaceId },
        }),
      ).toBeNull();
    });

    it("spares the referenced teams and users, dropping only the join rows", async () => {
      const event = await create();
      const teamId = await makeTeam();
      const userId = await makeUser();
      await prisma.workspaceTeam.create({
        data: { workspaceId: event.workspaceId, teamId },
      });
      await prisma.workspaceParticipant.create({
        data: { workspaceId: event.workspaceId, userId },
      });

      expect(await repository.delete(event.id)).toBe("deleted");

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

    it("returns not_found for a non-uuid string", async () => {
      expect(await repository.delete("not-a-uuid")).toBe("not_found");
    });

    it("cannot be short-circuited: the RESTRICT FK blocks deleting the workspace first", async () => {
      const event = await create();
      await expect(
        prisma.workspace.delete({ where: { id: event.workspaceId } }),
      ).rejects.toThrow();
      expect(
        await prisma.event.findUnique({ where: { id: event.id } }),
      ).not.toBeNull();
    });
  });

  describe("list filters", () => {
    it("narrows by status, type, manager, name, and a start-time window", async () => {
      const managerId = await makeUser("Fil", "Ter");
      const tagged = await create({
        name: "Quarterly Filter Marker Gala",
        eventType: "CORPORATE_EVENT",
        managerId,
        startAt: new Date("2028-06-15T00:00:00.000Z"),
      });
      await repository.updateStatus(tagged.id, "READY");
      await create({ name: "Unrelated", eventType: "CONCERT" });

      const byType = await repository.list({
        eventType: "CORPORATE_EVENT",
        page: 1,
        pageSize: 100,
      });
      expect(byType.items.every((e) => e.eventType === "CORPORATE_EVENT")).toBe(
        true,
      );

      const byStatus = await repository.list({
        status: "READY",
        eventType: "CORPORATE_EVENT",
        page: 1,
        pageSize: 100,
      });
      expect(byStatus.items.map((e) => e.id)).toContain(tagged.id);
      expect(byStatus.items.every((e) => e.status === "READY")).toBe(true);

      const byManager = await repository.list({
        managerId,
        page: 1,
        pageSize: 100,
      });
      expect(byManager.items.map((e) => e.id)).toEqual([tagged.id]);

      const bySearch = await repository.list({
        search: "filter marker",
        page: 1,
        pageSize: 100,
      });
      expect(bySearch.items.map((e) => e.id)).toEqual([tagged.id]);

      const inWindow = await repository.list({
        startingAfter: new Date("2028-01-01T00:00:00.000Z"),
        startingBefore: new Date("2028-12-31T00:00:00.000Z"),
        page: 1,
        pageSize: 100,
      });
      expect(inWindow.items.map((e) => e.id)).toEqual([tagged.id]);

      const outOfWindow = await repository.list({
        startingAfter: new Date("2029-01-01T00:00:00.000Z"),
        page: 1,
        pageSize: 100,
      });
      expect(outOfWindow.items.map((e) => e.id)).not.toContain(tagged.id);
    });

    it("matches the name case-insensitively", async () => {
      const event = await create({ name: "MiXeD CaSe Marker" });
      const found = await repository.list({
        search: "mixed case marker",
        page: 1,
        pageSize: 100,
      });
      expect(found.items.map((e) => e.id)).toContain(event.id);
    });
  });

  describe("list pagination is deterministic", () => {
    it("walks equal-timestamp rows once each, with a stable total and an empty tail", async () => {
      // A marker unique to this test isolates its rows from every other
      // event the suite creates, so `total` is exactly 7.
      const marker = `Pagewalk ${(counter += 1)}`;
      const created = await Promise.all(
        Array.from({ length: 7 }, (_, index) =>
          create({ name: `${marker} ${index}` }),
        ),
      );
      const ids = new Set(created.map((e) => e.id));

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
        (e) => `${e.createdAt.toISOString()}#${e.id}`,
      );
      expect(keys).toEqual([...keys].sort());
    });
  });
});
