# Department-aware access update

The user's October 2026 requirements supersede the original five-role taxonomy.
The three supported roles are `SUPER_ADMIN`, `DEPARTMENT_MANAGER`, and
`DEPARTMENT_MEMBER`. Database display names are Super Admin, Department Manager,
and Department Member. Legacy names are accepted only for staged migration.

Supported departments: Production, Marketing, Promotion, and
Manager / Event & Office Manager. Preserve this capitalization.

## Policy

- Super Admin retains platform-wide authority and is protected from demotion and
  deactivation through user administration.
- Only Super Admin assigns roles and departments. Role and department changes
  require their separate permission keys, not merely permission to edit a profile.
- Managers and members require an active supported department. Unsupported roles,
  missing departments, or inactive departments fail closed to self-profile access.
- Department accounts cannot acquire organization or management-scoped grants
  through role configuration. Members cannot acquire department-wide grants.
- Department does not itself confer permissions: existing grants and resource
  authorization remain necessary. Client navigation is not a security boundary.
- Existing unclassified resources are not assigned to a guessed department.
- Existing operational records must be preserved. Account deletion is an explicit
  local operation, never a blanket database migration.

## Delivery batches

1. Account assignment validation, stable access context, supported catalog,
   user create/edit department controls, and security regression tests.
2. Department ownership and authorization for workspaces, projects, productions,
   campaigns, events, tasks, reports, analytics, teams, meetings, and communication.
   Lists and aggregates must filter before pagination; object access must verify
   persisted ownership rather than trust caller parameters. Explicit sharing must
   never bypass department restrictions.
3. Department-aware dashboards and module navigation, generated contracts,
   and end-to-end role/department tests.

The first batch alone does **not** complete the full department-aware platform.
Do not deploy it as a finished replacement before the resource and UI batches.
The nullable user department column remains necessary for Super Admin; application
validation enforces role-dependent requirements. Database-level assignment guards
and concurrent assignment tests remain part of the subsequent hardening work.

## First-batch verification

- Backend unit suite: 708 tests passed before the final review fixes; the affected
  five-suite security subset passed all 113 tests after those fixes.
- User-management UI: four suites passed 49 tests; a subsequent department-edit
  regression and gateway rerun passed all 33 tests in the two affected suites.
- Catalog migration: three tests passed against a disposable PostgreSQL schema,
  including legacy assignment and Super Admin preservation. No migration was applied
  to live data.
- Built-in role-name UI: all 10 role detail dialog tests passed.
- Backend types, OpenAPI generation, changed-file lint, and diff checks passed.
- Frontend source and production-route types passed. The standard frontend check
  encountered malformed generated `.next/dev/types/validator.ts` in the running
  development cache; a temporary ignored configuration excluded that cache only.
- Independent review findings (system-role rename lockout and an alternate
  department-assignment bypass) were fixed, tested, and re-reviewed with no findings.
- Full PostgreSQL/API integration, frontend build, and end-to-end role matrix checks
  remain for the complete resource/UI implementation. This batch is not deployment
  or full-requirement completion evidence.
