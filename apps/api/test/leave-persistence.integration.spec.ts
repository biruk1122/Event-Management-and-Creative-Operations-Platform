import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LeaveRepository } from "../src/leave/infrastructure/leave.repository.js";
import { twoYearsLater } from "../src/leave/leave-balance.js";
import {
  LeaveRequestStatus,
  PrismaClient,
} from "../src/generated/prisma/client.js";
import { OutboxRepository } from "../src/outbox/infrastructure/outbox.repository.js";
import { OutboxWriterService } from "../src/outbox/outbox-writer.service.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

/**
 * Proves `LeaveRepository` against real PostgreSQL: the ledger is really
 * the source of truth for a grant's remaining balance (not the immutable
 * `grantedDays` column), FIFO consumption actually draws oldest-grant-first
 * and spills into the next grant when one runs short, a grant past its own
 * `expiresAt` is excluded from both balance and consumption even though no
 * expiry job has touched it yet, and the leave-request decision write
 * satisfies the hand-authored `leave_requests_review_consistency` CHECK.
 */
describe("leave management persistence", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let repository: LeaveRepository;

  let employeeId: string;
  let managerId: string;
  let departmentId: string;
  let leaveTypeId: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: db.url }, { schema: db.schema }),
    });
    const outbox = new OutboxWriterService(
      prisma as never,
      new OutboxRepository(prisma as never),
    );
    repository = new LeaveRepository(prisma as never, outbox);

    const department = await prisma.department.create({ data: { name: "Leave Dept" } });
    departmentId = department.id;

    const employee = await prisma.user.create({
      data: {
        email: "leave-employee@attendance.test",
        departmentId,
        employeeProfile: {
          create: {
            employeeCode: "EMP-LEAVE-1",
            position: "Coordinator",
            employmentType: "FULL_TIME",
            employmentDate: new Date("2024-01-01"),
            employmentStatus: "ACTIVE",
          },
        },
      },
    });
    employeeId = employee.id;

    const manager = await prisma.user.create({
      data: { email: "leave-manager@attendance.test", departmentId },
    });
    managerId = manager.id;

    const leaveType = await prisma.leaveType.create({ data: { name: "Annual Leave" } });
    leaveTypeId = leaveType.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.drop();
  });

  it("confirms employment eligibility and department resolution", async () => {
    expect(await repository.isActiveEmployee(employeeId)).toBe(true);
    expect(await repository.findUserDepartmentId(managerId)).toBe(departmentId);
  });

  it("writes a GRANT ledger entry that is the actual source of the remaining balance", async () => {
    const grantedAt = new Date("2026-01-01T00:00:00Z");
    const grant = await repository.createGrant({
      employeeId,
      leaveTypeId,
      grantedDays: 10,
      grantedAt,
      expiresAt: twoYearsLater(grantedAt),
      createdById: managerId,
    });
    expect(grant.remaining).toBe(10);

    const ledgerCount = await prisma.leaveLedgerEntry.count({
      where: { grantId: grant.id, kind: "GRANT", amountDays: 10 },
    });
    expect(ledgerCount).toBe(1);

    const balance = await repository.computeBalance(employeeId, leaveTypeId, new Date("2026-06-01"));
    expect(balance.totalRemaining).toBe(10);
  });

  it("consumes FIFO: drains the older grant before touching the newer one", async () => {
    const older = await repository.createGrant({
      employeeId,
      leaveTypeId,
      grantedDays: 3,
      grantedAt: new Date("2025-01-01T00:00:00Z"),
      expiresAt: twoYearsLater(new Date("2025-01-01T00:00:00Z")),
      createdById: managerId,
    });
    const newer = await repository.createGrant({
      employeeId,
      leaveTypeId,
      grantedDays: 10,
      grantedAt: new Date("2025-06-01T00:00:00Z"),
      expiresAt: twoYearsLater(new Date("2025-06-01T00:00:00Z")),
      createdById: managerId,
    });

    const request = await repository.createRequest({
      employeeId,
      leaveTypeId,
      startDate: new Date("2026-02-01"),
      endDate: new Date("2026-02-05"),
      daysRequested: 5,
    });

    const result = await repository.consumeForRequest({
      employeeId,
      leaveTypeId,
      daysToConsume: 5,
      leaveRequestId: request.id,
      createdById: managerId,
      asOf: new Date("2026-02-01"),
    });
    expect(result).toBe("consumed");

    const olderEntries = await prisma.leaveLedgerEntry.findMany({
      where: { grantId: older.id, kind: "CONSUMPTION" },
    });
    expect(olderEntries.map((entry) => entry.amountDays)).toEqual([-3]);

    const newerEntries = await prisma.leaveLedgerEntry.findMany({
      where: { grantId: newer.id, kind: "CONSUMPTION" },
    });
    expect(newerEntries.map((entry) => entry.amountDays)).toEqual([-2]);
  });

  it("excludes a grant past its own expiresAt from balance and consumption", async () => {
    const employee2 = await prisma.user.create({ data: { email: "leave-employee-2@attendance.test" } });
    await repository.createGrant({
      employeeId: employee2.id,
      leaveTypeId,
      grantedDays: 5,
      grantedAt: new Date("2022-01-01T00:00:00Z"),
      expiresAt: new Date("2024-01-01T00:00:00Z"), // already in the past relative to asOf below
      createdById: managerId,
    });

    const balance = await repository.computeBalance(employee2.id, leaveTypeId, new Date("2026-01-01"));
    expect(balance.totalRemaining).toBe(0);

    const request = await repository.createRequest({
      employeeId: employee2.id,
      leaveTypeId,
      startDate: new Date("2026-03-01"),
      endDate: new Date("2026-03-01"),
      daysRequested: 1,
    });
    const result = await repository.consumeForRequest({
      employeeId: employee2.id,
      leaveTypeId,
      daysToConsume: 1,
      leaveRequestId: request.id,
      createdById: managerId,
      asOf: new Date("2026-01-01"),
    });
    expect(result).toBe("insufficient_balance");
  });

  it("detects an overlapping pending/approved request but not a withdrawn one", async () => {
    const employee3 = await prisma.user.create({ data: { email: "leave-employee-3@attendance.test" } });
    const first = await repository.createRequest({
      employeeId: employee3.id,
      leaveTypeId,
      startDate: new Date("2026-07-10"),
      endDate: new Date("2026-07-15"),
      daysRequested: 6,
    });

    expect(
      await repository.hasOverlappingRequest(
        employee3.id,
        new Date("2026-07-12"),
        new Date("2026-07-20"),
      ),
    ).toBe(true);

    await repository.withdrawRequest(first.id);

    expect(
      await repository.hasOverlappingRequest(
        employee3.id,
        new Date("2026-07-12"),
        new Date("2026-07-20"),
      ),
    ).toBe(false);
  });

  it("hasApprovedLeaveOverlap only counts an actually-APPROVED request - the attendance integration point", async () => {
    const employee3b = await prisma.user.create({ data: { email: "leave-employee-3b@attendance.test" } });
    const pending = await repository.createRequest({
      employeeId: employee3b.id,
      leaveTypeId,
      startDate: new Date("2026-10-10"),
      endDate: new Date("2026-10-12"),
      daysRequested: 3,
    });

    expect(
      await repository.hasApprovedLeaveOverlap(
        employee3b.id,
        new Date("2026-10-11"),
        new Date("2026-10-11"),
      ),
    ).toBe(false); // still PENDING - not yet excused

    await repository.decideRequest(pending.id, {
      status: LeaveRequestStatus.APPROVED,
      reviewedById: managerId,
    });

    expect(
      await repository.hasApprovedLeaveOverlap(
        employee3b.id,
        new Date("2026-10-11"),
        new Date("2026-10-11"),
      ),
    ).toBe(true);

    expect(
      await repository.hasApprovedLeaveOverlap(
        employee3b.id,
        new Date("2026-11-01"),
        new Date("2026-11-02"),
      ),
    ).toBe(false); // outside the approved range
  });

  it("satisfies the review-consistency CHECK when deciding a request", async () => {
    const employee4 = await prisma.user.create({ data: { email: "leave-employee-4@attendance.test" } });
    const request = await repository.createRequest({
      employeeId: employee4.id,
      leaveTypeId,
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-09-01"),
      daysRequested: 1,
    });

    const decided = await repository.decideRequest(request.id, {
      status: LeaveRequestStatus.APPROVED,
      reviewedById: managerId,
      reviewNote: "Approved",
    });
    expect(decided.status).toBe("APPROVED");
    expect(decided.reviewedAt).not.toBeNull();
    expect(decided.reviewedByName).toContain("leave-manager@attendance.test");

    const submitted = await prisma.outboxEvent.findMany({
      where: { name: "leave.request.submitted", resourceId: request.id },
    });
    expect(submitted).toHaveLength(1);
    expect(submitted[0]?.payload).toEqual({ employeeId: employee4.id });

    const decidedEvents = await prisma.outboxEvent.findMany({
      where: { name: "leave.request.decided", resourceId: request.id },
    });
    expect(decidedEvents).toHaveLength(1);
    expect(decidedEvents[0]?.payload).toEqual({ employeeId: employee4.id });
  });

  it("lists only APPROVED requests overlapping the given range for the calendar", async () => {
    const employee5 = await prisma.user.create({ data: { email: "leave-employee-5@attendance.test" } });
    const approved = await repository.createRequest({
      employeeId: employee5.id,
      leaveTypeId,
      startDate: new Date("2026-08-10"),
      endDate: new Date("2026-08-12"),
      daysRequested: 3,
    });
    await repository.decideRequest(approved.id, { status: LeaveRequestStatus.APPROVED, reviewedById: managerId });

    const pending = await repository.createRequest({
      employeeId: employee5.id,
      leaveTypeId,
      startDate: new Date("2026-08-20"),
      endDate: new Date("2026-08-21"),
      daysRequested: 2,
    });

    const calendar = await repository.listApprovedInRange({
      startDate: new Date("2026-08-01"),
      endDate: new Date("2026-08-31"),
      employeeId: employee5.id,
    });
    expect(calendar.map((item) => item.id)).toEqual([approved.id]);
    expect(calendar.map((item) => item.id)).not.toContain(pending.id);
  });

  describe("daily expiry job support", () => {
    it("finds a past-due grant with an unconsumed remainder and excludes one with none", async () => {
      const employee6 = await prisma.user.create({ data: { email: "leave-employee-6@attendance.test" } });
      // FIFO always drains the oldest grant first, so the fully-consumed
      // grant here must be the older of the two to actually end up at zero.
      const fullyConsumed = await repository.createGrant({
        employeeId: employee6.id,
        leaveTypeId,
        grantedDays: 2,
        grantedAt: new Date("2024-01-01T00:00:00Z"),
        expiresAt: new Date("2026-01-01T00:00:00Z"),
        createdById: managerId,
      });
      const due = await repository.createGrant({
        employeeId: employee6.id,
        leaveTypeId,
        grantedDays: 4,
        grantedAt: new Date("2024-02-01T00:00:00Z"),
        expiresAt: new Date("2026-02-01T00:00:00Z"),
        createdById: managerId,
      });
      const req = await repository.createRequest({
        employeeId: employee6.id,
        leaveTypeId,
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-01-02"),
        daysRequested: 2,
      });
      await repository.consumeForRequest({
        employeeId: employee6.id,
        leaveTypeId,
        daysToConsume: 2,
        leaveRequestId: req.id,
        createdById: managerId,
        asOf: new Date("2025-01-01"),
      });

      const candidates = await repository.findExpiringGrants(new Date("2026-06-01"));
      const candidateIds = candidates.map((candidate) => candidate.id);
      expect(candidateIds).toContain(due.id);
      expect(candidateIds).not.toContain(fullyConsumed.id);
      expect(candidates.find((candidate) => candidate.id === due.id)?.remaining).toBe(4);
    });

    it("excludes a grant that has not yet reached its own expiresAt", async () => {
      const employee7 = await prisma.user.create({ data: { email: "leave-employee-7@attendance.test" } });
      const notYetDue = await repository.createGrant({
        employeeId: employee7.id,
        leaveTypeId,
        grantedDays: 5,
        grantedAt: new Date("2026-01-01T00:00:00Z"),
        expiresAt: new Date("2028-01-01T00:00:00Z"),
        createdById: managerId,
      });
      const candidates = await repository.findExpiringGrants(new Date("2026-06-01"));
      expect(candidates.map((candidate) => candidate.id)).not.toContain(notYetDue.id);
    });

    it("expires a grant's remainder exactly once, idempotent on retry", async () => {
      const employee8 = await prisma.user.create({ data: { email: "leave-employee-8@attendance.test" } });
      const grant = await repository.createGrant({
        employeeId: employee8.id,
        leaveTypeId,
        grantedDays: 6,
        grantedAt: new Date("2024-01-01T00:00:00Z"),
        expiresAt: new Date("2026-01-01T00:00:00Z"),
        createdById: managerId,
      });

      const first = await repository.expireGrant({
        grantId: grant.id,
        employeeId: employee8.id,
        leaveTypeId,
        amountDays: 6,
      });
      expect(first).toBe("expired");

      const second = await repository.expireGrant({
        grantId: grant.id,
        employeeId: employee8.id,
        leaveTypeId,
        amountDays: 6,
      });
      expect(second).toBe("already_expired");

      const expiryEntries = await prisma.leaveLedgerEntry.count({
        where: { grantId: grant.id, kind: "EXPIRY" },
      });
      expect(expiryEntries).toBe(1);

      const balance = await repository.computeBalance(employee8.id, leaveTypeId, new Date("2027-01-01"));
      const thisGrant = balance.grants.find((entry) => entry.grantId === grant.id);
      expect(thisGrant).toBeUndefined(); // excluded entirely once past its own expiresAt
    });
  });
});
