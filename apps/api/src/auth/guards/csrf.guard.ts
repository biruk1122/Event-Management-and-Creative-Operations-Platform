import { timingSafeEqual } from "node:crypto";

import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import type { Request } from "express";

import { AuthCookies, CSRF_HEADER } from "../auth-cookies.js";
import { csrfTokenInvalid } from "../auth.errors.js";

/**
 * Double-submit CSRF check for state-changing authenticated routes: the
 * `x-csrf-token` header must equal the non-HttpOnly `csrf_token` cookie.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly cookies: AuthCookies) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const cookieToken = this.cookies.readCsrfCookie(request);
    const headerValue = request.get(CSRF_HEADER);

    if (
      !cookieToken ||
      !headerValue ||
      !constantTimeEquals(cookieToken, headerValue)
    ) {
      throw csrfTokenInvalid();
    }
    return true;
  }
}

function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
