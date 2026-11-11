import { AsyncLocalStorage } from "node:async_hooks";

import { Injectable } from "@nestjs/common";

import type { PermissionScope } from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";
import {
  canOverseeDepartments,
  constrainDepartmentGrants,
  isOversightReadKey,
  platformRole,
  type DepartmentAccessContext,
} from "./department-access.policy.js";

export interface OverseenDepartment {
  id: string;
  name: string;
}

export interface EffectiveGrant {
  permissionKey: string;
  scope: PermissionScope;
}

/**
 * Per-HTTP-request memo for permission lookups. A request often checks the same
 * user's grants many times (the access guard, then one check per handler call);
 * this makes each lookup run once per request. It is never shared between
 * requests and has no time-based expiry, so the next request always reads fresh
 * data. Code that changes grants, roles, status or department during a request
 * must call {@link clearPermissionMemo} afterwards.
 */
const requestMemo = new AsyncLocalStorage<Map<string, Promise<unknown>>>();

/** Runs `next` inside a fresh permission memo (installed once per request). */
export function runWithPermissionMemo<T>(next: () => T): T {
  return requestMemo.run(new Map(), next);
}

/** Forgets cached lookups for the current request after a grant-affecting write. */
export function clearPermissionMemo(): void {
  requestMemo.getStore()?.clear();
}

function memoized<T>(key: string, load: () => Promise<T>): Promise<T> {
  const memo = requestMemo.getStore();
  if (!memo) return load();
  const cached = memo.get(key);
  if (cached) return cached as Promise<T>;
  const pending = load();
  memo.set(key, pending);
  // A failed lookup must not poison the rest of the request.
  pending.catch(() => memo.delete(key));
  return pending;
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
    const grants = await memoized(`grants:${userId}`, () =>
      this.loadEffectiveGrants(userId),
    );
    return grants.map((grant) => ({ ...grant }));
  }

  private async loadEffectiveGrants(userId: string): Promise<EffectiveGrant[]> {
    const [baseline, assignment] = await Promise.all([
      this.db.baselineGrant.findMany({
        select: { permissionKey: true, scope: true },
      }),
      this.db.userRoleAssignment.findUnique({
        where: { userId },
        include: {
          role: { include: { rolePermissions: true } },
          user: { include: { department: true } },
        },
      }),
    ]);

    const roleGrants =
      assignment?.role.rolePermissions.map((grant) => ({
        permissionKey: grant.permissionKey,
        scope: grant.scope,
      })) ?? [];

    return constrainDepartmentGrants(contextFromAssignment(assignment), [
      ...baseline,
      ...roleGrants,
    ]);
  }

  async getAccessContext(userId: string): Promise<DepartmentAccessContext> {
    return memoized(`context:${userId}`, () => this.loadAccessContext(userId));
  }

  private async loadAccessContext(
    userId: string,
  ): Promise<DepartmentAccessContext> {
    const assignment = await this.db.userRoleAssignment.findUnique({
      where: { userId },
      include: { role: true, user: { include: { department: true } } },
    });
    return contextFromAssignment(assignment);
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

  /**
   * The active departments this user oversees read-only (EVE-229, ADR 0008):
   * departments whose `oversight_department_id` is the user's own department,
   * when the user is that department's active, recorded manager. Empty for
   * everyone else, so callers can merge it into a visibility filter
   * unconditionally.
   */
  async getOverseenDepartments(userId: string): Promise<OverseenDepartment[]> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        managedDepartments: { select: { id: true } },
      },
    });
    if (!user || user.status !== "ACTIVE") return [];
    const context = await this.getAccessContext(userId);
    const managed = user.managedDepartments.map((department) => department.id);
    if (!canOverseeDepartments(context, managed) || !context.department) {
      return [];
    }
    return this.db.department.findMany({
      where: {
        oversightDepartmentId: context.department.id,
        deactivatedAt: null,
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  /**
   * The overseen department ids that widen `permissionKey`'s reach for this
   * user. Only read keys qualify (`OVERSIGHT_READ_PERMISSION_KEYS`), and only
   * when the user already holds the key at DEPARTMENT scope, so oversight
   * extends an existing department read and never grants a new capability.
   */
  async overseenDepartmentIdsFor(
    userId: string,
    permissionKey: string,
  ): Promise<string[]> {
    if (!isOversightReadKey(permissionKey)) return [];
    if (!(await this.hasGrant(userId, permissionKey, "DEPARTMENT"))) return [];
    return (await this.getOverseenDepartments(userId)).map(
      (department) => department.id,
    );
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

function contextFromAssignment(
  assignment: {
    role: { name: string; isSystem: boolean };
    user: {
      department: {
        id: string;
        name: string;
        deactivatedAt: Date | null;
      } | null;
    };
  } | null,
): DepartmentAccessContext {
  const department = assignment?.user.department;
  return {
    role: assignment?.role.isSystem ? platformRole(assignment.role.name) : null,
    department: department
      ? {
          id: department.id,
          name: department.name,
          active: department.deactivatedAt === null,
        }
      : null,
  };
}
