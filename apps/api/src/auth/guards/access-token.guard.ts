import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";

import type { RequestWithContext } from "../../common/http/request-with-context.js";
import { PermissionsService } from "../../common/security/permissions.service.js";
import { AuthCookies } from "../auth-cookies.js";
import { unauthenticated } from "../auth.errors.js";
import { AccessTokenService } from "../domain/access-token.service.js";
import { AuthRepository } from "../infrastructure/auth.repository.js";

/**
 * Authenticates a request from its `access_token` cookie. The JWT is verified
 * statelessly, then the referenced session is confirmed to be active so that a
 * logged-out or revoked session cannot keep using an unexpired access token.
 * The resolved principal carries the user's effective permission keys, so
 * every downstream guard and service authorizes from real, current grants.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly cookies: AuthCookies,
    private readonly repository: AuthRepository,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();

    const token = this.cookies.readAccessToken(request);
    if (!token) {
      throw unauthenticated();
    }

    const claims = await this.accessTokens.verify(token);
    if (!claims) {
      throw unauthenticated();
    }

    if (!(await this.repository.isSessionActive(claims.sid))) {
      throw unauthenticated();
    }

    request.user = {
      userId: claims.sub,
      sessionId: claims.sid,
      permissions: await this.permissions.getPermissionKeys(claims.sub),
    };
    return true;
  }
}
