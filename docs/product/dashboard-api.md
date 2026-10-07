# Dashboard API

EVE-178 implements the read-only endpoints specified by
[DSH-01](dashboard-query-contracts.md). No dashboard mutation, table, cache,
scheduler, UI or theme selector is added.

## Queries and authorization

- `GET /api/v1/dashboards/management`: management entry, then source grants.
- `GET /api/v1/dashboards/employee`: SELF entry; source-authorized work is
  additionally intersected with caller assignment, ownership or participation.

Both require an active authenticated session and return `Cache-Control: no-store`.
Dashboard loading never changes work, read cursors or notifications. Commands
remain on their existing task, To-Do, meeting and Discuss APIs.

`cards` selects unique audience keys; omitted means all 23 management or seven
employee keys. `limit` defaults to five, maximum ten. `day` is a real UTC date.
Management additionally accepts paired cohort `from`/`toExclusive` (maximum 366
days), `months` (1-12, default three), and an optional promotion campaign UUID.
Unknown fields, duplicates, invalid ranges and wrong-audience cards fail before
source reads. No client identity, department, role or historical snapshot is accepted.

Examples:

```text
GET /api/v1/dashboards/management?cards=totalEvents,pendingTasks,todayMeetings&limit=5
GET /api/v1/dashboards/employee?cards=myTasks,myTodo,myUnreadMessages
```

Responses contain refresh metadata and keyed states: ready, empty, denied,
selectionRequired, unavailable or partial. Zero counts are ready; failed reads
never become zero. Denied cards contain no source details. Mixed-source cards
keep bounded combined data and source-state summaries, without duplicating
source item payloads. Envelope partial denotes execution failure, not a missing
capability. Safe errors carry a code/request ID; logs omit raw SQL/private data.
Authentication, entry denial and global access-resolution failure use existing
Problem Details. Invalid promotion selection yields a non-retryable
`DASHBOARD_SELECTION_UNAVAILABLE` card result without resource details.

## Source and query boundaries

Ten owning modules export bounded dashboard read interfaces. Dashboards does not
access their repositories/tables. Existing AnalyticsService supplies all six
analytics cards using unchanged formulas and precise grants. Event/project/
campaign source policy remains organization-only as in their existing APIs;
narrow grants are denied, not broadened. Personal records and joined-conversation
read cursors remain caller-only, including for management. Task SELF visibility
cannot inherit a department from an unrelated grant.

Lists select at most limit + 1 minimal rows in SQL; related task/event counts
share one statement per request. Four composition workers and a request-local
database limiter also cap nested analytics reads. PostgreSQL statement timeouts
cancel source SQL after 500 ms. Existing pool/transaction wait limits are unchanged;
the 750 ms aggregate API budget still needs representative release verification.
No new projection, cache, index or infrastructure is introduced.

Schedule uses live authorized sources plus owned PERSONAL/REMINDER entries, never
stale linked projections as an access shortcut. Recent Activity is assigned-task
history, not a global audit/event store. To-Do dates and optional times stay
floating calendar values, with time-aware selection in the deadline lane.

## Verification and delivery boundary

Unit tests cover query/audience validation, batching, caller-only context, errors
and zero/empty/selection states. Isolated PostgreSQL tests exercise owner SQL,
scoped privacy, read cursors, deadline ordering, limits, cancellation and concurrency.
Authenticated HTTP tests cover all management cards, employee ownership, entry
denial, no-store responses and invalid/repeated query fields.
Backend OpenAPI is generated into packages/api-client; no handwritten frontend
contracts are added.

EVE-179 owns broader API/persistence and representative performance verification.
EVE-180/181/182 own UI, integration and release E2E. Browser stale-cache handling
and cross-module history retention/backfill are not delivered by this API slice.
