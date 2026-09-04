import { Inject, Injectable } from "@nestjs/common";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

import { ENVIRONMENT, type Environment } from "../../config/environment.js";

export interface AccessTokenClaims {
  /** User id. */
  sub: string;
  /** Session id. */
  sid: string;
}

const ISSUER = "event-platform";
const AUDIENCE = "event-platform-api";

/** Short-lived stateless access token, signed with HS256. */
@Injectable()
export class AccessTokenService {
  private readonly secret: Uint8Array;
  private readonly ttl: string;

  constructor(@Inject(ENVIRONMENT) environment: Environment) {
    this.secret = new TextEncoder().encode(
      environment.AUTH_ACCESS_TOKEN_SECRET,
    );
    this.ttl = environment.AUTH_ACCESS_TOKEN_TTL;
  }

  issue(claims: AccessTokenClaims): Promise<string> {
    return new SignJWT({ sid: claims.sid })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(claims.sub)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(this.ttl)
      .sign(this.secret);
  }

  async verify(token: string): Promise<AccessTokenClaims | null> {
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

  private toClaims(payload: JWTPayload): AccessTokenClaims | null {
    const sid = payload.sid;
    if (typeof payload.sub !== "string" || typeof sid !== "string") {
      return null;
    }
    return { sub: payload.sub, sid };
  }
}
