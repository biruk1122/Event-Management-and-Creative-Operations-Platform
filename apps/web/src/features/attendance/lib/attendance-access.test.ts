import { describe, expect, it } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { attendanceAbilities } from "./attendance-access";

function access(overrides: Partial<CurrentAccess> = {}): CurrentAccess {
  return {
    userId: "user-1",
    role: null,
    department: null,
    grants: [
      { permissionKey: "attendance.reports.read", scope: "ORGANIZATION" },
    ],
    ...overrides,
  };
}

describe("attendanceAbilities", () => {
  describe("canReadDetailedSessions", () => {
    it("is true for Super Admin holding the grant", () => {
      expect(
        attendanceAbilities(access({ role: "SUPER_ADMIN" }))
          .canReadDetailedSessions,
      ).toBe(true);
    });

    it("is true for the HR & Executive Officer department's own manager", () => {
      expect(
        attendanceAbilities(
          access({
            role: "DEPARTMENT_MANAGER",
            department: {
              id: "dept-hr",
              name: "HR & Executive Officer",
              active: true,
            },
            grants: [
              { permissionKey: "attendance.reports.read", scope: "DEPARTMENT" },
            ],
          }),
        ).canReadDetailedSessions,
      ).toBe(true);
    });

    it("is false for a non-HR department manager holding the same grant", () => {
      expect(
        attendanceAbilities(
          access({
            role: "DEPARTMENT_MANAGER",
            department: {
              id: "dept-marketing",
              name: "Marketing",
              active: true,
            },
            grants: [
              { permissionKey: "attendance.reports.read", scope: "DEPARTMENT" },
            ],
          }),
        ).canReadDetailedSessions,
      ).toBe(false);
    });

    it("is false when the HR department is inactive", () => {
      expect(
        attendanceAbilities(
          access({
            role: "DEPARTMENT_MANAGER",
            department: {
              id: "dept-hr",
              name: "HR & Executive Officer",
              active: false,
            },
            grants: [
              { permissionKey: "attendance.reports.read", scope: "DEPARTMENT" },
            ],
          }),
        ).canReadDetailedSessions,
      ).toBe(false);
    });

    it("is false without the underlying reports permission at all", () => {
      expect(
        attendanceAbilities(access({ role: "SUPER_ADMIN", grants: [] }))
          .canReadDetailedSessions,
      ).toBe(false);
    });
  });

  describe("canManageCalendar", () => {
    it("is true for Super Admin holding the grant", () => {
      expect(
        attendanceAbilities(
          access({
            role: "SUPER_ADMIN",
            grants: [
              {
                permissionKey: "attendance.calendar.manage",
                scope: "ORGANIZATION",
              },
            ],
          }),
        ).canManageCalendar,
      ).toBe(true);
    });

    it("is true for the HR & Executive Officer department's own manager", () => {
      expect(
        attendanceAbilities(
          access({
            role: "DEPARTMENT_MANAGER",
            department: {
              id: "dept-hr",
              name: "HR & Executive Officer",
              active: true,
            },
            grants: [
              {
                permissionKey: "attendance.calendar.manage",
                scope: "DEPARTMENT",
              },
            ],
          }),
        ).canManageCalendar,
      ).toBe(true);
    });

    it("is false for a non-HR department manager holding the same grant", () => {
      expect(
        attendanceAbilities(
          access({
            role: "DEPARTMENT_MANAGER",
            department: {
              id: "dept-marketing",
              name: "Marketing",
              active: true,
            },
            grants: [
              {
                permissionKey: "attendance.calendar.manage",
                scope: "DEPARTMENT",
              },
            ],
          }),
        ).canManageCalendar,
      ).toBe(false);
    });

    it("is false for an HR department member, not just a non-HR manager", () => {
      expect(
        attendanceAbilities(
          access({
            role: "DEPARTMENT_MEMBER",
            department: {
              id: "dept-hr",
              name: "HR & Executive Officer",
              active: true,
            },
            grants: [
              {
                permissionKey: "attendance.calendar.manage",
                scope: "DEPARTMENT",
              },
            ],
          }),
        ).canManageCalendar,
      ).toBe(false);
    });

    it("is false when the HR department is inactive", () => {
      expect(
        attendanceAbilities(
          access({
            role: "DEPARTMENT_MANAGER",
            department: {
              id: "dept-hr",
              name: "HR & Executive Officer",
              active: false,
            },
            grants: [
              {
                permissionKey: "attendance.calendar.manage",
                scope: "DEPARTMENT",
              },
            ],
          }),
        ).canManageCalendar,
      ).toBe(false);
    });

    it("is false without the underlying calendar permission at all", () => {
      expect(
        attendanceAbilities(access({ role: "SUPER_ADMIN", grants: [] }))
          .canManageCalendar,
      ).toBe(false);
    });
  });
});
