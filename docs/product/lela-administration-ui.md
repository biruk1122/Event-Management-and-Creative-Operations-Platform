# Lela organization and access administration - EVE-222

## Scope and presentation

The shipped `/users`, `/settings/roles`, `/departments` and `/teams` pages use
the existing PageHeader with a shared Lela accent/card treatment. Authorized
record counts and primary actions, existing search/status/department filters,
tables, mobile record cards and pagination retain their existing controllers.
There is no new `/account` or `/settings` route, workflow or navigation link.
The shared shell continues to supply the official company logo.

The scoped administration stylesheet uses approved light/dark semantic tokens,
readable table headers, wrapped long names/descriptions, restrained panels and
44px controls. It does not change global primitives or other work-area styling.
Create and detail dialogs share a branded header, grouped form surface, usable
close target and reduced-motion treatment. Radix still owns focus trapping and
Escape. Controlled list-opened dialogs restore focus to their opener; after a
row disappears they fall back to a surviving administration control.

Permission groups retain the existing six scopes and API grant operations.
Responsive scope controls show selected state with a checkmark and aria-pressed,
not color alone. Labels retain the exact permission key and scope. Pending
controls remain focusable with aria-disabled/aria-busy; their guarded handlers
prevent duplicate activation. Read-only controls remain disabled. Protected
roles, existing errors and destructive confirmations are unchanged.

## Verification

- Scoped user/RBAC/department/team and administration component tests:
  287 tests across 36 files passed.
- Frontend and E2E TypeScript checks, scoped ESLint and production webpack build
  passed. No API, migration, contract, dependency or image changes.
- Real PostgreSQL Chromium run `run_16d43a1c391ae66e`: 21 checks passed,
  including five role logins, create/edit/assignment/status changes,
  protected deletion, denied direct/API operations and department-only reads.
- Four real-record visual journeys covered light/dark at 360x800, 768x1024,
  1440x900 and 720x450 (200%-equivalent desktop reflow), with axe WCAG 2.2 AA,
  long-content overflow assertions, dialog Tab containment, Escape and opener
  focus restoration. Users mobile light, Roles desktop/detail dark and Teams
  create-dialog dark screenshots were inspected. Evidence is under the local,
  gitignored `e2e/.runs/run_16d43a1c391ae66e` directory.
- Independent actual implementation review found no actionable defects;
  reviewer separately passed 12 administration/permission-editor tests.
- Narrowed Chromium run `run_efb2b00e92d53fcd`: eight checks passed (five
  setup logins, both cold Ethiopian mobile Users profiles and the existing
  authenticated users API p95 gate). Cache was disabled at 360x800 DPR2;
  LCP remained within 4000/6000ms and sampled interaction bounds within
  300/500ms. Keyboard create-dialog activation and focus return passed.
  These short-journey event samples are not field INP measurements.
- Production gzip JavaScript: 649.8 KiB; CSS: 15.2 KiB, within existing limits.
  `pnpm quality:budgets` as a whole fails only because the unrelated untracked
  `apps/web/public/branding/login page.png` reference image is 1885.3 KiB,
  exceeding the per-image and aggregate limits. It remains untouched; no gate
  was relaxed.

Commands: scoped `pnpm --filter @event-platform/web test ... --maxWorkers=4`,
frontend `typecheck` and `exec eslint ... --max-warnings=0`, E2E `typecheck`,
changed-file `pnpm exec prettier --check ...`, `git diff --check`, and:

```text
pnpm --filter @event-platform/e2e e2e lela-administration.spec.ts users-admin.spec.ts rbac-roles.spec.ts departments-admin.spec.ts teams-admin.spec.ts --project=chromium
pnpm --filter @event-platform/e2e e2e lela-administration.spec.ts performance.spec.ts --project=chromium --grep 'Ethiopian|p95|authenticate'
pnpm quality:budgets
```

The E2E harness performs the production webpack build and isolated migration
setup/teardown. Test-process-only API/login rate limits were raised to 10000 to
avoid local fixture throttling; no product configuration changed. Backend
behavior and Docker-specific validation were not rerun separately for this
presentation-only change.

Manual screen-reader testing, actual browser 200% zoom and field INP remain
release checks. Automated accessibility/reflow and lab event measurements are
not certification of those requirements. External push, PR and Linear closure
are separate delivery steps and are not claimed here.
