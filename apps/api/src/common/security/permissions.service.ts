import { Injectable } from "@nestjs/common";

import type { PermissionScope } from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";

export interface EffectiveGrant {
  permissionKey: string;
  scope: PermissionScope;
}

/**
 * Resolves an acting user's effective permission grants: the baseline grants
 * every authenticated user holds, plus the grants of their assigned role (if
 * any), from `user_role_assignments`. There is no inheritance beyond this
 * union - absence of a grant is denial.
 */
@Injectable()
export class PermissionsService {
  constructor(private readonly db: DatabaseService) {}

  async getEffectiveGrants(userId: string): Promise<EffectiveGrant[]> {
    const [baseline, assignment] = await Promise.all([
      this.db.baselineGrant.findMany({
        select: { permissionKey: true, scope: true },
      }),
      this.db.userRoleAssignment.findUnique({
        where: { userId },
        include: { role: { include: { rolePermissions: true } } },
      }),
    ]);

    const roleGrants =
      assignment?.role.rolePermissions.map((grant) => ({
        permissionKey: grant.permissionKey,
        scope: grant.scope,
      })) ?? [];

    return [...baseline, ...roleGrants];
  }

  /**
   * The set of distinct permission keys the user holds, at any scope. This is
   * the coarse check `AccessTokenGuard` attaches to the request principal and
   * `PermissionsGuard` checks at the transport boundary; it does not consider
   * scope. Callers that must know the operation is authorized for a specific
   * scope use {@link hasGrant} as the second, precise boundary.
   */
  async getPermissionKeys(userId: string): Promise<Set<string>> {
    const grants = await this.getEffectiveGrants(userId);
    return new Set(grants.map((grant) => grant.permissionKey));
  }

  /** Whether the user holds the exact `(permissionKey, scope)` grant. */
  async hasGrant(
    userId: string,
    permissionKey: string,
    scope: PermissionScope,
  ): Promise<boolean> {
    const grants = await this.getEffectiveGrants(userId);
    return grants.some(
      (grant) => grant.permissionKey === permissionKey && grant.scope === scope,
    );
  }
}
