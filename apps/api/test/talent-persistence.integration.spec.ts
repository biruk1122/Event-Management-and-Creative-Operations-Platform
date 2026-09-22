import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  PrismaClient,
  type TalentAssignmentStatus,
  type TalentAvailability,
} from "../src/generated/prisma/client.js";
import {
  TalentRepository,
  type TalentRecord,
} from "../src/talent/infrastructure/talent.repository.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

const MISSING_UUID = "00000000-0000-0000-0000-000000000000";

const EVERY_AVAILABILITY: TalentAvailability[] = [
  "AVAILABLE",
  "ASSIGNED",
  "UNAVAILABLE",
  "INACTIVE",
];
const EVERY_ASSIGNMENT_STATUS: TalentAssignmentStatus[] = [
  "ASSIGNED",
  "COMPLETED",
  "CANCELLED",
];

/**
 * TAL-03 - verifies `TalentRepository` policy and persistence against a real
 * isolated PostgreSQL schema: server defaults, the optional manager
 * cross-reference (SET NULL on delete), nested-collection sort order, the
 * database CHECK/unique/FK constraints that back the service validation, and
 * the Prisma error-code-to-sentinel mapping (P2002/P2003/P2025) for every
 * sub-resource. `talent-schema.integration.spec.ts` already covers the raw
 * DDL; this file exercises the same constraints through the repository the
 * service actually calls. Every test provisions its own rows in an isolated
 * schema, so the suite is order-independent.
 */
describe("talent management persistence", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let repository: TalentRepository;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: db.url },
        { schema: db.schema },
      ),
    });
    repository = new TalentRepository(prisma as never);
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
      data: { email: `person-${counter}@talent.test`, firstName, lastName },
    });
    return user.id;
  }
  async function makeEvent(name = `Event ${(counter += 1)}`): Promise<string> {
    const workspace = await prisma.workspace.create({
      data: { kind: "EVENT" },
    });
    const event = await prisma.event.create({
      data: { workspaceId: workspace.id, name, eventType: "CONCERT" },
    });
    return event.id;
  }
  async function create(
    overrides: Partial<{
      fullName: string;
      type:
        | "ARTIST"
        | "INFLUENCER"
        | "ACTOR"
        | "MUSICIAN"
        | "MODEL"
        | "PRESENTER"
        | "CONTENT_CREATOR";
      email?: string;
      phone?: string;
      biography?: string;
      managerId?: string;
    }> = {},
  ): Promise<TalentRecord> {
    counter += 1;
    const result = await repository.create({
      fullName: `Talent ${counter}`,
      type: "MUSICIAN",
      ...overrides,
    });
    if (typeof result === "string") {
      throw new Error(`unexpected create outcome: ${result}`);
    }
    return result;
  }

  describe("create", () => {
    it("writes server defaults for a minimal profile", async () => {
      const talent = await create();

      expect(talent.availability).toBe("AVAILABLE");
      expect(talent.profileImageId).toBeNull();
      expect(talent.email).toBeNull();
      expect(talent.phone).toBeNull();
      expect(talent.biography).toBeNull();
      expect(talent.manager).toBeNull();
      expect(talent.socialLinks).toEqual([]);
      expect(talent.schedules).toEqual([]);
      expect(talent.eventAssignments).toEqual([]);
      expect(talent.createdAt).toBeInstanceOf(Date);
      expect(talent.updatedAt).toBeInstanceOf(Date);
    });

    it("persists the optional manager", async () => {
      const managerId = await makeUser("Manny", "Ager");
      const talent = await create({ managerId });
      expect(talent.manager).toMatchObject({ id: managerId });
    });

    it("reports an unknown manager without writing a row", async () => {
      const before = await prisma.talent.count();
      expect(
        await repository.create({
          fullName: "Ghost Manager",
          type: "MUSICIAN",
          managerId: MISSING_UUID,
        }),
      ).toBe("manager_not_found");
      expect(await prisma.talent.count()).toBe(before);
    });

    it("is backed by the not-blank full name CHECK", async () => {
      await expect(
        repository.create({ fullName: "   ", type: "MUSICIAN" }),
      ).rejects.toThrow();
    });
  });

  describe("findById", () => {
    it("returns null for an unknown id and for a non-uuid string", async () => {
      expect(await repository.findById(MISSING_UUID)).toBeNull();
      expect(await repository.findById("not-a-uuid")).toBeNull();
    });

    it("orders social links ascending by creation time", async () => {
      const talent = await create();
      await repository.createSocialLink(
        talent.id,
        "Instagram",
        "https://instagram.com/a",
      );
      await repository.createSocialLink(
        talent.id,
        "TikTok",
        "https://tiktok.com/@a",
      );

      const reloaded = await repository.findById(talent.id);
      expect(reloaded?.socialLinks.map((s) => s.label)).toEqual([
        "Instagram",
        "TikTok",
      ]);
    });

    it("orders schedules ascending by start time, not insertion order", async () => {
      const talent = await create();
      await repository.createSchedule(
        talent.id,
        "Later",
        new Date("2026-05-10T00:00:00.000Z"),
        new Date("2026-05-10T02:00:00.000Z"),
      );
      await repository.createSchedule(
        talent.id,
        "Earlier",
        new Date("2026-05-01T00:00:00.000Z"),
        new Date("2026-05-01T02:00:00.000Z"),
      );

      const reloaded = await repository.findById(talent.id);
      expect(reloaded?.schedules.map((s) => s.title)).toEqual([
        "Earlier",
        "Later",
      ]);
    });

    it("orders event assignments descending by assignment time, most recent first", async () => {
      const talent = await create();
      const firstEvent = await makeEvent();
      const secondEvent = await makeEvent();
      await repository.createEventAssignment(talent.id, firstEvent, "Opener");
      await repository.createEventAssignment(
        talent.id,
        secondEvent,
        "Headliner",
      );

      const reloaded = await repository.findById(talent.id);
      expect(reloaded?.eventAssignments.map((a) => a.role)).toEqual([
        "Headliner",
        "Opener",
      ]);
    });

    it("clears the manager, keeping the talent, when the manager user is deleted", async () => {
      const managerId = await makeUser("Tem", "Porary");
      const talent = await create({ managerId });

      await prisma.user.delete({ where: { id: managerId } });

      const reloaded = await repository.findById(talent.id);
      expect(reloaded).not.toBeNull();
      expect(reloaded?.manager).toBeNull();
    });
  });

  describe("update merges only the fields it is given", () => {
    it("leaves omitted columns untouched and clears a nullable one on null", async () => {
      const talent = await create({ email: "first@talent.test" });

      const patched = await repository.update(talent.id, {
        fullName: "Renamed",
        email: null,
      });
      expect(patched).not.toBeNull();
      expect(patched?.fullName).toBe("Renamed");
      expect(patched?.email).toBeNull();
    });

    it("advances updated_at", async () => {
      const talent = await create();
      const before = talent.updatedAt.getTime();
      await new Promise((resolve) => setTimeout(resolve, 5));

      const patched = await repository.update(talent.id, { fullName: "Later" });
      expect(patched?.updatedAt.getTime()).toBeGreaterThan(before);
    });

    it("returns null for an unknown id and a non-uuid string", async () => {
      expect(
        await repository.update(MISSING_UUID, { fullName: "x" }),
      ).toBeNull();
      expect(
        await repository.update("not-a-uuid", { fullName: "x" }),
      ).toBeNull();
    });

    it("is backed by the not-blank full name CHECK", async () => {
      const talent = await create();
      await expect(
        repository.update(talent.id, { fullName: "   " }),
      ).rejects.toThrow();
      expect((await repository.findById(talent.id))?.fullName).toBe(
        talent.fullName,
      );
    });
  });

  describe("setManager", () => {
    it("sets and clears the manager", async () => {
      const talent = await create();
      const managerId = await makeUser();

      const set = await repository.setManager(talent.id, managerId);
      expect(set).not.toBeNull();
      expect((set as TalentRecord).manager).toMatchObject({ id: managerId });

      const cleared = await repository.setManager(talent.id, null);
      expect((cleared as TalentRecord).manager).toBeNull();
    });

    it("reports an unknown manager without changing the talent", async () => {
      const talent = await create();
      expect(await repository.setManager(talent.id, MISSING_UUID)).toBe(
        "manager_not_found",
      );
      expect((await repository.findById(talent.id))?.manager).toBeNull();
    });

    it("returns null for an unknown id and a non-uuid string", async () => {
      expect(await repository.setManager(MISSING_UUID, null)).toBeNull();
      expect(await repository.setManager("not-a-uuid", null)).toBeNull();
    });
  });

  describe("setAvailability", () => {
    it("round-trips every availability value", async () => {
      const talent = await create();
      for (const availability of EVERY_AVAILABILITY) {
        const updated = await repository.setAvailability(
          talent.id,
          availability,
        );
        expect(updated?.availability).toBe(availability);
      }
    });

    it("returns null for a non-uuid string and for an unknown-but-valid id", async () => {
      expect(
        await repository.setAvailability("not-a-uuid", "ASSIGNED"),
      ).toBeNull();
      expect(
        await repository.setAvailability(MISSING_UUID, "ASSIGNED"),
      ).toBeNull();
    });
  });

  describe("social links", () => {
    it("creates a link and returns the full talent record", async () => {
      const talent = await create();
      const updated = await repository.createSocialLink(
        talent.id,
        "Instagram",
        "https://instagram.com/a",
      );
      expect(updated).not.toBeNull();
      expect((updated as TalentRecord).socialLinks).toEqual([
        expect.objectContaining({ label: "Instagram" }),
      ]);
    });

    it("reports a duplicate url for the same talent as a conflict", async () => {
      const talent = await create();
      await repository.createSocialLink(
        talent.id,
        "Instagram",
        "https://instagram.com/a",
      );
      expect(
        await repository.createSocialLink(
          talent.id,
          "Instagram again",
          "https://instagram.com/a",
        ),
      ).toBe("conflict");
    });

    it("allows the same url for two different talents", async () => {
      const first = await create();
      const second = await create();
      await repository.createSocialLink(
        first.id,
        "Instagram",
        "https://instagram.com/shared",
      );
      const result = await repository.createSocialLink(
        second.id,
        "Instagram",
        "https://instagram.com/shared",
      );
      expect(result).not.toBe("conflict");
    });

    it("returns null for an unknown talent id", async () => {
      expect(
        await repository.createSocialLink(
          MISSING_UUID,
          "Instagram",
          "https://instagram.com/a",
        ),
      ).toBeNull();
    });

    it("deletes idempotently, scoped to the given talent", async () => {
      const owner = await create();
      const other = await create();
      const updated = (await repository.createSocialLink(
        owner.id,
        "Instagram",
        "https://instagram.com/a",
      )) as TalentRecord;
      const linkId = updated.socialLinks[0]!.id;

      expect(await repository.deleteSocialLink(other.id, linkId)).toBe(false);
      expect(await repository.deleteSocialLink(owner.id, linkId)).toBe(true);
      expect(await repository.deleteSocialLink(owner.id, linkId)).toBe(false);
    });
  });

  describe("schedules", () => {
    it("creates a schedule and returns the full talent record", async () => {
      const talent = await create();
      const updated = await repository.createSchedule(
        talent.id,
        "Dress rehearsal",
        new Date("2026-05-01T10:00:00.000Z"),
        new Date("2026-05-01T12:00:00.000Z"),
      );
      expect((updated as TalentRecord).schedules).toEqual([
        expect.objectContaining({ title: "Dress rehearsal" }),
      ]);
    });

    it("is backed by the end-after-start CHECK", async () => {
      const talent = await create();
      await expect(
        repository.createSchedule(
          talent.id,
          "Backwards",
          new Date("2026-05-01T12:00:00.000Z"),
          new Date("2026-05-01T10:00:00.000Z"),
        ),
      ).rejects.toThrow();
    });

    it("returns null, not a throw, for an unknown-but-valid talent id", async () => {
      expect(
        await repository.createSchedule(
          MISSING_UUID,
          "Ghost",
          new Date("2026-05-01T10:00:00.000Z"),
          new Date("2026-05-01T12:00:00.000Z"),
        ),
      ).toBeNull();
    });

    it("updates only the given fields, scoped to the given talent", async () => {
      const owner = await create();
      const other = await create();
      const updated = (await repository.createSchedule(
        owner.id,
        "Original",
        new Date("2026-05-01T10:00:00.000Z"),
        new Date("2026-05-01T12:00:00.000Z"),
      )) as TalentRecord;
      const scheduleId = updated.schedules[0]!.id;

      expect(
        await repository.updateSchedule(other.id, scheduleId, {
          title: "Hijacked",
        }),
      ).toBeNull();

      const patched = await repository.updateSchedule(owner.id, scheduleId, {
        title: "Renamed",
      });
      expect(
        (patched as TalentRecord).schedules.find((s) => s.id === scheduleId)
          ?.title,
      ).toBe("Renamed");
    });

    it("deletes idempotently, scoped to the given talent", async () => {
      const owner = await create();
      const other = await create();
      const updated = (await repository.createSchedule(
        owner.id,
        "To remove",
        new Date("2026-05-01T10:00:00.000Z"),
        new Date("2026-05-01T12:00:00.000Z"),
      )) as TalentRecord;
      const scheduleId = updated.schedules[0]!.id;

      expect(await repository.deleteSchedule(other.id, scheduleId)).toBe(false);
      expect(await repository.deleteSchedule(owner.id, scheduleId)).toBe(true);
      expect(await repository.deleteSchedule(owner.id, scheduleId)).toBe(false);
    });
  });

  describe("event assignments", () => {
    it("creates an assignment and returns the full talent record", async () => {
      const talent = await create();
      const eventId = await makeEvent();
      const updated = await repository.createEventAssignment(
        talent.id,
        eventId,
        "Headliner",
      );
      expect((updated as TalentRecord).eventAssignments).toEqual([
        expect.objectContaining({ role: "Headliner", status: "ASSIGNED" }),
      ]);
    });

    it("reports a duplicate talent-event pair as a conflict", async () => {
      const talent = await create();
      const eventId = await makeEvent();
      await repository.createEventAssignment(talent.id, eventId, "Headliner");
      expect(
        await repository.createEventAssignment(talent.id, eventId, "Again"),
      ).toBe("conflict");
    });

    it("reports an unknown event as event_not_found", async () => {
      const talent = await create();
      expect(
        await repository.createEventAssignment(
          talent.id,
          MISSING_UUID,
          "Headliner",
        ),
      ).toBe("event_not_found");
    });

    // P2003 fires on either FK column; the repository cannot tell which one
    // was bad, so an unknown talentId with a real eventId is also reported
    // as event_not_found. The service never reaches this ambiguity (it
    // loads the talent first), so this documents the repository's own
    // narrower contract.
    it("also reports event_not_found when the unknown id is actually the talent", async () => {
      const eventId = await makeEvent();
      expect(
        await repository.createEventAssignment(
          MISSING_UUID,
          eventId,
          "Headliner",
        ),
      ).toBe("event_not_found");
    });

    it("assignmentStatus returns the current status or null", async () => {
      const talent = await create();
      const eventId = await makeEvent();
      const updated = (await repository.createEventAssignment(
        talent.id,
        eventId,
        "Headliner",
      )) as TalentRecord;
      const assignmentId = updated.eventAssignments[0]!.id;

      expect(await repository.assignmentStatus(talent.id, assignmentId)).toBe(
        "ASSIGNED",
      );
      expect(
        await repository.assignmentStatus(talent.id, MISSING_UUID),
      ).toBeNull();
    });

    it("round-trips every assignment status, scoped to the given talent", async () => {
      const owner = await create();
      const other = await create();
      const eventId = await makeEvent();
      const updated = (await repository.createEventAssignment(
        owner.id,
        eventId,
        "Headliner",
      )) as TalentRecord;
      const assignmentId = updated.eventAssignments[0]!.id;

      expect(
        await repository.transitionAssignment(
          other.id,
          assignmentId,
          "COMPLETED",
        ),
      ).toBeNull();

      for (const status of EVERY_ASSIGNMENT_STATUS) {
        const result = await repository.transitionAssignment(
          owner.id,
          assignmentId,
          status,
        );
        expect(
          (result as TalentRecord).eventAssignments.find(
            (a) => a.id === assignmentId,
          )?.status,
        ).toBe(status);
      }
    });
  });

  describe("list filters", () => {
    it("narrows by type, availability, manager, and name", async () => {
      const managerId = await makeUser("Fil", "Ter");
      const tagged = await create({
        fullName: "Quarterly Filter Marker Rollout",
        type: "ARTIST",
        managerId,
      });
      await repository.setAvailability(tagged.id, "UNAVAILABLE");
      await create({ fullName: "Unrelated" });

      const byType = await repository.list({
        type: "ARTIST",
        page: 1,
        pageSize: 100,
      });
      expect(byType.items.map((t) => t.id)).toContain(tagged.id);
      expect(byType.items.every((t) => t.type === "ARTIST")).toBe(true);

      const byAvailability = await repository.list({
        availability: "UNAVAILABLE",
        page: 1,
        pageSize: 100,
      });
      expect(byAvailability.items.map((t) => t.id)).toContain(tagged.id);

      const byManager = await repository.list({
        managerId,
        page: 1,
        pageSize: 100,
      });
      expect(byManager.items.map((t) => t.id)).toEqual([tagged.id]);

      const bySearch = await repository.list({
        search: "filter marker",
        page: 1,
        pageSize: 100,
      });
      expect(bySearch.items.map((t) => t.id)).toEqual([tagged.id]);
    });

    it("matches fullName case-insensitively but never matches on email", async () => {
      const talent = await create({
        fullName: "MiXeD CaSe Marker",
        email: "unique-marker-email@talent.test",
      });

      const byMixedCase = await repository.list({
        search: "mixed case marker",
        page: 1,
        pageSize: 100,
      });
      expect(byMixedCase.items.map((t) => t.id)).toContain(talent.id);

      const byEmail = await repository.list({
        search: "unique-marker-email@talent.test",
        page: 1,
        pageSize: 100,
      });
      expect(byEmail.items.map((t) => t.id)).not.toContain(talent.id);
    });
  });

  describe("list pagination is deterministic", () => {
    it("walks equal-timestamp rows once each, with a stable total and an empty tail", async () => {
      const marker = `Pagewalk ${(counter += 1)}`;
      const created = await Promise.all(
        Array.from({ length: 7 }, (_, index) =>
          create({ fullName: `${marker} ${index}` }),
        ),
      );
      const ids = new Set(created.map((t) => t.id));

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
        (t) => `${t.createdAt.toISOString()}#${t.id}`,
      );
      expect(keys).toEqual([...keys].sort());
    });
  });
});
