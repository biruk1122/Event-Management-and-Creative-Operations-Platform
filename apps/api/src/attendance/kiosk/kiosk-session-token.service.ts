import { Inject, Injectable } from "@nestjs/common";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

import { ENVIRONMENT, type Environment } from "../../config/environment.js";

export interface KioskSessionClaims {
  employeeId: string;
  kioskId: string;
}

const ISSUER = "event-platform";
const AUDIENCE = "event-platform-attendance-kiosk-session";
const TTL_SECONDS = 90;

/**
 * A short-lived, stateless proof that an employee's password was just
 * verified at a specific kiosk - the bridge between the "verify identity"
 * step and the "record the punch" step, so the kiosk UI never has to hold
 * or resend the password once the moment of verification has passed.
 * Deliberately a distinct issuer/audience from `AccessTokenService`'s real
 * login session tokens, signed with the same secret (HS256's own
 * issuer/audience check is what keeps the two token kinds from being
 * interchangeable, not a second secret).
 */
@Injectable()
export class KioskSessionTokenService {
  private readonly secret: Uint8Array;

  constructor(@Inject(ENVIRONMENT) environment: Environment) {
    this.secret = new TextEncoder().encode(
      environment.AUTH_ACCESS_TOKEN_SECRET,
    );
  }

  issue(claims: KioskSessionClaims): Promise<string> {
    return new SignJWT({ employeeId: claims.employeeId, kioskId: claims.kioskId })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${TTL_SECONDS}s`)
      .sign(this.secret);
  }

  async verify(token: string): Promise<KioskSessionClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      return this.toClaims(payload);
    } catch {
      return null;
    }
  }

  private toClaims(payload: JWTPayload): KioskSessionClaims | null {
    const { employeeId, kioskId } = payload;
    if (typeof employeeId !== "string" || typeof kioskId !== "string") {
      return null;
    }
    return { employeeId, kioskId };
  }
}
