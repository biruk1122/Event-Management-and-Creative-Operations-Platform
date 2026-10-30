import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

const MISSING = "00000000-0000-0000-0000-000000000000";

/**
 * Proves the hand-authored CHECK constraints and partial unique indexes in
 * `20261021100000_attendance_and_leave_management` actually behave as
 * intended against real Postgres - the real guarantees behind "no
 * duplicate check-in", "no check-out without a check-in", the per-grant
 * two-year leave expiry, and idempotent expiry-job retries.
 */
describe("attendance and leave schema", () => {
  let db: IsolatedDatabase;
  let counter = 0;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
  });

  afterAll(async () => {
    await db?.drop();
  });

  function unique(prefix: string): string {
    counter += 1;
    return `${prefix}-${counter}`;
  }

  async function insertUser(): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ($1) RETURNING id`,
      [`${unique("att-user")}@example.test`],
    );
    return row!.id;
  }

  async function insertKiosk(): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO attendance_kiosks (name, location_label, token_hash)
       VALUES ($1, 'Head Office', $2) RETURNING id`,
      [unique("Kiosk"), unique("token-hash")],
    );
    return row!.id;
  }

  async function insertWorkspace(): Promise<string> {
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO workspaces (kind) VALUES ('EVENT') RETURNING id`,
    );
    return row!.id;
  }

  async function insertEvent(): Promise<string> {
    const workspaceId = await insertWorkspace();
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO events (workspace_id, name, event_type) VALUES ($1, $2, 'OTHER') RETURNING id`,
      [workspaceId, unique("Attendance Event")],
    );
    return row!.id;
  }

  async function insertEventShift(
    overrides: {
      plannedStartAt?: string;
      plannedEndAt?: string;
    } = {},
  ): Promise<string> {
    const eventId = await insertEvent();
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO event_shifts
         (event_id, planned_start_at, planned_end_at, time_zone, latitude, longitude)
       VALUES ($1, $2, $3, 'Africa/Addis_Ababa', 9.03, 38.74) RETURNING id`,
      [
        eventId,
        overrides.plannedStartAt ?? "2026-11-01T18:00:00Z",
        overrides.plannedEndAt ?? "2026-11-02T02:00:00Z",
      ],
    );
    return row!.id;
  }

  async function insertPunch(
    employeeId: string,
    columns: Record<string, unknown> = {},
  ): Promise<{ id: string }> {
    const base: Record<string, unknown> = {
      employee_id: employeeId,
      method: "OFFICE_KIOSK",
      punch_type: "CHECK_IN",
      client_request_id: unique("req"),
      ...columns,
    };
    const keys = Object.keys(base);
    const values = Object.values(base);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO attendance_punches (${keys.join(", ")}) VALUES (${placeholders}) RETURNING id`,
      values,
    );
    return row!;
  }

  async function insertSession(
    employeeId: string,
    checkInPunchId: string,
    columns: Record<string, unknown> = {},
  ): Promise<{ id: string }> {
    const base: Record<string, unknown> = {
      employee_id: employeeId,
      method: "OFFICE_KIOSK",
      session_date: "2026-11-01",
      check_in_punch_id: checkInPunchId,
      ...columns,
    };
    const keys = Object.keys(base);
    const values = Object.values(base);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO attendance_sessions (${keys.join(", ")}) VALUES (${placeholders}) RETURNING id`,
      values,
    );
    return row!;
  }

  describe("attendance_kiosks", () => {
    it("creates an active kiosk by default", async () => {
      const id = await insertKiosk();
      const [row] = await db.query<{
        is_active: boolean;
        revoked_at: Date | null;
      }>(`SELECT is_active, revoked_at FROM attendance_kiosks WHERE id = $1`, [
        id,
      ]);
      expect(row!.is_active).toBe(true);
      expect(row!.revoked_at).toBeNull();
    });

    it("requires revoked_at and revoked_by_id together", async () => {
      await expect(
        db.query(
          `INSERT INTO attendance_kiosks (name, location_label, token_hash, revoked_at)
           VALUES ($1, 'Office', $2, now())`,
          [unique("Kiosk"), unique("token-hash")],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });
  });

  describe("event_shifts", () => {
    it("rejects a shift ending before it starts", async () => {
      await expect(
        insertEventShift({
          plannedStartAt: "2026-11-01T20:00:00Z",
          plannedEndAt: "2026-11-01T19:00:00Z",
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("accepts a shift that crosses midnight as one row", async () => {
      const id = await insertEventShift({
        plannedStartAt: "2026-11-01T21:00:00Z",
        plannedEndAt: "2026-11-02T03:00:00Z",
      });
      const [row] = await db.query<{
        planned_start_at: Date;
        planned_end_at: Date;
      }>(
        `SELECT planned_start_at, planned_end_at FROM event_shifts WHERE id = $1`,
        [id],
      );
      expect(row!.planned_end_at.getTime()).toBeGreaterThan(
        row!.planned_start_at.getTime(),
      );
    });
  });

  describe("attendance_punches", () => {
    it("rejects a punch declaring both a kiosk and an event shift", async () => {
      const employeeId = await insertUser();
      const kioskId = await insertKiosk();
      const shiftId = await insertEventShift();
      await expect(
        insertPunch(employeeId, { kiosk_id: kioskId, event_shift_id: shiftId }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("rejects an office-kiosk punch carrying location data", async () => {
      const employeeId = await insertUser();
      const kioskId = await insertKiosk();
      await expect(
        insertPunch(employeeId, { kiosk_id: kioskId, latitude: 9.03 }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("rejects a mobile-event punch left at NOT_APPLICABLE", async () => {
      const employeeId = await insertUser();
      const shiftId = await insertEventShift();
      await expect(
        insertPunch(employeeId, {
          method: "MOBILE_EVENT",
          kiosk_id: null,
          event_shift_id: shiftId,
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("enforces the idempotency key: the same client request cannot create two punches", async () => {
      const employeeId = await insertUser();
      const kioskId = await insertKiosk();
      const clientRequestId = unique("retry");
      await insertPunch(employeeId, {
        kiosk_id: kioskId,
        client_request_id: clientRequestId,
      });
      await expect(
        insertPunch(employeeId, {
          kiosk_id: kioskId,
          client_request_id: clientRequestId,
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    });
  });

  describe("attendance_sessions: one OPEN session per employee", () => {
    it("rejects a second OPEN session for the same employee", async () => {
      const employeeId = await insertUser();
      const kioskId = await insertKiosk();
      const firstPunch = await insertPunch(employeeId, { kiosk_id: kioskId });
      await insertSession(employeeId, firstPunch.id, { kiosk_id: kioskId });

      const secondPunch = await insertPunch(employeeId, { kiosk_id: kioskId });
      await expect(
        insertSession(employeeId, secondPunch.id, { kiosk_id: kioskId }),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    });

    it("allows a new OPEN session once the prior one is closed", async () => {
      const employeeId = await insertUser();
      const kioskId = await insertKiosk();
      const firstPunch = await insertPunch(employeeId, { kiosk_id: kioskId });
      const session = await insertSession(employeeId, firstPunch.id, {
        kiosk_id: kioskId,
      });
      await db.query(
        `UPDATE attendance_sessions SET status = 'CLOSED' WHERE id = $1`,
        [session.id],
      );

      const secondPunch = await insertPunch(employeeId, { kiosk_id: kioskId });
      await expect(
        insertSession(employeeId, secondPunch.id, { kiosk_id: kioskId }),
      ).resolves.toBeTruthy();
    });

    it("rejects a session whose method/target pairing is inconsistent", async () => {
      const employeeId = await insertUser();
      const shiftId = await insertEventShift();
      const punch = await insertPunch(employeeId, {
        method: "MOBILE_EVENT",
        kiosk_id: null,
        event_shift_id: shiftId,
        verification_result: "VERIFIED",
      });
      await expect(
        insertSession(employeeId, punch.id, {
          method: "MOBILE_EVENT",
          event_shift_id: null,
        }),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });
  });

  describe("attendance_overtime_approvals", () => {
    it("requires decided_at once a decision is made", async () => {
      const employeeId = await insertUser();
      const kioskId = await insertKiosk();
      const punch = await insertPunch(employeeId, { kiosk_id: kioskId });
      const session = await insertSession(employeeId, punch.id, {
        kiosk_id: kioskId,
      });
      await expect(
        db.query(
          `INSERT INTO attendance_overtime_approvals (attendance_session_id, potential_minutes, status)
           VALUES ($1, 30, 'APPROVED')`,
          [session.id],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });

      await expect(
        db.query(
          `INSERT INTO attendance_overtime_approvals (attendance_session_id, potential_minutes, status, decided_at, approved_minutes)
           VALUES ($1, 30, 'APPROVED', now(), 30)`,
          [session.id],
        ),
      ).resolves.toBeTruthy();
    });
  });

  describe("leave ledger and grants", () => {
    async function insertLeaveType(): Promise<string> {
      const [row] = await db.query<{ id: string }>(
        `INSERT INTO leave_types (name) VALUES ($1) RETURNING id`,
        [unique("Leave Type")],
      );
      return row!.id;
    }

    async function insertGrant(
      employeeId: string,
      leaveTypeId: string,
      days = 20,
    ): Promise<{ id: string }> {
      const [row] = await db.query<{ id: string }>(
        `INSERT INTO leave_grants (employee_id, leave_type_id, granted_days, granted_at, expires_at)
         VALUES ($1, $2, $3, now(), now() + interval '2 years') RETURNING id`,
        [employeeId, leaveTypeId, days],
      );
      return row!;
    }

    it("rejects a grant that expires before it was granted", async () => {
      const employeeId = await insertUser();
      const leaveTypeId = await insertLeaveType();
      await expect(
        db.query(
          `INSERT INTO leave_grants (employee_id, leave_type_id, granted_days, granted_at, expires_at)
           VALUES ($1, $2, 20, now(), now() - interval '1 day')`,
          [employeeId, leaveTypeId],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("rejects a CONSUMPTION ledger entry with a positive amount", async () => {
      const employeeId = await insertUser();
      const leaveTypeId = await insertLeaveType();
      const grant = await insertGrant(employeeId, leaveTypeId);
      await expect(
        db.query(
          `INSERT INTO leave_ledger_entries (employee_id, leave_type_id, grant_id, kind, amount_days)
           VALUES ($1, $2, $3, 'CONSUMPTION', 5)`,
          [employeeId, leaveTypeId, grant.id],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("accepts a correctly-signed CONSUMPTION entry and computes remaining balance", async () => {
      const employeeId = await insertUser();
      const leaveTypeId = await insertLeaveType();
      const grant = await insertGrant(employeeId, leaveTypeId, 20);
      await db.query(
        `INSERT INTO leave_ledger_entries (employee_id, leave_type_id, grant_id, kind, amount_days)
         VALUES ($1, $2, $3, 'CONSUMPTION', -5)`,
        [employeeId, leaveTypeId, grant.id],
      );
      const [row] = await db.query<{ remaining: string }>(
        `SELECT g.granted_days + COALESCE(SUM(l.amount_days), 0) AS remaining
         FROM leave_grants g
         LEFT JOIN leave_ledger_entries l ON l.grant_id = g.id
         WHERE g.id = $1
         GROUP BY g.granted_days`,
        [grant.id],
      );
      expect(Number(row!.remaining)).toBe(15);
    });

    it("allows only one EXPIRY entry per grant - the expiry job's own idempotency", async () => {
      const employeeId = await insertUser();
      const leaveTypeId = await insertLeaveType();
      const grant = await insertGrant(employeeId, leaveTypeId, 20);
      await db.query(
        `INSERT INTO leave_ledger_entries (employee_id, leave_type_id, grant_id, kind, amount_days)
         VALUES ($1, $2, $3, 'EXPIRY', -20)`,
        [employeeId, leaveTypeId, grant.id],
      );
      await expect(
        db.query(
          `INSERT INTO leave_ledger_entries (employee_id, leave_type_id, grant_id, kind, amount_days)
           VALUES ($1, $2, $3, 'EXPIRY', -5)`,
          [employeeId, leaveTypeId, grant.id],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    });
  });

  describe("leave_requests", () => {
    async function insertLeaveType(): Promise<string> {
      const [row] = await db.query<{ id: string }>(
        `INSERT INTO leave_types (name) VALUES ($1) RETURNING id`,
        [unique("Leave Type")],
      );
      return row!.id;
    }

    it("rejects an end date before the start date", async () => {
      const employeeId = await insertUser();
      const leaveTypeId = await insertLeaveType();
      await expect(
        db.query(
          `INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, days_requested)
           VALUES ($1, $2, '2026-12-05', '2026-12-01', 1)`,
          [employeeId, leaveTypeId],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("rejects a non-positive days_requested", async () => {
      const employeeId = await insertUser();
      const leaveTypeId = await insertLeaveType();
      await expect(
        db.query(
          `INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, days_requested)
           VALUES ($1, $2, '2026-12-01', '2026-12-01', 0)`,
          [employeeId, leaveTypeId],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    });

    it("requires a real employee and leave type", async () => {
      const leaveTypeId = await insertLeaveType();
      await expect(
        db.query(
          `INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, days_requested)
           VALUES ($1, $2, '2026-12-01', '2026-12-01', 1)`,
          [MISSING, leaveTypeId],
        ),
      ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    });
  });
});
