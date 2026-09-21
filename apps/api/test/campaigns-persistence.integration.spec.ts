import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  PrismaClient,
  type CampaignStatus,
  type CampaignType,
} from "../src/generated/prisma/client.js";
import {
  CampaignsRepository,
  type CampaignRecord,
  type CreateCampaignInput,
} from "../src/campaigns/infrastructure/campaigns.repository.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

const MISSING_UUID = "00000000-0000-0000-0000-000000000000";

const EVERY_STATUS: CampaignStatus[] = [
  "PLANNED",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
];

/**
 * CAM-03 support - verifies `CampaignsRepository` policy and persistence
 * against a real isolated PostgreSQL 18 schema: the two-write create/delete
 * transactions and their rollback, the field-merge semantics of a patch, the
 * database CHECK constraints that back the service validation (schedule,
 * budget, single related subject), the optional event cross-reference (a soft
 * peer, not ownership), progress derived from activities, activity isolation
 * between campaigns, the managed-files-aware delete conflict (FIL-02),
 * deterministic pagination, and the filter matrix. Every test provisions its
 * own rows in an isolated schema, so the suite is order-independent.
 */
describe("campaign platform persistence", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let repository: CampaignsRepository;

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
    repository = new CampaignsRepository(prisma as never);

    actorId = (
      await prisma.user.create({
        data: {
          email: "author@campaigns.test",
          firstName: "Ada",
          lastName: "Author",
        },
      })
    ).id;
    departmentId = (
      await prisma.department.create({ data: { name: "Marketing" } })
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
      data: { email: `person-${counter}@campaigns.test`, firstName, lastName },
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
      data: { workspaceId: workspace.id, name, eventType: "CONCERT" },
    });
    return event.id;
  }
  async function create(
    overrides: Partial<CreateCampaignInput> = {},
  ): Promise<CampaignRecord> {
    counter += 1;
    const result = await repository.create({
      name: `Campaign ${counter}`,
      campaignType: "MARKETING",
      createdById: actorId,
      ...overrides,
    });
    if (typeof result === "string") {
      throw new Error(`create failed: ${result}`);
    }
    return result;
  }
  async function activity(
    campaignId: string,
    input: Parameters<CampaignsRepository["createActivity"]>[1] = {
      name: `Activity ${(counter += 1)}`,
    },
  ) {
    const result = await repository.createActivity(campaignId, input);
    if (typeof result === "string") {
      throw new Error(`createActivity failed: ${result}`);
    }
    return result;
  }

  describe("create", () => {
    it("creates the campaign and a CAMPAIGN workspace together", async () => {
      const managerId = await makeUser("Mia", "Manager");
      const eventId = await makeEvent();

      const campaign = await create({
        name: "Autumn Push",
        campaignType: "PROMOTION",
        description: "Awareness.",
        audience: "Young adults",
        startAt: new Date("2026-10-01T00:00:00.000Z"),
        endAt: new Date("2026-11-01T00:00:00.000Z"),
        eventId,
        managerId,
      });

      expect(campaign).toMatchObject({
        name: "Autumn Push",
        campaignType: "PROMOTION",
        description: "Awareness.",
        audience: "Young adults",
        status: "PLANNED",
        eventId,
        productName: null,
        budgetAmount: null,
        budgetCurrency: null,
        progress: { completedActivities: 0, totalActivities: 0, percent: null },
        teams: [],
        participants: [],
      });
      expect(campaign.manager?.id).toBe(managerId);
      expect(campaign.createdBy?.id).toBe(actorId);

      const workspace = await prisma.workspace.findUniqueOrThrow({
        where: { id: campaign.workspaceId },
      });
      expect(workspace.kind).toBe("CAMPAIGN");
      expect(workspace.managerId).toBe(managerId);
    });

    it("stores a product subject instead of an event", async () => {
      const campaign = await create({ productName: "Nexo Energy" });

      expect(campaign.productName).toBe("Nexo Energy");
      expect(campaign.eventId).toBeNull();
    });

    it("gives each campaign its own workspace", async () => {
      const first = await create();
      const second = await create();

      expect(first.workspaceId).not.toBe(second.workspaceId);
    });

    it("rolls back the workspace when the manager does not exist", async () => {
      const campaigns = await prisma.campaign.count();
      const workspaces = await prisma.workspace.count();

      const result = await repository.create({
        name: "Ghost Manager",
        campaignType: "MARKETING",
        createdById: actorId,
        managerId: MISSING_UUID,
      });

      expect(result).toBe("manager_not_found");
      expect(await prisma.campaign.count()).toBe(campaigns);
      expect(await prisma.workspace.count()).toBe(workspaces);
    });

    it("reports an unknown event before opening the transaction", async () => {
      const workspaces = await prisma.workspace.count();

      const result = await repository.create({
        name: "Ghost Event",
        campaignType: "MARKETING",
        createdById: actorId,
        eventId: MISSING_UUID,
      });

      expect(result).toBe("event_not_found");
      expect(await prisma.workspace.count()).toBe(workspaces);
    });

    it("lets the database backstop the single-subject rule", async () => {
      await expect(
        repository.create({
          name: "Both",
          campaignType: "MARKETING",
          createdById: actorId,
          eventId: await makeEvent(),
          productName: "Widget",
        }),
      ).rejects.toThrow();
    });

    it("lets the database backstop a reversed schedule", async () => {
      await expect(
        repository.create({
          name: "Backwards",
          campaignType: "MARKETING",
          createdById: actorId,
          startAt: new Date("2026-10-02T00:00:00.000Z"),
          endAt: new Date("2026-10-01T00:00:00.000Z"),
        }),
      ).rejects.toThrow();
    });
  });

  describe("read", () => {
    it("returns null for an unknown or malformed id", async () => {
      expect(await repository.findById(MISSING_UUID)).toBeNull();
      expect(await repository.findById("not-a-uuid")).toBeNull();
    });

    it("composes the manager, teams, and participants from the workspace", async () => {
      const managerId = await makeUser("Mia", "Manager");
      const campaign = await create({ managerId });
      const zTeam = await makeTeam("Zulu");
      const aTeam = await makeTeam("Alpha");
      const zUser = await makeUser("Zed", "Zulu");
      const aUser = await makeUser("Abe", "Alpha");
      await prisma.workspaceTeam.createMany({
        data: [
          { workspaceId: campaign.workspaceId, teamId: zTeam },
          { workspaceId: campaign.workspaceId, teamId: aTeam },
        ],
      });
      await prisma.workspaceParticipant.createMany({
        data: [
          { workspaceId: campaign.workspaceId, userId: zUser },
          { workspaceId: campaign.workspaceId, userId: aUser },
        ],
      });

      const read = await repository.findById(campaign.id);

      expect(read?.manager?.id).toBe(managerId);
      expect(read?.teams.map((team) => team.name)).toEqual(["Alpha", "Zulu"]);
      expect(read?.participants.map((person) => person.lastName)).toEqual([
        "Alpha",
        "Zulu",
      ]);
    });
  });

  describe("update", () => {
    it("changes only the fields that were set", async () => {
      const campaign = await create({
        description: "Keep me",
        audience: "Keep too",
        startAt: new Date("2026-10-01T00:00:00.000Z"),
      });

      const result = await repository.update(campaign.id, { name: "Renamed" });

      expect(result).toMatchObject({
        name: "Renamed",
        description: "Keep me",
        audience: "Keep too",
        startAt: new Date("2026-10-01T00:00:00.000Z"),
      });
    });

    it("clears a nullable field sent as null", async () => {
      const campaign = await create({
        description: "Clear me",
        audience: "Clear too",
        productName: "Widget",
      });

      const result = await repository.update(campaign.id, {
        description: null,
        audience: null,
        productName: null,
      });

      expect(result).toMatchObject({
        description: null,
        audience: null,
        productName: null,
      });
    });

    it("changes the owning type", async () => {
      const campaign = await create({ campaignType: "MARKETING" });
      const type: CampaignType = "PROMOTION";

      expect(
        await repository.update(campaign.id, { campaignType: type }),
      ).toMatchObject({ campaignType: type });
    });

    it("connects, switches, and disconnects the related event", async () => {
      const campaign = await create();
      const first = await makeEvent();
      const second = await makeEvent();

      expect(
        await repository.update(campaign.id, { eventId: first }),
      ).toMatchObject({ eventId: first });
      expect(
        await repository.update(campaign.id, { eventId: second }),
      ).toMatchObject({ eventId: second });
      expect(
        await repository.update(campaign.id, { eventId: null }),
      ).toMatchObject({ eventId: null });
    });

    it("reports an unknown event without changing the campaign", async () => {
      const campaign = await create({ name: "Stable" });

      expect(
        await repository.update(campaign.id, {
          name: "Changed",
          eventId: MISSING_UUID,
        }),
      ).toBe("event_not_found");
      expect((await repository.findById(campaign.id))?.name).toBe("Stable");
    });

    it("reports not_found for an unknown or malformed id", async () => {
      expect(await repository.update(MISSING_UUID, { name: "x" })).toBe(
        "not_found",
      );
      expect(await repository.update("not-a-uuid", { name: "x" })).toBe(
        "not_found",
      );
    });

    it("lets the database backstop a subject conflict introduced by a patch", async () => {
      const campaign = await create({ productName: "Widget" });

      await expect(
        repository.update(campaign.id, { eventId: await makeEvent() }),
      ).rejects.toThrow();
    });

    it("clears the event reference when the event is deleted", async () => {
      const eventId = await makeEvent();
      const campaign = await create({ eventId });

      await prisma.event.delete({ where: { id: eventId } });

      expect((await repository.findById(campaign.id))?.eventId).toBeNull();
    });
  });

  describe("status", () => {
    it.each(EVERY_STATUS)("stores %s", async (status) => {
      const campaign = await create();

      expect(
        await repository.updateStatus(campaign.id, "PLANNED", status),
      ).toMatchObject({
        status,
      });
    });

    it("reports not_found for an unknown or malformed id", async () => {
      expect(
        await repository.updateStatus(MISSING_UUID, "PLANNED", "ACTIVE"),
      ).toBe("not_found");
      expect(
        await repository.updateStatus("not-a-uuid", "PLANNED", "ACTIVE"),
      ).toBe("not_found");
    });
  });

  describe("status changes are compare-and-swap", () => {
    it("refuses a stale expected status and leaves the campaign as it is", async () => {
      const campaign = await create();
      await repository.updateStatus(campaign.id, "PLANNED", "CANCELLED");

      const result = await repository.updateStatus(
        campaign.id,
        "PLANNED",
        "ACTIVE",
      );

      expect(result).toBe("status_changed");
      expect((await repository.findById(campaign.id))?.status).toBe(
        "CANCELLED",
      );
    });

    it("applies only when the expected status still matches", async () => {
      const campaign = await create();
      await repository.updateStatus(campaign.id, "PLANNED", "ACTIVE");

      expect(
        await repository.updateStatus(campaign.id, "ACTIVE", "COMPLETED"),
      ).toMatchObject({ status: "COMPLETED" });
    });

    it("lets exactly one of two racing transitions win", async () => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const campaign = await create();

        const results = await Promise.all([
          repository.updateStatus(campaign.id, "PLANNED", "CANCELLED"),
          repository.updateStatus(campaign.id, "PLANNED", "ACTIVE"),
        ]);

        const winners = results.filter((result) => typeof result !== "string");
        expect(winners).toHaveLength(1);
        expect(
          results.filter((result) => result === "status_changed"),
        ).toHaveLength(1);
        // The stored status is the winner's target, never overwritten.
        const winner = winners[0] as CampaignRecord;
        expect((await repository.findById(campaign.id))?.status).toBe(
          winner.status,
        );
      }
    });
  });

  describe("budget", () => {
    it("stores exact money with a trimmed currency", async () => {
      const campaign = await create();

      const result = await repository.setBudget(campaign.id, "25000.50", "ETB");

      expect(result).toMatchObject({
        budgetAmount: "25000.50",
        budgetCurrency: "ETB",
      });
    });

    it("clears the budget", async () => {
      const campaign = await create();
      await repository.setBudget(campaign.id, "5.00", "USD");

      expect(await repository.setBudget(campaign.id, null, null)).toMatchObject(
        { budgetAmount: null, budgetCurrency: null },
      );
    });

    it("lets the database backstop an incomplete or invalid budget", async () => {
      const campaign = await create();

      await expect(
        repository.setBudget(campaign.id, "5.00", null),
      ).rejects.toThrow();
      await expect(
        repository.setBudget(campaign.id, "-1.00", "USD"),
      ).rejects.toThrow();
      await expect(
        repository.setBudget(campaign.id, "1.00", "usd"),
      ).rejects.toThrow();
    });

    it("reports not_found for an unknown or malformed id", async () => {
      expect(await repository.setBudget(MISSING_UUID, "1.00", "USD")).toBe(
        "not_found",
      );
      expect(await repository.setBudget("not-a-uuid", "1.00", "USD")).toBe(
        "not_found",
      );
    });
  });

  describe("progress derived from activities", () => {
    it("is empty with no activities", async () => {
      const campaign = await create();

      expect((await repository.findById(campaign.id))?.progress).toEqual({
        completedActivities: 0,
        totalActivities: 0,
        percent: null,
      });
    });

    it("counts completed against every non-cancelled activity", async () => {
      const campaign = await create();
      await activity(campaign.id, { name: "a", status: "COMPLETED" });
      await activity(campaign.id, { name: "b", status: "IN_PROGRESS" });
      await activity(campaign.id, { name: "c", status: "PLANNED" });

      expect((await repository.findById(campaign.id))?.progress).toEqual({
        completedActivities: 1,
        totalActivities: 3,
        percent: 33,
      });
    });

    it("rounds to a whole percent", async () => {
      const campaign = await create();
      await activity(campaign.id, { name: "a", status: "COMPLETED" });
      await activity(campaign.id, { name: "b", status: "COMPLETED" });
      await activity(campaign.id, { name: "c", status: "PLANNED" });

      expect((await repository.findById(campaign.id))?.progress.percent).toBe(
        67,
      );
    });

    it("excludes cancelled activities from the total", async () => {
      const campaign = await create();
      await activity(campaign.id, { name: "a", status: "COMPLETED" });
      await activity(campaign.id, { name: "b", status: "CANCELLED" });
      await activity(campaign.id, { name: "c", status: "CANCELLED" });

      expect((await repository.findById(campaign.id))?.progress).toEqual({
        completedActivities: 1,
        totalActivities: 1,
        percent: 100,
      });
    });

    it("is null when every activity is cancelled", async () => {
      const campaign = await create();
      await activity(campaign.id, { name: "a", status: "CANCELLED" });

      expect((await repository.findById(campaign.id))?.progress).toEqual({
        completedActivities: 0,
        totalActivities: 0,
        percent: null,
      });
    });

    it("tracks an activity status change", async () => {
      const campaign = await create();
      const first = await activity(campaign.id, { name: "a" });
      await activity(campaign.id, { name: "b" });

      await repository.updateActivity(campaign.id, first.id, {
        status: "COMPLETED",
      });

      expect((await repository.findById(campaign.id))?.progress.percent).toBe(
        50,
      );
    });

    it("keeps each campaign's progress separate on a list page", async () => {
      const done = await create({ name: "progress-done" });
      const half = await create({ name: "progress-half" });
      const none = await create({ name: "progress-none" });
      await activity(done.id, { name: "a", status: "COMPLETED" });
      await activity(half.id, { name: "a", status: "COMPLETED" });
      await activity(half.id, { name: "b", status: "PLANNED" });

      const { items } = await repository.list({
        search: "progress-",
        page: 1,
        pageSize: 10,
      });
      const percentByName = new Map(
        items.map((item) => [item.name, item.progress.percent]),
      );

      expect(percentByName.get("progress-done")).toBe(100);
      expect(percentByName.get("progress-half")).toBe(50);
      expect(percentByName.get(none.name)).toBeNull();
    });
  });

  describe("activities", () => {
    it("creates with defaults and reads back within its campaign", async () => {
      const campaign = await create();

      const created = await activity(campaign.id, { name: "Teaser" });

      expect(created).toMatchObject({
        campaignId: campaign.id,
        name: "Teaser",
        description: null,
        status: "PLANNED",
        startAt: null,
        endAt: null,
      });
      expect(await repository.findActivity(campaign.id, created.id)).toEqual(
        created,
      );
    });

    it("does not find an activity through another campaign", async () => {
      const owner = await create();
      const other = await create();
      const created = await activity(owner.id);

      expect(await repository.findActivity(other.id, created.id)).toBeNull();
      expect(
        await repository.updateActivity(other.id, created.id, { name: "x" }),
      ).toBe("not_found");
      expect(await repository.deleteActivity(other.id, created.id)).toBe(
        "not_found",
      );
      expect(
        await repository.findActivity(owner.id, created.id),
      ).not.toBeNull();
    });

    it("reports campaign_not_found creating under an unknown campaign", async () => {
      expect(await repository.createActivity(MISSING_UUID, { name: "x" })).toBe(
        "campaign_not_found",
      );
      expect(await repository.createActivity("not-a-uuid", { name: "x" })).toBe(
        "campaign_not_found",
      );
    });

    it("updates only the fields that were set and clears nullable ones", async () => {
      const campaign = await create();
      const created = await activity(campaign.id, {
        name: "Keep",
        description: "Clear me",
        startAt: new Date("2026-10-01T00:00:00.000Z"),
      });

      const result = await repository.updateActivity(campaign.id, created.id, {
        description: null,
        status: "IN_PROGRESS",
      });

      expect(result).toMatchObject({
        name: "Keep",
        description: null,
        status: "IN_PROGRESS",
        startAt: new Date("2026-10-01T00:00:00.000Z"),
      });
    });

    it("lets the database backstop a reversed activity schedule", async () => {
      const campaign = await create();

      await expect(
        repository.createActivity(campaign.id, {
          name: "Backwards",
          startAt: new Date("2026-10-02T00:00:00.000Z"),
          endAt: new Date("2026-10-01T00:00:00.000Z"),
        }),
      ).rejects.toThrow();
    });

    it("deletes an activity and reports a repeat as not_found", async () => {
      const campaign = await create();
      const created = await activity(campaign.id);

      expect(await repository.deleteActivity(campaign.id, created.id)).toBe(
        "deleted",
      );
      expect(await repository.deleteActivity(campaign.id, created.id)).toBe(
        "not_found",
      );
    });

    it("treats malformed ids as not found", async () => {
      expect(await repository.findActivity("not-a-uuid", MISSING_UUID)).toBe(
        null,
      );
      expect(
        await repository.updateActivity(MISSING_UUID, "not-a-uuid", {
          name: "x",
        }),
      ).toBe("not_found");
      expect(await repository.deleteActivity(MISSING_UUID, "not-a-uuid")).toBe(
        "not_found",
      );
      expect(
        await repository.listActivities("not-a-uuid", { page: 1, pageSize: 5 }),
      ).toEqual({ items: [], total: 0 });
    });

    it("lists scheduled work first, unscheduled last, then by creation", async () => {
      const campaign = await create();
      const unscheduled = await activity(campaign.id, { name: "unscheduled" });
      const late = await activity(campaign.id, {
        name: "late",
        startAt: new Date("2026-12-01T00:00:00.000Z"),
      });
      const early = await activity(campaign.id, {
        name: "early",
        startAt: new Date("2026-10-01T00:00:00.000Z"),
      });

      const { items, total } = await repository.listActivities(campaign.id, {
        page: 1,
        pageSize: 10,
      });

      expect(total).toBe(3);
      expect(items.map((item) => item.id)).toEqual([
        early.id,
        late.id,
        unscheduled.id,
      ]);
    });

    it("filters by status and paginates deterministically", async () => {
      const campaign = await create();
      for (let index = 0; index < 5; index += 1) {
        await activity(campaign.id, {
          name: `done-${index}`,
          status: "COMPLETED",
        });
      }
      await activity(campaign.id, { name: "open", status: "PLANNED" });

      const first = await repository.listActivities(campaign.id, {
        status: "COMPLETED",
        page: 1,
        pageSize: 2,
      });
      const second = await repository.listActivities(campaign.id, {
        status: "COMPLETED",
        page: 2,
        pageSize: 2,
      });
      const third = await repository.listActivities(campaign.id, {
        status: "COMPLETED",
        page: 3,
        pageSize: 2,
      });

      expect(first.total).toBe(5);
      const ids = [...first.items, ...second.items, ...third.items].map(
        (item) => item.id,
      );
      expect(ids).toHaveLength(5);
      expect(new Set(ids).size).toBe(5);
    });

    it("only lists the requested campaign's activities", async () => {
      const mine = await create();
      const theirs = await create();
      await activity(mine.id);
      await activity(theirs.id);
      await activity(theirs.id);

      expect(
        (await repository.listActivities(mine.id, { page: 1, pageSize: 10 }))
          .total,
      ).toBe(1);
    });
  });

  describe("list", () => {
    it("filters by status, type, event, manager, search, and start window", async () => {
      const eventId = await makeEvent();
      const managerId = await makeUser("Filter", "Manager");
      const target = await create({
        name: "filter-target",
        campaignType: "PROMOTION",
        eventId,
        managerId,
        startAt: new Date("2027-03-15T00:00:00.000Z"),
      });
      await repository.updateStatus(target.id, "PLANNED", "ACTIVE");
      await create({
        name: "filter-decoy-type",
        campaignType: "MARKETING",
        eventId,
        managerId,
        startAt: new Date("2027-03-15T00:00:00.000Z"),
      });
      await create({ name: "filter-decoy-window", campaignType: "PROMOTION" });

      const { items, total } = await repository.list({
        status: "ACTIVE",
        campaignType: "PROMOTION",
        eventId,
        managerId,
        search: "FILTER-TAR",
        startingAfter: new Date("2027-03-01T00:00:00.000Z"),
        startingBefore: new Date("2027-03-31T00:00:00.000Z"),
        page: 1,
        pageSize: 10,
      });

      expect(total).toBe(1);
      expect(items.map((item) => item.id)).toEqual([target.id]);
    });

    it("paginates in a stable creation order with a total", async () => {
      const created: string[] = [];
      for (let index = 0; index < 5; index += 1) {
        created.push((await create({ name: `page-${index}` })).id);
      }

      const first = await repository.list({
        search: "page-",
        page: 1,
        pageSize: 2,
      });
      const second = await repository.list({
        search: "page-",
        page: 2,
        pageSize: 2,
      });
      const third = await repository.list({
        search: "page-",
        page: 3,
        pageSize: 2,
      });

      expect(first.total).toBe(5);
      expect(
        [...first.items, ...second.items, ...third.items].map(
          (item) => item.id,
        ),
      ).toEqual(created);
    });

    it("returns an empty page with progress lookup skipped", async () => {
      expect(
        await repository.list({
          search: "no-such-campaign",
          page: 1,
          pageSize: 5,
        }),
      ).toEqual({ items: [], total: 0 });
    });
  });

  describe("delete", () => {
    it("removes the campaign, its activities, and its workspace together", async () => {
      const campaign = await create();
      await activity(campaign.id);
      await activity(campaign.id);

      expect(await repository.delete(campaign.id)).toBe("deleted");

      expect(
        await prisma.campaign.findUnique({ where: { id: campaign.id } }),
      ).toBeNull();
      expect(
        await prisma.campaignActivity.count({
          where: { campaignId: campaign.id },
        }),
      ).toBe(0);
      expect(
        await prisma.workspace.findUnique({
          where: { id: campaign.workspaceId },
        }),
      ).toBeNull();
    });

    it("leaves other campaigns and their activities alone", async () => {
      const doomed = await create();
      const survivor = await create();
      await activity(survivor.id);

      await repository.delete(doomed.id);

      expect(await repository.findById(survivor.id)).not.toBeNull();
      expect(
        (await repository.listActivities(survivor.id, { page: 1, pageSize: 5 }))
          .total,
      ).toBe(1);
    });

    it("reports not_found for an unknown or malformed id", async () => {
      expect(await repository.delete(MISSING_UUID)).toBe("not_found");
      expect(await repository.delete("not-a-uuid")).toBe("not_found");
    });

    it("clears an UNAVAILABLE managed file's intent link, then deletes cleanly", async () => {
      const campaign = await create();
      await prisma.managedFile.create({
        data: {
          storageKey: `unavailable-${campaign.id}`,
          originalFilename: "rejected.pdf",
          declaredMediaType: "application/pdf",
          declaredSizeBytes: 1024,
          state: "UNAVAILABLE",
          intentExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
          unavailableAt: new Date("2026-06-01T00:00:00.000Z"),
          cleanupAfter: new Date("2026-06-08T00:00:00.000Z"),
          intentWorkspaceId: campaign.workspaceId,
        },
      });

      expect(await repository.delete(campaign.id)).toBe("deleted");
      expect(
        await prisma.workspace.findUnique({
          where: { id: campaign.workspaceId },
        }),
      ).toBeNull();
    });

    it("reports has_managed_files and deletes nothing when a file is attached", async () => {
      const campaign = await create();
      await activity(campaign.id);
      // The AVAILABLE-requires-attachment rule is a deferred constraint
      // trigger (checked at commit, not per statement), so both inserts must
      // land in the same transaction or the managed file's own insert commits
      // and fails the check before the attachment exists.
      await prisma.$transaction(async (tx) => {
        const managedFile = await tx.managedFile.create({
          data: {
            storageKey: `attached-${campaign.id}`,
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
            workspaceId: campaign.workspaceId,
            managedFileId: managedFile.id,
          },
        });
      });

      expect(await repository.delete(campaign.id)).toBe("has_managed_files");
      expect(await repository.findById(campaign.id)).not.toBeNull();
      expect(
        (await repository.listActivities(campaign.id, { page: 1, pageSize: 5 }))
          .total,
      ).toBe(1);
    });
  });

  describe("create is atomic across the workspace and the campaign", () => {
    it.each([
      [
        "both an event and a product subject",
        async () => ({ eventId: await makeEvent(), productName: "Widget" }),
      ],
      [
        "a reversed schedule",
        () =>
          Promise.resolve({
            startAt: new Date("2026-10-02T00:00:00.000Z"),
            endAt: new Date("2026-10-01T00:00:00.000Z"),
          }),
      ],
      ["a blank name", () => Promise.resolve({ name: "   " })],
      ["a blank audience", () => Promise.resolve({ audience: "  " })],
    ])(
      "rolls the workspace back when a database CHECK rejects %s",
      async (_label, overrides) => {
        // Resolve the overrides first: building a fixture (an event) adds its
        // own workspace, which must not count toward the rollback baseline.
        const fields = await overrides();
        const campaigns = await prisma.campaign.count();
        const workspaces = await prisma.workspace.count();

        await expect(
          repository.create({
            name: "Rejected",
            campaignType: "MARKETING",
            createdById: actorId,
            ...fields,
          }),
        ).rejects.toThrow();

        expect(await prisma.campaign.count()).toBe(campaigns);
        expect(await prisma.workspace.count()).toBe(workspaces);
      },
    );

    it("applies the optional manager to the workspace, not the campaign row", async () => {
      const managerId = await makeUser();
      const campaign = await create({ managerId });

      const workspace = await prisma.workspace.findUniqueOrThrow({
        where: { id: campaign.workspaceId },
      });
      const row = await prisma.campaign.findUniqueOrThrow({
        where: { id: campaign.id },
      });

      expect(workspace.managerId).toBe(managerId);
      expect(row).not.toHaveProperty("managerId");
    });

    it("stores the author on the campaign and clears it if the user is deleted", async () => {
      const author = await makeUser("Temp", "Author");
      const campaign = await create({ createdById: author });
      expect(campaign.createdBy?.id).toBe(author);

      await prisma.user.delete({ where: { id: author } });

      const after = await repository.findById(campaign.id);
      expect(after).not.toBeNull();
      expect(after?.createdBy).toBeNull();
    });
  });

  describe("check constraints back the service validation on update", () => {
    it("rejects an out-of-order schedule pair", async () => {
      const campaign = await create();

      await expect(
        repository.update(campaign.id, {
          startAt: new Date("2026-10-02T00:00:00.000Z"),
          endAt: new Date("2026-10-01T00:00:00.000Z"),
        }),
      ).rejects.toThrow();
    });

    it("rejects a blank name, description, audience, and product name", async () => {
      const campaign = await create();

      for (const fields of [
        { name: "  " },
        { description: " " },
        { audience: " " },
        { productName: " " },
      ]) {
        await expect(repository.update(campaign.id, fields)).rejects.toThrow();
      }
      expect((await repository.findById(campaign.id))?.name).toBe(
        campaign.name,
      );
    });

    it("rejects a blank activity name and a reversed activity schedule", async () => {
      const campaign = await create();
      const created = await activity(campaign.id);

      await expect(
        repository.updateActivity(campaign.id, created.id, { name: " " }),
      ).rejects.toThrow();
      await expect(
        repository.updateActivity(campaign.id, created.id, {
          startAt: new Date("2026-10-02T00:00:00.000Z"),
          endAt: new Date("2026-10-01T00:00:00.000Z"),
        }),
      ).rejects.toThrow();
    });

    it("accepts the numeric(14,2) budget ceiling and rejects an overflow", async () => {
      const campaign = await create();

      expect(
        await repository.setBudget(campaign.id, "999999999999.99", "USD"),
      ).toMatchObject({ budgetAmount: "999999999999.99" });
      await expect(
        repository.setBudget(campaign.id, "1000000000000.00", "USD"),
      ).rejects.toThrow();
    });
  });

  describe("updated_at advances on every write", () => {
    async function updatedAt(id: string): Promise<number> {
      const row = await prisma.campaign.findUniqueOrThrow({ where: { id } });
      return row.updatedAt.getTime();
    }

    it("advances on update, status change, and budget change", async () => {
      const campaign = await create();

      const initial = await updatedAt(campaign.id);
      await repository.update(campaign.id, { name: "Advance 1" });
      const afterUpdate = await updatedAt(campaign.id);
      await repository.updateStatus(campaign.id, "PLANNED", "ACTIVE");
      const afterStatus = await updatedAt(campaign.id);
      await repository.setBudget(campaign.id, "1.00", "USD");
      const afterBudget = await updatedAt(campaign.id);

      expect(afterUpdate).toBeGreaterThan(initial);
      expect(afterStatus).toBeGreaterThan(afterUpdate);
      expect(afterBudget).toBeGreaterThan(afterStatus);
    });

    it("advances on an activity update", async () => {
      const campaign = await create();
      const created = await activity(campaign.id);

      const updated = await repository.updateActivity(campaign.id, created.id, {
        status: "COMPLETED",
      });

      expect(updated).not.toBe("not_found");
      if (updated !== "not_found") {
        expect(updated.updatedAt.getTime()).toBeGreaterThan(
          created.updatedAt.getTime(),
        );
      }
    });
  });

  describe("delete leaves everything it does not own", () => {
    it("spares the event, team, and users, dropping only the join rows", async () => {
      const eventId = await makeEvent();
      const teamId = await makeTeam();
      const managerId = await makeUser();
      const participantId = await makeUser();
      const campaign = await create({ eventId, managerId });
      await prisma.workspaceTeam.create({
        data: { workspaceId: campaign.workspaceId, teamId },
      });
      await prisma.workspaceParticipant.create({
        data: { workspaceId: campaign.workspaceId, userId: participantId },
      });

      expect(await repository.delete(campaign.id)).toBe("deleted");

      expect(
        await prisma.event.findUnique({ where: { id: eventId } }),
      ).not.toBeNull();
      expect(
        await prisma.team.findUnique({ where: { id: teamId } }),
      ).not.toBeNull();
      expect(
        await prisma.user.findUnique({ where: { id: managerId } }),
      ).not.toBeNull();
      expect(
        await prisma.user.findUnique({ where: { id: participantId } }),
      ).not.toBeNull();
      expect(
        await prisma.workspaceTeam.count({
          where: { workspaceId: campaign.workspaceId },
        }),
      ).toBe(0);
      expect(
        await prisma.workspaceParticipant.count({
          where: { workspaceId: campaign.workspaceId },
        }),
      ).toBe(0);
    });

    it("cannot be short-circuited: the RESTRICT FK blocks deleting the workspace first", async () => {
      const campaign = await create();

      await expect(
        prisma.workspace.delete({ where: { id: campaign.workspaceId } }),
      ).rejects.toThrow();
      expect(await repository.findById(campaign.id)).not.toBeNull();
    });

    it("rolls back completely when a file blocks the workspace delete", async () => {
      const teamId = await makeTeam();
      const campaign = await create();
      await prisma.workspaceTeam.create({
        data: { workspaceId: campaign.workspaceId, teamId },
      });
      await activity(campaign.id);
      await prisma.$transaction(async (tx) => {
        const managedFile = await tx.managedFile.create({
          data: {
            storageKey: `rollback-${campaign.id}`,
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
            workspaceId: campaign.workspaceId,
            managedFileId: managedFile.id,
          },
        });
      });

      expect(await repository.delete(campaign.id)).toBe("has_managed_files");

      // The campaign, its activity, and its team assignment all survive: the
      // failed workspace delete rolled back the campaign delete too.
      const survivor = await repository.findById(campaign.id);
      expect(survivor?.teams.map((team) => team.id)).toEqual([teamId]);
      expect(
        (await repository.listActivities(campaign.id, { page: 1, pageSize: 5 }))
          .total,
      ).toBe(1);
    });

    it("lets exactly one of two concurrent deletes win", async () => {
      const campaign = await create();

      const results = await Promise.all([
        repository.delete(campaign.id),
        repository.delete(campaign.id),
      ]);

      expect([...results].sort()).toEqual(["deleted", "not_found"]);
      expect(await repository.findById(campaign.id)).toBeNull();
    });
  });

  describe("list pagination is deterministic", () => {
    it("walks equal-timestamp rows once each, with a stable total and an empty tail", async () => {
      const ids: string[] = [];
      for (let index = 0; index < 5; index += 1) {
        ids.push((await create({ name: `tie-${index}` })).id);
      }
      await prisma.$executeRawUnsafe(
        `UPDATE campaigns SET created_at = '2026-01-01T00:00:00Z'
         WHERE id = ANY($1::uuid[])`,
        ids,
      );

      const seen: string[] = [];
      for (const page of [1, 2, 3]) {
        const result = await repository.list({
          search: "tie-",
          page,
          pageSize: 2,
        });
        expect(result.total).toBe(5);
        seen.push(...result.items.map((item) => item.id));
      }
      const tail = await repository.list({
        search: "tie-",
        page: 4,
        pageSize: 2,
      });

      expect(tail.items).toEqual([]);
      expect(tail.total).toBe(5);
      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
      // Ties fall back to the uuidv7 id, which is time-ordered.
      expect(seen).toEqual([...ids].sort());
    });

    it("orders by created_at then id", async () => {
      const older = await create({ name: "order-older" });
      const newer = await create({ name: "order-newer" });
      await prisma.campaign.update({
        where: { id: newer.id },
        data: { createdAt: new Date("2020-01-01T00:00:00.000Z") },
      });

      const { items } = await repository.list({
        search: "order-",
        page: 1,
        pageSize: 10,
      });

      expect(items.map((item) => item.id)).toEqual([newer.id, older.id]);
    });

    it("matches the name case-insensitively and treats % as a literal", async () => {
      await create({ name: "Case-Match Launch" });
      await create({ name: "100% Literal" });

      const insensitive = await repository.list({
        search: "case-match launch",
        page: 1,
        pageSize: 10,
      });
      const literal = await repository.list({
        search: "100%",
        page: 1,
        pageSize: 10,
      });

      expect(insensitive.total).toBe(1);
      expect(literal.items.map((item) => item.name)).toEqual(["100% Literal"]);
    });
  });

  describe("concurrent activity writes stay consistent", () => {
    it("creates every activity and reports a consistent progress", async () => {
      const campaign = await create();

      await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          activity(campaign.id, {
            name: `parallel-${index}`,
            status: index % 2 === 0 ? "COMPLETED" : "PLANNED",
          }),
        ),
      );

      const read = await repository.findById(campaign.id);
      expect(read?.progress).toEqual({
        completedActivities: 4,
        totalActivities: 8,
        percent: 50,
      });
      expect(
        (
          await repository.listActivities(campaign.id, {
            page: 1,
            pageSize: 20,
          })
        ).total,
      ).toBe(8);
    });
  });

  describe("indexes serve the documented access patterns", () => {
    /** Plans a query with sequential scans disabled, so the planner must use an
     * index whenever one can serve the predicate. That checks the index is
     * usable for the filter and order, independent of table size. */
    async function plan(sql: string): Promise<string> {
      return prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off");
        const rows = await tx.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(
          `EXPLAIN ${sql}`,
        );
        return rows.map((row) => row["QUERY PLAN"]).join("\n");
      });
    }

    it.each([
      [
        "type (the composite's leading column)",
        "SELECT id FROM campaigns WHERE campaign_type = 'PROMOTION'",
        "campaigns_campaign_type_status_idx",
      ],
      [
        "status",
        "SELECT id FROM campaigns WHERE status = 'ACTIVE'",
        "campaigns_status_idx",
      ],
      [
        "related event",
        `SELECT id FROM campaigns WHERE event_id = '${MISSING_UUID}'`,
        "campaigns_event_id_idx",
      ],
      [
        "start window",
        "SELECT id FROM campaigns WHERE start_at >= '2026-01-01' AND start_at <= '2026-12-31'",
        "campaigns_start_at_idx",
      ],
      [
        "author",
        `SELECT id FROM campaigns WHERE created_by_id = '${MISSING_UUID}'`,
        "campaigns_created_by_id_idx",
      ],
      [
        "owning workspace",
        `SELECT id FROM campaigns WHERE workspace_id = '${MISSING_UUID}'`,
        "campaigns_workspace_id_key",
      ],
      [
        "activities by status",
        `SELECT id FROM campaign_activities WHERE campaign_id = '${MISSING_UUID}' AND status = 'COMPLETED'`,
        "campaign_activities_campaign_id_status_idx",
      ],
      [
        "activities in schedule order",
        `SELECT id FROM campaign_activities WHERE campaign_id = '${MISSING_UUID}' ORDER BY start_at ASC NULLS LAST`,
        "campaign_activities_campaign_id_start_at_idx",
      ],
    ])("uses an index for %s", async (_label, sql, indexName) => {
      expect(await plan(sql)).toContain(indexName);
    });

    it("keeps the index column order the queries rely on", async () => {
      const rows = await prisma.$queryRawUnsafe<
        { indexname: string; indexdef: string }[]
      >(
        `SELECT indexname, indexdef FROM pg_indexes
         WHERE schemaname = current_schema()
           AND tablename IN ('campaigns', 'campaign_activities')`,
      );
      const definitions = new Map(
        rows.map((row) => [row.indexname, row.indexdef]),
      );

      expect(definitions.get("campaigns_campaign_type_status_idx")).toContain(
        "(campaign_type, status)",
      );
      expect(
        definitions.get("campaign_activities_campaign_id_status_idx"),
      ).toContain("(campaign_id, status)");
      expect(
        definitions.get("campaign_activities_campaign_id_start_at_idx"),
      ).toContain("(campaign_id, start_at)");
      expect(definitions.get("campaigns_workspace_id_key")).toContain("UNIQUE");
    });
  });
});
