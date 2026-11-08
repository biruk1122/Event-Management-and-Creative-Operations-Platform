import { describe, expect, it } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { isOverseenRecord, oversees } from "./department-oversight";

const marketingManager: CurrentAccess = {
  userId: "mm",
  grants: [],
  role: "DEPARTMENT_MANAGER",
  department: { id: "dept-mkt", name: "Marketing", active: true },
  overseenDepartments: [{ id: "dept-promo", name: "Promotion" }],
};

describe("department oversight", () => {
  it("recognises records of an overseen department only", () => {
    expect(isOverseenRecord(marketingManager, "dept-promo")).toBe(true);
    expect(isOverseenRecord(marketingManager, "dept-mkt")).toBe(false);
    expect(isOverseenRecord(marketingManager, "dept-other")).toBe(false);
    expect(isOverseenRecord(marketingManager, null)).toBe(false);
  });

  it("treats a response without the list as overseeing nothing", () => {
    const legacy: CurrentAccess = { userId: "u", grants: [] };
    expect(isOverseenRecord(legacy, "dept-promo")).toBe(false);
    expect(oversees(legacy, "Promotion")).toBe(false);
    expect(oversees(marketingManager, "Promotion")).toBe(true);
  });
});
