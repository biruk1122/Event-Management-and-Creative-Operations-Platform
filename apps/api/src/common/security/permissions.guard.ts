import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { RequestWithContext } from "../http/request-with-context.js";
import { permissionDenied } from "./security.errors.js";
import { REQUIRED_PERMISSIONS_KEY } from "./permissions.decorator.js";

/**
 * The coarse, transport-level authorization boundary: the acting user must
 * hold every permission key `@RequirePermissions(...)` names, at any scope.
 * Route handlers must run this after an authentication guard sets
 * `request.user`. It does not resolve scope - the application service the
 * route calls is the second, precise boundary that does.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const granted = request.user?.permissions;

    if (
      !granted ||
      !requiredPermissions.every((permission) => granted.has(permission))
    ) {
      throw permissionDenied();
    }

    return true;
  }
}
