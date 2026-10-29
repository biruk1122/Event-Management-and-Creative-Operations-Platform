import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LeaveTypesRepository } from "../src/leave/infrastructure/leave-types.repository.js";
import { PrismaClient } from "../src/generated/prisma/client.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

describe("leave type persistence", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let repository: LeaveTypesRepository;
  let adminId: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: db.url }, { schema: db.schema }),
    });
    repository = new LeaveTypesRepository(prisma as never);
    const admin = await prisma.user.create({ data: { email: "leave-type-admin@attendance.test" } });
    adminId = admin.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.drop();
  });

  it("creates a leave type with its defaults", async () => {
    const result = await repository.create({ name: "Sick Leave", createdById: adminId });
    if (result === "name_taken") throw new Error("unexpected");
    const type = result;
    expect(type.isPaid).toBe(true);
    expect(type.requiresDocumentation).toBe(false);
    expect(type.requiresApproval).toBe(true);
    expect(type.isActive).toBe(true);
  });

  it("rejects a duplicate name with name_taken, not a thrown error", async () => {
    const result = await repository.create({ name: "Sick Leave", createdById: adminId });
    expect(result).toBe("name_taken");
  });

  it("lists active-only by default and all when includeInactive is true", async () => {
    const created = await repository.create({ name: "Unpaid Leave", createdById: adminId });
    if (created === "name_taken") throw new Error("unexpected");
    await repository.update(created.id, { isActive: false });

    const activeOnly = await repository.list(false);
    expect(activeOnly.some((type) => type.name === "Unpaid Leave")).toBe(false);

    const all = await repository.list(true);
    expect(all.some((type) => type.name === "Unpaid Leave")).toBe(true);
  });

  it("updates fields and clears a nullable field with an explicit null", async () => {
    const created = await repository.create({
      name: "Bereavement Leave",
      description: "Original",
      createdById: adminId,
    });
    if (created === "name_taken") throw new Error("unexpected");

    const updated = await repository.update(created.id, { description: null, isPaid: false });
    expect(updated.description).toBeNull();
    expect(updated.isPaid).toBe(false);
  });

  it("returns null for an unknown id", async () => {
    expect(await repository.findById("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
