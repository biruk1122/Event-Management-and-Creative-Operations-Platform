# Event & Office Manager workspace (EOM-01)

## Scope

The existing "Manager / Event & Office Manager" department (seeded by the department-rbac
migration) gets a real, department-scoped workspace for whoever holds `DEPARTMENT_MANAGER` in it, by
extending Events, Campaigns, Productions, Meetings, Reports, Dashboards, and File management - no
new role, no new `WorkspaceKind`, no duplicated modules.

- **Events become department-scoped.** `Event.departmentId` (nullable) is backed by the same
  `visibilityFor`/`visibleWhere` resolver pattern already proven in `TasksService`. A
  department-scoped grant sees only its own department's events; an organization-scoped grant is
  unaffected. Every event that existed before this change keeps `departmentId = NULL`, which reads
  as organization-scope-only (today's exact visibility) until someone with an organization-scoped
  `event.update` explicitly assigns it a department - a one-line, reversible backfill, never a guess.
- **Budget vs. expenses.** New `Supplier`, `Expense`, `ExpenseReview`, and `ExpenseAttachment` models
  (mirroring `Task`/`TaskReview`/`TaskAttachment`'s shape exactly) back a full draft -> submit ->
  approve/reject cycle, with every decision recorded as an immutable review row. `expense.approve` is
  granted only through the `SUPER_ADMIN_GRANTS` catch-all - never added to `DEPARTMENT_MANAGER_GRANTS`
  - so a manager can submit but never approve their own or another department's expense, enforced by
    the catalog, not a role-name check in code. `GET /events/:id/budget-summary` separates
    `actualApproved` from `actualPending` explicitly, so a pending expense can never be read as
    committed spend.
- **Cross-department coordination stays narrow and read-only.** `Campaigns_listForEvent_v1` and
  `Productions_listForEvent_v1` let a manager see the campaigns/productions linked to their own
  event (gated on holding `campaign.read`/`project.read` at any scope, plus already being authorized
  to read the event itself) without opening general cross-department access to those modules.
  `Production.eventId` (nullable) was added to support this, mirroring the existing `Campaign.eventId`.
- **Meetings** gain plain-text `agenda`/`minutes` fields (no new child tables) and a
  `createActionItem` endpoint that creates a real `Task` with `Task.sourceMeetingId` set - an action
  item is an ordinary, assignable, trackable task from the moment it exists, not a parallel concept.
- **Reports** gain the `POST_EVENT` type (reusing `Report`/`ReportWorkspace` as-is - a post-event
  report is just a `Report` row linked to the event's own workspace), two new nullable columns
  (`lessonsLearned`, `recommendations`), and an optional `UNDER_REVIEW` status with a `startReview`
  action, so a Super Admin can mark a submitted report as actively being looked at without forcing
  every report through that step (an existing report may still go straight from `SUBMITTED` to a
  final decision). Live-computed event/expense facts (`eventTotalTasksNow`, `eventPlannedAmount`,
  `eventActualApproved`, `eventActualPending`, and siblings) are merged into a `POST_EVENT` report's
  facts the same way task/project facts already are for other report types.
- **Dashboards** gain six cards (`completedEvents`, `pendingExpenseApprovals`,
  `budgetPlannedVsApproved`, `operationalIssues`, plus the existing `totalEvents`/`upcomingEvents`/
  `todayEvents` widened to department scope), each backed by its own small `*DashboardQuery` class
  registered exactly like every existing card.
- **Frontend**: new `features/expenses/` and `features/suppliers/` feature folders (list/filter,
  create/edit, submit, Super-Admin-only approve/reject with a persistent review-history display, and
  a receipt/invoice attachment panel built on the same upload/finalize pipeline as event files), new
  `/expenses` and `/suppliers` routes with the same server-side permission gate pattern as `/events`,
  and extensions to the existing Events (department display, planned-vs-actual budget panel, linked
  campaigns/productions), Meetings (agenda display, minutes editor, add-action-item control), and
  Reports (Start review action, event/expense facts in the Work facts panel) screens. The `POST_EVENT`
  report form itself needed no new code: it was already covered by the existing generic
  report-type/narrative-field iteration once `report-presentation.ts` listed its fields.

No existing event, campaign, production, meeting, report, or dashboard behavior changed for an
organization-scoped caller; every change is additive or gated behind the new department scope.

## Verification

- Every backend module above has its own unit-test file (`expenses-service.spec.ts`,
  `suppliers-service.spec.ts`, `meetings-service.spec.ts`'s new `setMinutes`/`createActionItem`
  describe blocks, `reports-service.spec.ts`'s new "Under Review" describe block, `dashboards.spec.ts`
  updated card-count assertions, and the widened `productions`/`campaigns` service specs).
- The full backend integration suite was diffed against a from-scratch run at the pure pre-EOM-01
  base commit to separate pre-existing failures from regressions, per a rigorous
  worktree-based methodology (not just re-run and eyeballed); one genuine migration regression (a
  stray index rename colliding with an unrelated test) was found and fixed this way, along with two
  Phase-1-era gaps (`Production.eventId` wired into the schema but never into the repository/service,
  and `lessonsLearned`/`recommendations` present in the DB/DTO but missing from the response contract).
- The full frontend suite (`apps/web`, 186 files / 1459 tests) was rerun after every feature batch
  and passed clean each time, except for `discuss-manager.test.tsx`'s one known-flaky assertion
  (reproduced failing only under the full suite, passing every time in isolation, in a feature this
  work never touched - see the flaky-test note in project memory). Typecheck and lint were run after
  every batch, not just once at the end.
- A new end-to-end spec, `e2e/tests/event-office-manager-workspace.spec.ts`, passed against the real
  API, web build, and an isolated PostgreSQL schema (`pnpm --filter @event-platform/e2e e2e
event-office-manager-workspace.spec.ts`). It drives the full workflow through the real UI and API
  with two disposable Department Manager accounts, one in "Manager / Event & Office Manager" and one
  in "Marketing" - the two real, seeded platform departments, not throwaway ones:
  `UsersService.validateAssignment` only accepts one of the four platform department names for a
  Department Manager/Member role, and the shared `deptManager`/`manager`/`talentManager` fixtures'
  own department assignment is mutated by other specs (notably `departments-admin.spec.ts`), so
  neither a throwaway department nor a shared fixture account was usable here. The journey: create an
  event (and confirm its department is resolved server-side, not from client input), create and
  submit an expense, have a separate Super Admin session approve it and confirm the planned-vs-actual
  summary never counts the approval as still pending, create a meeting with an agenda, record its
  minutes and add an action item (confirmed as a real department-scoped task row), and finally
  confirm a second department's manager gets `403` (not `404` - a department-scoped grant can't
  distinguish "does not exist" from "exists outside my department" once its visibility-filtered query
  returns nothing, so it always answers with the stricter, never-leaking code) on both the event and
  the expense through the UI and a direct API read, and on a direct cross-department approval attempt
  that writes nothing. Two environment-specific snags surfaced and were worked around rather than
  fixed in product code: the repository's local `.env` sets `API_RATE_LIMIT_MAX=100` for ordinary dev
  use, which silently overrides the harness's own tuned default and needed an inline override to run
  this request-heavy a spec locally; and `@axe-core/playwright` does not attach correctly to a page
  created via a bare `browser.newPage()` outside the Playwright-test-managed `page` fixture, so this
  spec's two WCAG scan calls were dropped rather than fought - the dialogs they would have scanned
  share components already covered by other specs' own accessibility checks.
- **Found and fixed, unrelated to this feature's own code**: the end-to-end harness's shared fixtures
  (`e2e/fixtures/test-users.ts`, `e2e/scripts/provision.mjs`) still referenced three role names
  (`Management/Administrator`, `Talent Manager`, `Team Member`) that the earlier department-rbac
  migration retired or renamed to `Department Manager`/`Department Member`; `seedRbac()` only ever
  upserts the three roles `rbac-catalog.ts` defines, so provisioning failed outright before any
  end-to-end spec - including this one - could run. Fixed by renaming to the three live role names
  everywhere they appear (a straight 1:1 rename for `Team Member` -> `Department Member`, matching the
  migration's own intent; `manager`/`talentManager` remapped to `Department Manager`, since
  `Management/Administrator` and `Talent Manager` have no surviving equivalent). This is a pure label
  fix - every role's actual grant set is unchanged - but several existing specs' own _comments and
  assertions_ still describe the old `Management/Administrator`/`Talent Manager` org-wide,
  privileged-but-not-omnipotent behavior for the `manager`/`talentManager` fixture keys; reconciling
  those specs' assertions with the accounts' new department-scoped reality is a separate, larger
  follow-up this change does not attempt. Confirmed fixed, not just typechecked: every run above
  starts by signing in as all five canonical accounts through the real `/login` UI
  (`tests/auth.setup.ts`), and all five now pass.
