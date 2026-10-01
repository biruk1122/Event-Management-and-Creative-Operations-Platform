# Reports verification (EVE-167)

Run the report policy tests with `pnpm --filter @event-platform/api test -- reports.policy.spec.ts`.
Run the API and persistence suites against an available PostgreSQL 18 server
with `pnpm --filter @event-platform/api test:integration -- reports.integration.spec.ts reports-verification.integration.spec.ts report-schema.integration.spec.ts`.
Each integration file creates a disposable schema, applies committed migrations,
and drops only that schema during teardown.

The EVE-167 fixture fixes the report periods at 2024-02-29 (Daily),
2024-02-26 through 2024-03-03 (Weekly), and the leap-year month of February
2024 (Monthly). Completion transitions at exactly the UTC start and end are
included; the next instant is excluded. Repeated completion events for one
task count once. Author-created and currently assigned tasks are included;
unrelated tasks, cancelled tasks, and cancelled projects are excluded. The
expected Daily/Weekly/Monthly completion counts are 2/4/3, current open tasks
are 4, overdue open tasks are 2, and Monthly project counts are 2 total,
1 completed, and 1 active. The suite also verifies two review cycles, audit
records, workspace links, scoped export, filters, pagination, and error codes.

The SQL budget test counts Prisma-emitted read statements after connection
warm-up: four for task facts, three for project facts, and at most six for a
paginated report list. The report-list count must remain the same when the
page size grows from one to 25, guarding against per-row loading. These are
query-count budgets, not wall-clock performance claims. Representative
`EXPLAIN (FORMAT JSON)` plans run with sequential scans disabled because a
tiny isolated fixture would otherwise favor them; they assert usable indexes
for author, department, status, workspace link, overdue task, completion
activity, and author-project filters. They do not assert fragile planner cost
numbers or timings.

Reminder scheduling is not tested as delivered behavior: ADR 0003 NT-01/NT-02
leave lead times and expected report submitter populations undecided. This
suite does not invent those requirements.
