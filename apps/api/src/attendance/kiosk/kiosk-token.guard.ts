import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import type { Request } from "express";

import { attendanceKioskInvalid } from "../attendance.errors.js";
import { KioskRepository } from "./infrastructure/kiosk.repository.js";
import { hashKioskToken, kioskTokenHashEquals } from "./kiosk-token.js";

export interface RequestWithKiosk extends Request {
  id: string;
  kiosk: { id: string; name: string };
}

/**
 * The kiosk's own authentication - deliberately never `AccessTokenGuard`.
 * A shared office device has no logged-in user; it proves its own identity
 * with a server-issued bearer secret (`X-Kiosk-Id` + `X-Kiosk-Token`),
 * verified by a constant-time digest comparison against the hash stored at
 * registration - a client-supplied device id alone is never trusted.
 */
@Injectable()
export class KioskTokenGuard implements CanActivate {
  constructor(private readonly kiosks: KioskRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithKiosk>();
    const kioskId = request.header("x-kiosk-id");
    const token = request.header("x-kiosk-token");
    if (!kioskId || !token) throw attendanceKioskInvalid();

    const kiosk = await this.kiosks.findAuthById(kioskId);
    if (!kiosk) throw attendanceKioskInvalid();

    if (!kioskTokenHashEquals(hashKioskToken(token), kiosk.tokenHash)) {
      throw attendanceKioskInvalid();
    }

    request.kiosk = { id: kiosk.id, name: kiosk.name };
    return true;
  }
}
