import { Injectable } from "@nestjs/common";
import type { Request } from "express";

import { AuditWriterService } from "../../audit/audit-writer.service.js";
import { AuthService } from "../../auth/auth.service.js";
import { AuthRepository } from "../../auth/infrastructure/auth.repository.js";
import {
  AuditActorKind,
  AuditOutcome,
  AttendanceMethod,
  AttendanceVerificationResult,
} from "../../generated/prisma/client.js";
import {
  attendanceAlreadyCheckedIn,
  attendanceEmployeeNotFound,
  attendanceKioskSessionExpired,
  attendanceNoOpenSession,
} from "../attendance.errors.js";
import { AttendanceRepository } from "../infrastructure/attendance.repository.js";
import type { KioskPunchDto } from "./dto/kiosk-punch.dto.js";
import type { KioskVerifyDto } from "./dto/kiosk-verify.dto.js";
import { KioskRepository } from "./infrastructure/kiosk.repository.js";
import { KioskSessionTokenService } from "./kiosk-session-token.service.js";
import type {
  KioskEmployeeOption,
  KioskPunchResponse,
  KioskVerifyResponse,
} from "./kiosk.contracts.js";

const SESSION_TOKEN_TTL_MS = 90_000;

/**
 * The kiosk's own session flow: find yourself, prove it with your account
 * password (never a PIN alone), then punch. `AuthService.verifyAccountPassword`
 * is the exact same lockout/attempt-tracking check `login` uses - this
 * never re-implements a weaker version of it. The password itself is never
 * held past the `/verify` call; `KioskSessionTokenService` issues a
 * stateless, 90-second proof that a punch may ride on instead.
 */
@Injectable()
export class KioskSessionService {
  constructor(
    private readonly kiosks: KioskRepository,
    private readonly authRepository: AuthRepository,
    private readonly authService: AuthService,
    private readonly attendance: AttendanceRepository,
    private readonly sessionTokens: KioskSessionTokenService,
    private readonly audit: AuditWriterService,
  ) {}

  async searchEmployees(search?: string): Promise<KioskEmployeeOption[]> {
    return this.kiosks.searchEmployees(search?.trim(), 20);
  }

  async verify(
    request: Request,
    kioskId: string,
    dto: KioskVerifyDto,
  ): Promise<KioskVerifyResponse> {
    const isEligible = await this.kiosks.isActiveEmployee(dto.employeeId);
    if (!isEligible) throw attendanceEmployeeNotFound();

    const account = await this.authRepository.findAccountByUserId(
      dto.employeeId,
    );
    await this.authService.verifyAccountPassword(
      request,
      account,
      dto.password,
    );

    const employeeName = await this.kiosks.getEmployeeName(dto.employeeId);
    const openSession = await this.attendance.findOpenSession(dto.employeeId);
    const sessionToken = await this.sessionTokens.issue({
      employeeId: dto.employeeId,
      kioskId,
    });

    return {
      sessionToken,
      employeeName: employeeName ?? "Employee",
      hasOpenSession: openSession !== null,
      expiresAt: new Date(Date.now() + SESSION_TOKEN_TTL_MS).toISOString(),
    };
  }

  async punch(
    kioskId: string,
    dto: KioskPunchDto,
    requestId: string,
  ): Promise<KioskPunchResponse> {
    const claims = await this.sessionTokens.verify(dto.sessionToken);
    if (!claims || claims.kioskId !== kioskId) {
      throw attendanceKioskSessionExpired();
    }

    if (dto.punchType === "CHECK_IN") {
      const result = await this.attendance.checkIn({
        employeeId: claims.employeeId,
        method: AttendanceMethod.OFFICE_KIOSK,
        kioskId,
        clientRequestId: dto.clientRequestId,
        verificationResult: AttendanceVerificationResult.NOT_APPLICABLE,
      });
      if (result === "already_checked_in") throw attendanceAlreadyCheckedIn();
      await this.audit.record({
        action: "attendance.checked_in",
        actorKind: AuditActorKind.USER,
        actorUserId: claims.employeeId,
        requestId,
        resourceType: "attendance_session",
        resourceId: result.id,
        outcome: AuditOutcome.SUCCEEDED,
        metadata: { method: "OFFICE_KIOSK", kioskId },
      });
      return {
        punchType: "CHECK_IN",
        recordedAt: result.checkInAt.toISOString(),
        message: "Checked in successfully.",
      };
    }

    const result = await this.attendance.checkOut({
      employeeId: claims.employeeId,
      clientRequestId: dto.clientRequestId,
      verificationResult: AttendanceVerificationResult.NOT_APPLICABLE,
    });
    if (result === "no_open_session") throw attendanceNoOpenSession();
    await this.audit.record({
      action: "attendance.checked_out",
      actorKind: AuditActorKind.USER,
      actorUserId: claims.employeeId,
      requestId,
      resourceType: "attendance_session",
      resourceId: result.id,
      outcome: AuditOutcome.SUCCEEDED,
      metadata: { method: "OFFICE_KIOSK", kioskId },
    });
    return {
      punchType: "CHECK_OUT",
      recordedAt: result.checkOutAt!.toISOString(),
      message: "Checked out successfully.",
    };
  }
}
