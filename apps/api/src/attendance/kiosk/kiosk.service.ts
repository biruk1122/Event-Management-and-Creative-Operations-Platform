import { Injectable } from "@nestjs/common";

import { PermissionsService } from "../../common/security/permissions.service.js";
import { permissionDenied } from "../../common/security/security.errors.js";
import { attendanceKioskNotFound } from "../attendance.errors.js";
import {
  KioskRepository,
  type KioskRecord,
} from "./infrastructure/kiosk.repository.js";
import { generateKioskToken, hashKioskToken } from "./kiosk-token.js";
import type {
  KioskRegisteredResponse,
  KioskResponse,
} from "./kiosk.contracts.js";

function toResponse(kiosk: KioskRecord): KioskResponse {
  return {
    id: kiosk.id,
    name: kiosk.name,
    locationLabel: kiosk.locationLabel,
    isActive: kiosk.isActive,
    createdAt: kiosk.createdAt.toISOString(),
    revokedAt: kiosk.revokedAt?.toISOString() ?? null,
  };
}

/**
 * Kiosk device registration and revocation - Super Admin only
 * (`attendance.kiosk.manage` has no DEPARTMENT-scope grant anywhere in the
 * catalog, including for the HR & Executive Officer department's own
 * manager; registering a device that can accept attendance on anyone's
 * behalf is configuration, not day-to-day HR record management).
 */
@Injectable()
export class KioskService {
  constructor(
    private readonly repository: KioskRepository,
    private readonly permissions: PermissionsService,
  ) {}

  private async requireManage(actingUserId: string): Promise<void> {
    if (
      !(await this.permissions.hasGrant(
        actingUserId,
        "attendance.kiosk.manage",
        "ORGANIZATION",
      ))
    ) {
      throw permissionDenied();
    }
  }

  async register(
    actingUserId: string,
    input: { name: string; locationLabel: string },
  ): Promise<KioskRegisteredResponse> {
    await this.requireManage(actingUserId);
    const token = generateKioskToken();
    const kiosk = await this.repository.create({
      name: input.name,
      locationLabel: input.locationLabel,
      tokenHash: hashKioskToken(token),
      createdById: actingUserId,
    });
    return { ...toResponse(kiosk), token };
  }

  async list(actingUserId: string): Promise<KioskResponse[]> {
    await this.requireManage(actingUserId);
    const kiosks = await this.repository.list();
    return kiosks.map(toResponse);
  }

  async revoke(actingUserId: string, id: string): Promise<void> {
    await this.requireManage(actingUserId);
    const result = await this.repository.revoke(id, actingUserId);
    if (result === "not_found") throw attendanceKioskNotFound();
  }
}
