import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AttendanceRepository } from "../src/attendance/infrastructure/attendance.repository.js";
import { AttendanceReviewRepository } from "../src/attendance/review/infrastructure/review.repository.js";
import {
  AttendanceExceptionStatus,
  AttendanceExceptionType,
  AttendanceMethod,
  AttendanceOvertimeStatus,
  PrismaClient,
  PunchType,
} from "../src/generated/prisma/client.js";
import { OutboxRepository } from "../src/outbox/infrastructure/outbox.repository.js";
import { OutboxWriterService } from "../src/outbox/outbox-writer.service.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

/**
 * Proves `AttendanceReviewRepository` against real PostgreSQL: department
 * filtering actually joins through session->employee (overtime) and
 * employee directly (exceptions), and a decision write satisfies the
 * hand-authored `*_decision_consistency` / `*_review_consistency` CHECK
 * constraints (decided/reviewed timestamp and actor set together with the
 * terminal status).
 */
describe("attendance review persistence", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let repository: AttendanceReviewRepository;
  let attendanceRepository: AttendanceRepository;

  let managerId: string;
  let deptA: string;
  let deptB: string;
  let employeeInDeptAId: string;
  let employeeInDeptBId: string;
  let overtimeInDeptAId: string;
  let overtimeInDeptBId: string;
  let exceptionInDeptAId: string;
  let kioskId: string;

  async function openAndCloseWithOvertime(
    employeeId: string,
    suffix: string,
  ): Promise<string> {
    const checkIn = await prisma.attendancePunch.create({
      data: {
        employeeId,
        method: AttendanceMethod.OFFICE_KIOSK,
        punchType: PunchType.CHECK_IN,
        clientRequestId: `review-checkin-${suffix}`,
        kioskId,
      },
    });
    const checkOut = await prisma.attendancePunch.create({
      data: {
        employeeId,
        method: AttendanceMethod.OFFICE_KIOSK,
        punchType: PunchType.CHECK_OUT,
        clientRequestId: `review-checkout-${suffix}`,
        kioskId,
      },
    });
    const session = await prisma.attendanceSession.create({
      data: {
        employeeId,
        method: AttendanceMethod.OFFICE_KIOSK,
        kioskId,
        sessionDate: new Date("2026-11-01"),
        checkInPunchId: checkIn.id,
        checkOutPunchId: checkOut.id,
        status: "CLOSED",
        potentialOvertimeMinutes: 90,
      },
    });
    const overtime = await prisma.attendanceOvertimeApproval.create({
      data: { attendanceSessionId: session.id, potentialMinutes: 90 },
    });
    return overtime.id;
  }

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: db.url },
        { schema: db.schema },
      ),
    });
    const outbox = new OutboxWriterService(
      prisma as never,
      new OutboxRepository(prisma as never),
    );
    repository = new AttendanceReviewRepository(prisma as never, outbox);
    attendanceRepository = new AttendanceRepository(prisma as never);

    const departmentA = await prisma.department.create({
      data: { name: "Dept A" },
    });
    const departmentB = await prisma.department.create({
      data: { name: "Dept B" },
    });
    deptA = departmentA.id;
    deptB = departmentB.id;

    const manager = await prisma.user.create({
      data: { email: "review-manager@attendance.test", departmentId: deptA },
    });
    managerId = manager.id;

    const employeeA = await prisma.user.create({
      data: { email: "review-employee-a@attendance.test", departmentId: deptA },
    });
    employeeInDeptAId = employeeA.id;

    const employeeB = await prisma.user.create({
      data: { email: "review-employee-b@attendance.test", departmentId: deptB },
    });
    employeeInDeptBId = employeeB.id;

    const kiosk = await prisma.attendanceKiosk.create({
      data: {
        name: "Front Desk",
        locationLabel: "Main Office",
        tokenHash: "review-test-hash",
      },
    });
    kioskId = kiosk.id;

    overtimeInDeptAId = await openAndCloseWithOvertime(employeeInDeptAId, "a");
    overtimeInDeptBId = await openAndCloseWithOvertime(employeeInDeptBId, "b");

    const exception = await prisma.attendanceException.create({
      data: {
        employeeId: employeeInDeptAId,
        type: AttendanceExceptionType.OUT_OF_RANGE,
        description: "Recorded 500m away",
      },
    });
    exceptionInDeptAId = exception.id;

    // `createIsolatedDatabase()` truncates migration seed data by design
    // ("tests own their fixtures") - this test file seeds its own baseline
    // weekly schedule, matching the real migration's seed exactly, rather
    // than depending on that seed surviving into an isolated schema.
    await prisma.attendanceWeekdaySchedule.createMany({
      data: [
        { dayOfWeek: 0, type: "OFF", effectiveFrom: new Date("1970-01-01") },
        { dayOfWeek: 1, type: "FULL", effectiveFrom: new Date("1970-01-01") },
        { dayOfWeek: 2, type: "FULL", effectiveFrom: new Date("1970-01-01") },
        { dayOfWeek: 3, type: "FULL", effectiveFrom: new Date("1970-01-01") },
        { dayOfWeek: 4, type: "FULL", effectiveFrom: new Date("1970-01-01") },
        { dayOfWeek: 5, type: "FULL", effectiveFrom: new Date("1970-01-01") },
        { dayOfWeek: 6, type: "HALF", effectiveFrom: new Date("1970-01-01") },
      ],
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.drop();
  });

  it("resolves the acting manager's own department", async () => {
    expect(await repository.findUserDepartmentId(managerId)).toBe(deptA);
  });

  it("lists overtime scoped by the employee's department, not the reviewer's", async () => {
    const deptAItems = await repository.listOvertime({ departmentId: deptA });
    expect(deptAItems.map((item) => item.id)).toEqual([overtimeInDeptAId]);
    expect(deptAItems[0]?.employeeDepartmentId).toBe(deptA);

    const all = await repository.listOvertime({});
    expect(all.map((item) => item.id).sort()).toEqual(
      [overtimeInDeptAId, overtimeInDeptBId].sort(),
    );
  });

  it("filters overtime by status", async () => {
    const pending = await repository.listOvertime({
      status: AttendanceOvertimeStatus.PENDING,
    });
    expect(pending).toHaveLength(2);
    const approved = await repository.listOvertime({
      status: AttendanceOvertimeStatus.APPROVED,
    });
    expect(approved).toHaveLength(0);
  });

  it("decides overtime, satisfying the decision-consistency CHECK constraint", async () => {
    const decided = await repository.decideOvertime(overtimeInDeptAId, {
      status: AttendanceOvertimeStatus.APPROVED,
      approvedMinutes: 60,
      decisionReason: "Confirmed with event lead",
      decidedById: managerId,
    });
    expect(decided.status).toBe("APPROVED");
    expect(decided.approvedMinutes).toBe(60);
    expect(decided.decidedAt).not.toBeNull();
    expect(decided.decidedByName).toContain("review-manager@attendance.test");

    const refetched = await repository.findOvertimeById(overtimeInDeptAId);
    expect(refetched?.status).toBe("APPROVED");

    const outboxEvents = await prisma.outboxEvent.findMany({
      where: {
        name: "attendance.overtime.decided",
        resourceId: overtimeInDeptAId,
      },
    });
    expect(outboxEvents).toHaveLength(1);
    expect(outboxEvents[0]?.payload).toEqual({ employeeId: employeeInDeptAId });
  });

  it("lists and decides exceptions scoped by department", async () => {
    const deptAExceptions = await repository.listExceptions({
      departmentId: deptA,
    });
    expect(deptAExceptions.map((item) => item.id)).toEqual([
      exceptionInDeptAId,
    ]);

    const deptBExceptions = await repository.listExceptions({
      departmentId: deptB,
    });
    expect(deptBExceptions).toHaveLength(0);

    const decided = await repository.decideException(exceptionInDeptAId, {
      status: AttendanceExceptionStatus.REJECTED,
      reviewNote: "Device GPS was faulty - excused but flag resolved",
      reviewedById: managerId,
    });
    expect(decided.status).toBe("REJECTED");
    expect(decided.reviewedAt).not.toBeNull();
    expect(decided.reviewedByName).toContain("review-manager@attendance.test");
  });

  it("returns null for an unknown overtime or exception id", async () => {
    expect(
      await repository.findOvertimeById("00000000-0000-0000-0000-000000000000"),
    ).toBeNull();
    expect(
      await repository.findExceptionById(
        "00000000-0000-0000-0000-000000000000",
      ),
    ).toBeNull();
  });

  it("summarizes per-employee attendance totals, scoped by department", async () => {
    const deptASummary = await repository.summarize({
      startDate: new Date("2026-11-01"),
      endDate: new Date("2026-11-01"),
      departmentId: deptA,
    });
    expect(deptASummary).toHaveLength(1);
    expect(deptASummary[0]?.employeeId).toBe(employeeInDeptAId);
    expect(deptASummary[0]?.sessionsCount).toBe(1);
    expect(deptASummary[0]?.potentialOvertimeMinutes).toBe(90);
    // Approved earlier in this suite's "decides overtime" test.
    expect(deptASummary[0]?.approvedOvertimeMinutes).toBe(60);

    const deptBSummary = await repository.summarize({
      startDate: new Date("2026-11-01"),
      endDate: new Date("2026-11-01"),
      departmentId: deptB,
    });
    expect(deptBSummary).toHaveLength(1);
    expect(deptBSummary[0]?.employeeId).toBe(employeeInDeptBId);
    // Never decided - still PENDING, so it never counts toward approved minutes.
    expect(deptBSummary[0]?.approvedOvertimeMinutes).toBe(0);

    const orgWide = await repository.summarize({
      startDate: new Date("2026-11-01"),
      endDate: new Date("2026-11-01"),
    });
    expect(orgWide.length).toBeGreaterThanOrEqual(2);
  });

  describe("listSessions (detailed, cross-department)", () => {
    it("returns sessions across every department with no filter, unlike summarize", async () => {
      const sessions = await attendanceRepository.listSessions({
        startDate: new Date("2026-11-01"),
        endDate: new Date("2026-11-01"),
      });
      const employeeIds = sessions.map((session) => session.employeeId);
      expect(employeeIds).toContain(employeeInDeptAId);
      expect(employeeIds).toContain(employeeInDeptBId);
    });

    it("excludes sessions outside the date range", async () => {
      const sessions = await attendanceRepository.listSessions({
        startDate: new Date("2026-12-01"),
        endDate: new Date("2026-12-31"),
      });
      const employeeIds = sessions.map((session) => session.employeeId);
      expect(employeeIds).not.toContain(employeeInDeptAId);
      expect(employeeIds).not.toContain(employeeInDeptBId);
    });

    it("narrows to one employee when employeeId is given", async () => {
      const sessions = await attendanceRepository.listSessions({
        startDate: new Date("2026-11-01"),
        endDate: new Date("2026-11-01"),
        employeeId: employeeInDeptAId,
      });
      expect(
        sessions.every((session) => session.employeeId === employeeInDeptAId),
      ).toBe(true);
      expect(sessions.length).toBeGreaterThan(0);
    });
  });

  describe("listActiveEmployees / listPresentDates (Present/Absent reporting)", () => {
    it("lists only active employees in the given department", async () => {
      const employees = await repository.listActiveEmployees({
        departmentId: deptA,
      });
      const ids = employees.map((employee) => employee.id);
      expect(ids).toContain(managerId);
      expect(ids).toContain(employeeInDeptAId);
      expect(ids).not.toContain(employeeInDeptBId);
    });

    it("lists every active employee with no department filter", async () => {
      const employees = await repository.listActiveEmployees({});
      const ids = employees.map((employee) => employee.id);
      expect(ids).toContain(employeeInDeptAId);
      expect(ids).toContain(employeeInDeptBId);
    });

    it("excludes a deactivated employee", async () => {
      const inactive = await prisma.user.create({
        data: {
          email: "review-inactive@attendance.test",
          departmentId: deptA,
          status: "INACTIVE",
          deactivatedAt: new Date(),
        },
      });
      const employees = await repository.listActiveEmployees({
        departmentId: deptA,
      });
      expect(employees.map((employee) => employee.id)).not.toContain(
        inactive.id,
      );
    });

    it("returns the distinct session dates per employee, department-scoped", async () => {
      const map = await repository.listPresentDates({
        startDate: new Date("2026-11-01"),
        endDate: new Date("2026-11-01"),
        departmentId: deptA,
      });
      expect(map.get(employeeInDeptAId)).toEqual(new Set(["2026-11-01"]));
      expect(map.has(employeeInDeptBId)).toBe(false);
    });
  });

  describe("work calendar (weekly schedule + holidays)", () => {
    it("resolves the seeded default: Sunday off, Monday-Friday full, Saturday half", async () => {
      // 2026-11-01 Sun .. 2026-11-07 Sat.
      const workingDays = await attendanceRepository.resolveWorkingDays(
        new Date("2026-11-01"),
        new Date("2026-11-07"),
      );
      expect(workingDays.has("2026-11-01")).toBe(false);
      expect(workingDays.get("2026-11-02")).toBe("FULL");
      expect(workingDays.get("2026-11-06")).toBe("FULL");
      expect(workingDays.get("2026-11-07")).toBe("HALF");
    });

    it("a holiday overrides an otherwise-full weekday, and is listed/removable", async () => {
      const created = await attendanceRepository.createHoliday({
        date: new Date("2026-11-04"), // a Wednesday, otherwise FULL
        name: "Test Holiday",
        createdById: managerId,
      });
      if (created === "date_taken") throw new Error("unreachable - fresh date");

      const workingDays = await attendanceRepository.resolveWorkingDays(
        new Date("2026-11-03"),
        new Date("2026-11-05"),
      );
      expect(workingDays.has("2026-11-03")).toBe(true);
      expect(workingDays.has("2026-11-04")).toBe(false);
      expect(workingDays.has("2026-11-05")).toBe(true);

      const holidays = await attendanceRepository.listHolidays();
      expect(holidays.map((holiday) => holiday.id)).toContain(created.id);
      expect(
        holidays.find((holiday) => holiday.id === created.id)?.createdByName,
      ).toContain("review-manager@attendance.test");

      expect(await attendanceRepository.removeHoliday(created.id)).toBe(true);
      const afterRemoval = await attendanceRepository.resolveWorkingDays(
        new Date("2026-11-04"),
        new Date("2026-11-04"),
      );
      expect(afterRemoval.has("2026-11-04")).toBe(true);
    });

    it("rejects a duplicate holiday date on create and on update as a clean conflict, never a raw 500", async () => {
      const first = await attendanceRepository.createHoliday({
        date: new Date("2027-05-01"),
        name: "Labour Day",
      });
      if (first === "date_taken") throw new Error("unreachable - fresh date");

      const second = await attendanceRepository.createHoliday({
        date: new Date("2027-05-01"),
        name: "Duplicate",
      });
      expect(second).toBe("date_taken");

      const other = await attendanceRepository.createHoliday({
        date: new Date("2027-05-02"),
        name: "Other Day",
      });
      if (other === "date_taken") throw new Error("unreachable - fresh date");
      expect(
        await attendanceRepository.updateHoliday(other.id, {
          date: new Date("2027-05-01"),
        }),
      ).toBe("date_taken");
    });

    it("returns not_found for an unknown or already-removed holiday", async () => {
      const missing = "00000000-0000-0000-0000-000000000000";
      expect(
        await attendanceRepository.updateHoliday(missing, { name: "x" }),
      ).toBe("not_found");
      expect(await attendanceRepository.removeHoliday(missing)).toBe(false);
    });

    it("a weekday schedule change with a future effectiveFrom does not rewrite a report range entirely before it, and a straddling range resolves each date independently", async () => {
      await attendanceRepository.createWeekdaySchedule({
        dayOfWeek: 6, // Saturday
        type: "OFF",
        effectiveFrom: new Date("2027-03-01"),
      });

      const beforeChange = await attendanceRepository.resolveWorkingDays(
        new Date("2027-02-01"),
        new Date("2027-02-28"),
      );
      for (const saturday of [
        "2027-02-06",
        "2027-02-13",
        "2027-02-20",
        "2027-02-27",
      ]) {
        expect(beforeChange.get(saturday)).toBe("HALF");
      }

      const afterChange = await attendanceRepository.resolveWorkingDays(
        new Date("2027-03-01"),
        new Date("2027-03-31"),
      );
      for (const saturday of [
        "2027-03-06",
        "2027-03-13",
        "2027-03-20",
        "2027-03-27",
      ]) {
        expect(afterChange.has(saturday)).toBe(false);
      }

      const straddling = await attendanceRepository.resolveWorkingDays(
        new Date("2027-02-20"),
        new Date("2027-03-10"),
      );
      expect(straddling.get("2027-02-20")).toBe("HALF"); // before the change
      expect(straddling.get("2027-02-27")).toBe("HALF"); // before the change
      expect(straddling.has("2027-03-06")).toBe(false); // after the change
    });

    it("maps an already-effective weekday change to a clean conflict, never a raw 500", async () => {
      const result = await attendanceRepository.createWeekdaySchedule({
        dayOfWeek: 2,
        type: "OFF",
        effectiveFrom: new Date("2027-06-01"),
      });
      expect(result).not.toBe("already_effective");
      const duplicate = await attendanceRepository.createWeekdaySchedule({
        dayOfWeek: 2,
        type: "FULL",
        effectiveFrom: new Date("2027-06-01"),
      });
      expect(duplicate).toBe("already_effective");
    });
  });
});
