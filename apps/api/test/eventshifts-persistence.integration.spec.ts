import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EventShiftsRepository } from "../src/attendance/scheduling/infrastructure/eventshifts.repository.js";
import {
  EventShiftChangeType,
  EventShiftStatus,
  PrismaClient,
} from "../src/generated/prisma/client.js";
import { OutboxRepository } from "../src/outbox/infrastructure/outbox.repository.js";
import { OutboxWriterService } from "../src/outbox/outbox-writer.service.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

/**
 * Proves `EventShiftsRepository` against real PostgreSQL: the department
 * context both authorization checks are built on, the append-only change
 * history a reschedule/cancel/reinstate leaves behind, and the subtlest
 * behavior in the module - that re-assigning a previously-unassigned
 * employee updates the same `(eventShiftId, employeeId)` row rather than
 * colliding with its own unique constraint.
 */
describe("event shift scheduling persistence", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let repository: EventShiftsRepository;

  let managerId: string;
  let employeeId: string;
  let departmentId: string;
  let eventId: string;
  let shiftId: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: db.url }, { schema: db.schema }),
    });
    const outbox = new OutboxWriterService(
      prisma as never,
      new OutboxRepository(prisma as never),
    );
    repository = new EventShiftsRepository(prisma as never, outbox);

    const department = await prisma.department.create({
      data: { name: "Production Crew" },
    });
    departmentId = department.id;

    const manager = await prisma.user.create({
      data: { email: "shift-manager@attendance.test", departmentId },
    });
    managerId = manager.id;

    const employee = await prisma.user.create({
      data: {
        email: "shift-employee@attendance.test",
        employeeProfile: {
          create: {
            employeeCode: "EMP-SHIFT-1",
            position: "Stage Hand",
            employmentType: "FULL_TIME",
            employmentDate: new Date("2024-01-01"),
            employmentStatus: "ACTIVE",
          },
        },
      },
    });
    employeeId = employee.id;

    const workspace = await prisma.workspace.create({ data: { kind: "EVENT" } });
    const event = await prisma.event.create({
      data: {
        workspaceId: workspace.id,
        name: "Launch Night",
        eventType: "OTHER",
        departmentId,
      },
    });
    eventId = event.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.drop();
  });

  it("resolves the acting manager's own department and the event's department", async () => {
    expect(await repository.findUserDepartmentId(managerId)).toBe(departmentId);
    const context = await repository.findEventContext(eventId);
    expect(context).toEqual({ id: eventId, name: "Launch Night", departmentId });
  });

  it("creates a shift and returns the event's own name and numeric geofence fields", async () => {
    const shift = await repository.create(eventId, {
      plannedStartAt: new Date("2026-11-01T18:00:00Z"),
      plannedEndAt: new Date("2026-11-02T02:00:00Z"),
      timeZone: "Africa/Addis_Ababa",
      latitude: 9.03,
      longitude: 38.74,
      createdById: managerId,
    });
    shiftId = shift.id;
    expect(shift.eventName).toBe("Launch Night");
    expect(shift.latitude).toBe(9.03);
    expect(shift.longitude).toBe(38.74);
    expect(shift.geofenceRadiusMeters).toBe(150);
    expect(shift.status).toBe("PLANNED");
  });

  it("rescheduling leaves an append-only change row with the previous and new times", async () => {
    const before = await repository.findById(shiftId);
    const updated = await repository.reschedule(shiftId, {
      plannedStartAt: new Date("2026-11-01T19:00:00Z"),
      plannedEndAt: before!.plannedEndAt,
      changeType: EventShiftChangeType.RESCHEDULE,
      previousStartAt: before!.plannedStartAt,
      previousEndAt: before!.plannedEndAt,
      reason: "Venue confirmed an hour later",
      changedById: managerId,
    });
    expect(updated.plannedStartAt.toISOString()).toBe("2026-11-01T19:00:00.000Z");

    const changes = await repository.listChanges(shiftId);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.changeType).toBe("RESCHEDULE");
    expect(changes[0]?.previousStartAt?.toISOString()).toBe(before!.plannedStartAt.toISOString());
    expect(changes[0]?.newStartAt?.toISOString()).toBe("2026-11-01T19:00:00.000Z");
    expect(changes[0]?.changedByName).toContain("shift-manager@attendance.test");

    const outboxEvents = await prisma.outboxEvent.findMany({
      where: { name: "attendance.shift.schedule_changed", resourceId: shiftId },
    });
    expect(outboxEvents).toHaveLength(1);
    expect(outboxEvents[0]?.payload).toEqual({ changeType: "RESCHEDULE" });
  });

  it("cancelling and reinstating each append their own change row", async () => {
    await repository.setStatus(shiftId, {
      status: EventShiftStatus.CANCELLED,
      changeType: EventShiftChangeType.CANCELLATION,
      reason: "Weather",
      changedById: managerId,
    });
    let shift = await repository.findById(shiftId);
    expect(shift?.status).toBe("CANCELLED");

    await repository.setStatus(shiftId, {
      status: EventShiftStatus.PLANNED,
      changeType: EventShiftChangeType.REINSTATEMENT,
      reason: "Weather cleared",
      changedById: managerId,
    });
    shift = await repository.findById(shiftId);
    expect(shift?.status).toBe("PLANNED");

    const changes = await repository.listChanges(shiftId);
    const types = changes.map((change) => change.changeType);
    expect(types).toContain("CANCELLATION");
    expect(types).toContain("REINSTATEMENT");
  });

  it("assigns, unassigns, and re-assigns the same employee without a unique-constraint collision", async () => {
    await repository.assign(shiftId, employeeId, managerId);
    let assignments = await repository.listAssignments(shiftId);
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.employeeId).toBe(employeeId);

    const outboxEvents = await prisma.outboxEvent.findMany({
      where: { name: "attendance.shift.assigned", resourceId: shiftId },
    });
    expect(outboxEvents).toHaveLength(1);
    expect(outboxEvents[0]?.payload).toEqual({ employeeId });

    const unassignResult = await repository.unassign(shiftId, employeeId, managerId);
    expect(unassignResult).toBe("unassigned");
    assignments = await repository.listAssignments(shiftId);
    expect(assignments).toHaveLength(0);

    // Re-assigning the exact same (shift, employee) pair must update the
    // existing row, not violate `@@unique([eventShiftId, employeeId])`.
    await repository.assign(shiftId, employeeId, managerId);
    assignments = await repository.listAssignments(shiftId);
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.employeeId).toBe(employeeId);
  });

  it("reports not_found when unassigning an employee with no active assignment", async () => {
    const other = await prisma.user.create({ data: { email: "never-assigned@attendance.test" } });
    const result = await repository.unassign(shiftId, other.id, managerId);
    expect(result).toBe("not_found");
  });

  it("confirms employment-status eligibility for assignment", async () => {
    expect(await repository.isActiveEmployee(employeeId)).toBe(true);
  });
});
