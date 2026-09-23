import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "../src/generated/prisma/client.js";
import { ProductionsRepository } from "../src/productions/infrastructure/productions.repository.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

describe("production management persistence", () => {
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
});
