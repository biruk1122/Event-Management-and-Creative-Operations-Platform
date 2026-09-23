import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "../src/generated/prisma/client.js";
import { ProductionsRepository } from "../src/productions/infrastructure/productions.repository.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

describe("production management persistence", () => {
  const MISSING_ID = "00000000-0000-0000-0000-000000000000";
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let repository: ProductionsRepository;
  let actorId: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: db.url },
        { schema: db.schema },
      ),
    });
    repository = new ProductionsRepository(prisma as never);
    actorId = (
      await prisma.user.create({
        data: { email: "production-author@test.local" },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.drop();
  });

  it("creates a paired workspace, paginates, and deletes both atomically", async () => {
    const created = await repository.create({
      name: "Launch film",
      productionType: "Video",
      createdById: actorId,
    });
    expect(typeof created).not.toBe("string");
    if (typeof created === "string") throw new Error(created);

    expect(created.manager).toBeNull();
    expect(created.createdBy?.id).toBe(actorId);
    expect(
      (
        await prisma.workspace.findUnique({
          where: { id: created.workspaceId },
        })
      )?.kind,
    ).toBe("PRODUCTION");
    expect(
      (await repository.list({ page: 1, pageSize: 1, search: "launch" })).total,
    ).toBe(1);

    expect(await repository.delete(created.id)).toBe("deleted");
    expect(
      await prisma.workspace.findUnique({ where: { id: created.workspaceId } }),
    ).toBeNull();
  });

  it("assigns talent explicitly and detects duplicate and missing relations", async () => {
    const created = await repository.create({
      name: "Show",
      productionType: "Stage",
      createdById: actorId,
    });
    if (typeof created === "string") throw new Error(created);
    const talent = await prisma.talent.create({
      data: { fullName: "Ada Artist", type: "ARTIST" },
    });

    expect(await repository.assignTalent(created.id, talent.id, "Lead")).toBe(
      "assigned",
    );
    expect(await repository.assignTalent(created.id, talent.id, "Lead")).toBe(
      "already_assigned",
    );
    expect((await repository.findById(created.id))?.talents[0]?.talent.id).toBe(
      talent.id,
    );
    expect(await repository.unassignTalent(created.id, talent.id)).toBe(true);
    expect(await repository.unassignTalent(created.id, talent.id)).toBe(false);
  });

  it("uses a compare-and-swap lifecycle write", async () => {
    const created = await repository.create({
      name: "Edit",
      productionType: "Video",
      createdById: actorId,
    });
    if (typeof created === "string") throw new Error(created);
    expect(
      await repository.updateStatus(created.id, "PLANNED", "ACTIVE"),
    ).toMatchObject({ status: "ACTIVE" });
    expect(
      await repository.updateStatus(created.id, "PLANNED", "CANCELLED"),
    ).toBe("status_changed");
    expect((await repository.findById(created.id))?.status).toBe("ACTIVE");
  });

  it("rolls back both writes when manager or production data is invalid", async () => {
    const before = {
      productions: await prisma.production.count(),
      workspaces: await prisma.workspace.count(),
    };
    expect(
      await repository.create({
        name: "Ghost manager",
        productionType: "Video",
        createdById: actorId,
        managerId: MISSING_ID,
      }),
    ).toBe("manager_not_found");
    await expect(
      repository.create({
        name: "Invalid type",
        productionType: "   ",
        createdById: actorId,
      }),
    ).rejects.toThrow();
    await expect(
      repository.create({
        name: "Invalid dates",
        productionType: "Video",
        createdById: actorId,
        startAt: new Date("2026-10-02T00:00:00.000Z"),
        endAt: new Date("2026-10-01T00:00:00.000Z"),
      }),
    ).rejects.toThrow();
    expect(await prisma.production.count()).toBe(before.productions);
    expect(await prisma.workspace.count()).toBe(before.workspaces);
  });

  it("enforces talent foreign keys and role checks without partial assignments", async () => {
    const created = await repository.create({
      name: "Relation checks",
      productionType: "Video",
      createdById: actorId,
    });
    if (typeof created === "string") throw new Error(created);
    const talent = await prisma.talent.create({
      data: { fullName: "Relation Artist", type: "ARTIST" },
    });
    expect(await repository.assignTalent(created.id, MISSING_ID, "Lead")).toBe(
      "talent_not_found",
    );
    await expect(
      repository.assignTalent(created.id, talent.id, "  "),
    ).rejects.toThrow();
    expect(
      await prisma.productionTalent.count({
        where: { productionId: created.id },
      }),
    ).toBe(0);
    expect(await repository.assignTalent(created.id, talent.id, "Lead")).toBe(
      "assigned",
    );
    await prisma.talent.delete({ where: { id: talent.id } });
    expect(
      await prisma.productionTalent.count({
        where: { productionId: created.id },
      }),
    ).toBe(0);
  });

  it("keeps the production and workspace when a connected task blocks deletion", async () => {
    const created = await repository.create({
      name: "In use",
      productionType: "Stage",
      createdById: actorId,
    });
    if (typeof created === "string") throw new Error(created);
    const task = await prisma.task.create({
      data: { title: "Prepare set", workspaceId: created.workspaceId },
    });
    expect(await repository.delete(created.id)).toBe("in_use");
    expect(
      await prisma.production.findUnique({ where: { id: created.id } }),
    ).not.toBeNull();
    expect(
      await prisma.workspace.findUnique({ where: { id: created.workspaceId } }),
    ).not.toBeNull();
    await prisma.task.delete({ where: { id: task.id } });
    expect(await repository.delete(created.id)).toBe("deleted");
  });

  it("permits exactly one concurrent lifecycle update", async () => {
    const created = await repository.create({
      name: "Race",
      productionType: "Film",
      createdById: actorId,
    });
    if (typeof created === "string") throw new Error(created);
    const results = await Promise.all([
      repository.updateStatus(created.id, "PLANNED", "ACTIVE"),
      repository.updateStatus(created.id, "PLANNED", "CANCELLED"),
    ]);
    expect(
      results.filter((result) => result === "status_changed"),
    ).toHaveLength(1);
    const winner = results.find((result) => typeof result !== "string");
    expect(winner).toBeDefined();
    expect((await repository.findById(created.id))?.status).toBe(
      typeof winner === "string" ? undefined : winner?.status,
    );
  });

  it("installs production access-pattern indexes in the isolated schema", async () => {
    const indexes = await db.query<{ indexname: string; indexdef: string }>(
      "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename IN ('productions', 'production_talents')",
      [db.schema],
    );
    const names = indexes.map((index) => index.indexname);
    expect(names).toEqual(
      expect.arrayContaining([
        "productions_workspace_id_key",
        "productions_status_idx",
        "productions_production_type_status_idx",
        "productions_deadline_at_idx",
        "productions_created_by_id_idx",
        "production_talents_production_id_talent_id_key",
        "production_talents_talent_id_idx",
      ]),
    );
  });
});
