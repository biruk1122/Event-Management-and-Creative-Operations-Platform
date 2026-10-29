import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuthAuditService } from "../src/auth/auth-audit.service.js";
import { AuthService } from "../src/auth/auth.service.js";
import { PasswordHasher } from "../src/auth/domain/password-hasher.js";
import { AuthRepository } from "../src/auth/infrastructure/auth.repository.js";
import { AttendanceRepository } from "../src/attendance/infrastructure/attendance.repository.js";
import { KioskRepository } from "../src/attendance/kiosk/infrastructure/kiosk.repository.js";
import {
  generateKioskToken,
  hashKioskToken,
  kioskTokenHashEquals,
} from "../src/attendance/kiosk/kiosk-token.js";
import type { Environment } from "../src/config/environment.js";
import {
  AttendanceMethod,
  AttendanceVerificationResult,
  PrismaClient,
} from "../src/generated/prisma/client.js";
import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

const environment = {
  AUTH_MAX_FAILED_ATTEMPTS: 5,
  AUTH_LOCKOUT_DURATION_MS: 60_000,
  AUTH_REFRESH_TOKEN_TTL: "30d",
} as unknown as Environment;

const PASSWORD = "correct horse battery staple";
const fakeRequest = { ip: "203.0.113.7", get: () => "vitest" } as never;

/**
 * Proves the office-kiosk attendance flow end to end against real
 * PostgreSQL: register a kiosk, prove its bearer secret is never stored in
 * the clear, search for an active employee, verify their real account
 * password through the exact same lockout-protected path `login` uses, then
 * check in/out through `AttendanceRepository` - including the two
 * invariants that only the database itself can actually prove: the
 * partial-unique-index-backed rejection of a second open session, and the
 * `clientRequestId` idempotency that makes a retried punch safe.
 */
describe("attendance kiosk persistence", () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;
  let kiosks: KioskRepository;
  let attendance: AttendanceRepository;
  let auth: AuthService;
  let employeeId: string;
  let kioskId: string;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: db.url }, { schema: db.schema }),
    });
    kiosks = new KioskRepository(prisma as never);
    attendance = new AttendanceRepository(prisma as never);
    auth = new AuthService(
      environment,
      new AuthRepository(prisma as never),
      new PasswordHasher(),
      undefined as never,
      undefined as never,
      new AuthAuditService(),
    );

    const passwordHash = await new PasswordHasher().hash(PASSWORD);
    const user = await prisma.user.create({
      data: {
        email: "kiosk-employee@attendance.test",
        firstName: "Kios",
        lastName: "Employee",
        status: "ACTIVE",
        credential: { create: { passwordHash } },
        employeeProfile: {
          create: {
            employeeCode: "EMP-KIOSK-1",
            position: "Technician",
            employmentType: "FULL_TIME",
            employmentDate: new Date("2024-01-01"),
            employmentStatus: "ACTIVE",
          },
        },
      },
    });
    employeeId = user.id;

    const admin = await prisma.user.create({
      data: { email: "kiosk-admin@attendance.test", status: "ACTIVE" },
    });

    const token = generateKioskToken();
    const kiosk = await kiosks.create({
      name: "Front Desk",
      locationLabel: "Main Office",
      tokenHash: hashKioskToken(token),
      createdById: admin.id,
    });
    kioskId = kiosk.id;
    (globalThis as { __kioskToken?: string }).__kioskToken = token;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.drop();
  });

  it("registers a kiosk and stores only a digest of its bearer secret, never the plaintext", async () => {
    const token = (globalThis as { __kioskToken?: string }).__kioskToken!;
    const auth = await kiosks.findAuthById(kioskId);
    expect(auth?.tokenHash).not.toBe(token);
    expect(kioskTokenHashEquals(hashKioskToken(token), auth!.tokenHash)).toBe(
      true,
    );
    expect(kioskTokenHashEquals(hashKioskToken("wrong"), auth!.tokenHash)).toBe(
      false,
    );
  });

  it("finds the registered employee as active and searchable by name", async () => {
    expect(await kiosks.isActiveEmployee(employeeId)).toBe(true);
    const results = await kiosks.searchEmployees("Kios", 20);
    expect(results).toEqual([{ id: employeeId, name: "Kios Employee" }]);
  });

  it("rejects an employee whose employment status is not ACTIVE", async () => {
    const inactive = await prisma.user.create({
      data: {
        email: "inactive@attendance.test",
        status: "ACTIVE",
        employeeProfile: {
          create: {
            employeeCode: "EMP-KIOSK-2",
            position: "Technician",
            employmentType: "FULL_TIME",
            employmentDate: new Date("2024-01-01"),
            employmentStatus: "INACTIVE",
          },
        },
      },
    });
    expect(await kiosks.isActiveEmployee(inactive.id)).toBe(false);
  });

  it("verifies the employee's real account password through the lockout-protected path", async () => {
    const account = await prisma.userCredential.findUnique({
      where: { userId: employeeId },
    });
    const accountView = {
      userId: employeeId,
      email: "kiosk-employee@attendance.test",
      status: "ACTIVE" as const,
      credentialId: account!.id,
      passwordHash: account!.passwordHash,
      failedAttemptCount: account!.failedAttemptCount,
      lockedUntil: account!.lockedUntil,
    };
    await expect(
      auth.verifyAccountPassword(fakeRequest, accountView, PASSWORD),
    ).resolves.toBeUndefined();
    await expect(
      auth.verifyAccountPassword(fakeRequest, accountView, "wrong-password"),
    ).rejects.toThrow();
  });

  it("checks in, rejects a duplicate open session, is idempotent on retry, then checks out", async () => {
    const clientRequestId = "kiosk-checkin-1";
    const checkIn = await attendance.checkIn({
      employeeId,
      method: AttendanceMethod.OFFICE_KIOSK,
      kioskId,
      clientRequestId,
      verificationResult: AttendanceVerificationResult.NOT_APPLICABLE,
    });
    if (checkIn === "already_checked_in") throw new Error("unexpected");
    expect(checkIn.status).toBe("OPEN");

    const duplicate = await attendance.checkIn({
      employeeId,
      method: AttendanceMethod.OFFICE_KIOSK,
      kioskId,
      clientRequestId: "kiosk-checkin-2",
      verificationResult: AttendanceVerificationResult.NOT_APPLICABLE,
    });
    expect(duplicate).toBe("already_checked_in");

    const retried = await attendance.checkIn({
      employeeId,
      method: AttendanceMethod.OFFICE_KIOSK,
      kioskId,
      clientRequestId,
      verificationResult: AttendanceVerificationResult.NOT_APPLICABLE,
    });
    if (retried === "already_checked_in") throw new Error("unexpected");
    expect(retried.id).toBe(checkIn.id);

    const open = await attendance.findOpenSession(employeeId);
    expect(open?.id).toBe(checkIn.id);

    const checkOut = await attendance.checkOut({
      employeeId,
      clientRequestId: "kiosk-checkout-1",
      verificationResult: AttendanceVerificationResult.NOT_APPLICABLE,
    });
    if (checkOut === "no_open_session") throw new Error("unexpected");
    expect(checkOut.id).toBe(checkIn.id);
    expect(checkOut.status).toBe("CLOSED");
    expect(checkOut.checkOutAt).not.toBeNull();

    expect(await attendance.findOpenSession(employeeId)).toBeNull();
  });

  it("rejects a check-out attempt with no open session", async () => {
    const result = await attendance.checkOut({
      employeeId,
      clientRequestId: "kiosk-checkout-2",
      verificationResult: AttendanceVerificationResult.NOT_APPLICABLE,
    });
    expect(result).toBe("no_open_session");
  });

  it("lists the employee's own recent sessions, most recent first", async () => {
    const sessions = await attendance.listSessionsForEmployee(employeeId, 25);
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    expect(sessions[0]?.employeeId).toBe(employeeId);
    expect(sessions[0]?.status).toBe("CLOSED");
  });

  it("revoking the kiosk makes its bearer secret unusable going forward", async () => {
    const revoked = await kiosks.revoke(kioskId, employeeId);
    expect(revoked).toBe("revoked");
    expect(await kiosks.findAuthById(kioskId)).toBeNull();
  });
});
