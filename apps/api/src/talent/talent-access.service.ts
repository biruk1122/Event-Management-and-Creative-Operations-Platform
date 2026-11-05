import { Injectable } from "@nestjs/common";

import { isProductionManager } from "../common/security/department-access.policy.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import type { AssignmentKind } from "./talent-assignment.domain.js";

/**
 * The one place talent access is decided, so the rules cannot drift between
 * routes. Routes that these rules govern do not declare `@RequirePermissions`
 * for talent keys (a Production Manager does not hold them organization-wide),
 * and call this service instead. Every decision is made on the server.
 *
 * - Super Admin and Admin hold the organization-wide `talent.*` grants and
 *   therefore have full talent access, including contact details.
 * - A Production Manager (Department Manager of the Production department) can
 *   view talent with contact details hidden, and can manage assignments only
 *   for events and productions in their own department, and only while they hold
 *   the existing work grant (`event.update` or `project.assign`). Promotional
 *   activities are never open to them.
 * - Everyone else has no talent access.
 */
@Injectable()
export class TalentAccessService {
  constructor(private readonly permissions: PermissionsService) {}

  hasOrganizationGrant(userId: string, key: string): Promise<boolean> {
    return this.permissions.hasGrant(userId, key, "ORGANIZATION");
  }

  /** Full directory access (incl. contact details), masked access, or none. */
  async directoryMode(userId: string): Promise<"full" | "masked" | null> {
    if (await this.hasOrganizationGrant(userId, "talent.read")) return "full";
    const context = await this.permissions.getAccessContext(userId);
    return isProductionManager(context) ? "masked" : null;
  }

  /**
   * Whether the caller may see and act on assignments of this work item.
   * `departmentId` is the work's department (null when the work has none).
   */
  async canManageWork(
    userId: string,
    kind: AssignmentKind,
    departmentId: string | null,
  ): Promise<boolean> {
    if (await this.hasOrganizationGrant(userId, "talent.assign")) return true;
    const context = await this.permissions.getAccessContext(userId);
    if (!isProductionManager(context) || !departmentId) return false;
    if (departmentId !== context.department?.id) return false;
    if (kind === "EVENT") {
      return this.permissions.hasGrant(userId, "event.update", "DEPARTMENT");
    }
    if (kind === "PRODUCTION") {
      return this.permissions.hasGrant(userId, "project.assign", "DEPARTMENT");
    }
    return false;
  }

  /** Whether the caller is a Production Manager (for response masking and scoping). */
  async isProductionManager(userId: string): Promise<boolean> {
    return isProductionManager(await this.permissions.getAccessContext(userId));
  }

  /** The Production Manager's own department id, or null for anyone else. */
  async managerDepartmentId(userId: string): Promise<string | null> {
    const context = await this.permissions.getAccessContext(userId);
    return isProductionManager(context)
      ? (context.department?.id ?? null)
      : null;
  }
}
