import type { CurrentAccess } from "@/features/auth/api/access-queries";

type Grant = CurrentAccess["grants"][number];

function holds(grants: readonly Grant[], key: string): boolean {
  return grants.some((grant) => grant.permissionKey === key);
}

export function reportAbilities(access: CurrentAccess) {
  return {
    canRead: holds(access.grants, "report.read"),
    canCreate: holds(access.grants, "report.create"),
    canSubmit: holds(access.grants, "report.submit"),
    canReview: access.grants.some(
      (grant) =>
        grant.permissionKey === "report.review" &&
        grant.scope === "ORGANIZATION",
    ),
    audience: access.grants.some(
      (grant) =>
        grant.permissionKey === "report.read" &&
        (grant.scope === "DEPARTMENT" || grant.scope === "ORGANIZATION"),
    )
      ? ("management" as const)
      : ("employee" as const),
  };
}
