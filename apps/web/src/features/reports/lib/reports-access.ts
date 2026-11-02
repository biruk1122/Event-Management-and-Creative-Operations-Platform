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
    canAttach: holds(access.grants, "report.attachment.create"),
    // Holding the grant only makes the review UI possible; each report is
    // reviewable only by its own recipient (or Super Admin) - see
    // ReportDetailPanel - and the API enforces the same rule.
    canReview: access.grants.some(
      (grant) =>
        grant.permissionKey === "report.review" &&
        (grant.scope === "ORGANIZATION" || grant.scope === "DEPARTMENT"),
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
