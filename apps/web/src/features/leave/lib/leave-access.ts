import type { CurrentAccess } from "@/features/auth/api/access-queries";

/**
 * Leave authorization mirrors the backend exactly: every route names the
 * precise key, and the server resolves SELF/DEPARTMENT/ORGANIZATION scope
 * itself. These checks only need to know the caller holds the key at *some*
 * scope the backend accepts.
 */
type Grant = CurrentAccess["grants"][number];

function holdsAny(grants: readonly Grant[], key: string): boolean {
  return grants.some((grant) => grant.permissionKey === key);
}

export interface LeaveAbilities {
  /** Baseline SELF grant - true for every authenticated active employee. */
  canRequestLeave: boolean;
  /** Baseline SELF grant - also what `GET /leave/calendar` gates on. */
  canReadLeave: boolean;
  canReviewLeave: boolean;
  canGrantLeave: boolean;
  canManageTypes: boolean;
}

export function leaveAbilities(access: CurrentAccess): LeaveAbilities {
  const can = (key: string) => holdsAny(access.grants, key);
  return {
    canRequestLeave: can("leave.request.create"),
    canReadLeave: can("leave.read"),
    canReviewLeave: can("leave.review"),
    canGrantLeave: can("leave.grant.manage"),
    canManageTypes: can("leave.type.manage"),
  };
}

export function canEnterLeave(access: CurrentAccess): boolean {
  const abilities = leaveAbilities(access);
  return (
    abilities.canRequestLeave ||
    abilities.canReviewLeave ||
    abilities.canGrantLeave ||
    abilities.canManageTypes
  );
}
