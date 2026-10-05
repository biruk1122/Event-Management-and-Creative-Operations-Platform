# Analytics metric definitions and read paths

- Delivery slice: EVE-171 (ANA-01)
- Source: SRS 5.1.1 Analytics, 5.8, 5.9, 5.18 and section 11 Performance.
- Runtime delivery: EVE-172; this slice adds no endpoint, dashboard or scheduler.

This catalogue defines the six management analytics measures in SRS 5.1.1 and
employee performance from SRS 5.18. It resolves OD-13 for these analytic
measures only. It does not redefine editable task progress, lifecycle entry
criteria, report narratives or the separate dashboard overview/communication
cards. Performance is a set of transparent work counts and rates, not a
weighted score, employee ranking, attendance assessment, reach, revenue or ROI.
The source schema has no authoritative inputs for those additional measures.

## Common semantics

- A period is a half-open UTC interval `[from, toExclusive)`. Monthly buckets
  begin at UTC midnight on the first calendar day; no server/session timezone
  changes their membership. Convert inclusive UI dates at the API boundary.
- Cohort measures select tasks **created in the period**, then inspect their
  **current** status. They are not historical snapshots or completion throughput.
  This prevents dividing completions from old backlog by newly created work.
- `asOf` is a server-generated refresh timestamp used for overdue comparisons
  and response freshness. It is not a client-selected historical snapshot.
  An incomplete task is overdue only when `due_at < asOf`; missing due dates
  and exact equality are not overdue.
- Non-cancelled tasks are `TODO`, `IN_PROGRESS`, `UNDER_REVIEW`, `BLOCKED` and
  `COMPLETED`. Pending means the first four. Under Review is **not completed**.
- Counts are non-negative integers. A rate is `round(100 * numerator /
denominator)` to the nearest whole percent (positive halves round up, matching
  the existing campaign API). Always return numerator and denominator alongside
  a rate. With no eligible work, counts are zero and the rate is `null`, never
  a misleading 0% or 100%. Unknown/unauthorized entities are not empty entities.
- Current assignments and ownership determine attribution. Reassignment can
  change past-period cohort results; do not imply historical membership or
  historical department staffing, which the source schema cannot reconstruct.
- Deleted records are absent. This is live operational analytics, not an audit
  archive. Neither the outbox nor audit log is repurposed as an activity store
  (ADR 0001). Never mine report narrative text to manufacture numeric facts.

## Metric catalogue

`C` below is non-cancelled tasks created in the selected period. `completed`,
`pending` and `overdue` use the common status/time rules. Counts have no
denominator; percentages have the stated denominator. All measures use live
source reads and share the freshness contract below.

| SRS measure / specimen                               | Numerator and authoritative input                                                                        | Denominator                                                                               | Period and attribution                                                                                                              | Empty/null behavior                                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Task completion rate / `task_cohort`                 | Count of tasks in `C` currently `COMPLETED`; also return pending and overdue counts                      | Count of `C`                                                                              | Selected creation cohort; organization management scope; task rows counted once regardless of assignee count                        | Zero counts; null rate                                                                     |
| Department performance / `department_cohort`         | Completed, pending and overdue counts in `C` with `tasks.department_id = department.id`                  | Count of that department's `C` for completion rate                                        | Selected creation cohort; explicit owning department, **not** the creator's/assignees' department or teams linked to a workspace    | An authorized department without work has zero counts and null rate                        |
| Employee performance / `employee_cohort`             | Completed, pending and overdue tasks in `C` assigned through `task_assignments.user_id`                  | Count of that employee's assigned `C` for completion rate                                 | Selected creation cohort; current explicit assignee, not creator, reviewer or comment author                                        | An authorized user without assignments has zero counts and null rate                       |
| Event progress / `event_progress`                    | Completed tasks directly linked to the event's `EVENT` workspace                                         | Non-cancelled tasks directly linked to that same workspace                                | Current all-time event work; not limited to a creation period or expanded through related projects/campaigns                        | No tasks: zero counts and null progress; never infer progress from Event status            |
| Marketing campaign progress / `campaign_progress`    | Completed `campaign_activities` for the campaign                                                         | All its non-cancelled activities                                                          | Current all-time; use MARKETING campaign IDs for marketing views; same formula as `CampaignsRepository.progressFor`                 | No activities: zero counts and null progress                                               |
| Promotion performance / `promotion_delivery`         | Completed promotion-extension activities grouped by `promotion_activities.channel`                       | Non-cancelled extension activities for the authorized promotion campaigns in each channel | Current all-time delivery progress; the activity's campaign FK fixes ownership; tasks/talent assignments do not multiply activities | No eligible channel work: omit that channel row; an empty set has no rate, not 0% delivery |
| Monthly activity overview / `monthly_creation`       | Count created rows separately for tasks, events, general projects, specialized productions and campaigns | None; **do not add the categories into an ambiguous activity total**                      | UTC creation month, including subsequently cancelled rows; each entity counted once in its owning family                            | Every requested month/family is present with zero if empty                                 |
| Monthly completion throughput / `monthly_completion` | Distinct task IDs with `task_activities.type = STATUS_CHANGED` and `details.to = COMPLETED` in the month | None; this is a count, not the cohort completion-rate numerator                           | UTC transition month, even for tasks created before the month; duplicate transitions for one task in a month count once             | Every requested month is present with zero if empty                                        |

Shared tasks count once in organization/department totals and once for each
current assignee in employee rows. Employee row totals are consequently **not
additive**. Tasks without a department contribute to organization/event metrics
but not a fabricated department; tasks without an assignee do not belong to a
fabricated employee. Promotion channel rates must be recomputed from summed
counts if an overall rate is needed, never averaged as percentages. A campaign
can contain ordinary activities without promotion extensions; campaign progress
and promotion delivery intentionally have different denominators.

Daily/weekly/monthly reports retain their existing authored narrative sections
and read projections. In particular, `TasksReportFactsQuery.completedInPeriod`
is completion **throughput**, while `ProjectsReportFactsQuery` reads current
author-owned project counts. Neither is silently replaced by an organization
cohort rate. Major achievements and challenges remain authored text.

## Permission scope and module ownership

Use the existing permission catalogue and effective grants, never role-name
branches or a frontend visibility check. EVE-172 must enforce grants at both
transport and application boundaries, then pass server-resolved scope to the
source module's exported read interface.

| Read model                                                                   | Required permission and scope                                                                                                                               |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organization task rate, event/campaign/promotion analytics, monthly overview | `analytics.management.read` at ORGANIZATION or MANAGEMENT                                                                                                   |
| Organization-wide department measures                                        | `analytics.department_performance.read` at ORGANIZATION or MANAGEMENT                                                                                       |
| Own department measures only                                                 | `analytics.department_performance.read` at DEPARTMENT, resolved from the acting user's current department assignment; no department means no permitted rows |
| Employee measures                                                            | `analytics.employee_performance.read` at ORGANIZATION or MANAGEMENT; no SELF/DEPARTMENT fallback is implied                                                 |

These are aggregate-read capabilities, not permission to expose underlying
tasks, budgets, personal To-Dos, private conversations, calendar entries, audit
records or employee profile fields. Drill-downs require their owning module's
read checks. `report.read`, `dashboard.read`, workspace management and directory
access do not grant analytics access. Mixed/custom grants must be checked per
measure: omit/deny an unauthorized measure rather than query it and hide it.

For department, employee and workspace/campaign rows, filter IDs are intersected
with the server-authorized set **before** aggregation and pagination. Empty sets
return no rows; no `null`/empty-array shortcut broadens scope to organization.
Nonexistent rows must not reveal denied entity existence. Department membership
does not grant employee performance. Management monthly models are deliberately
organization-only; department activity trends are not silently inferred.

The SQL in [analytics-read-models.sql](../../apps/api/test/fixtures/analytics-read-models.sql)
is executable design/benchmark evidence, **not** a runtime authorization layer.
Tasks owns task/cohort, assignment, event-workspace task and completion queries;
Campaigns owns campaign activity progress; Promotion owns extension/channel
reads through approved Campaigns interfaces; each operational owner supplies
its own monthly creation counts. Analytics composes those exported read
interfaces. It must not import another module's repository or directly query
all of their tables. No Prisma types become public API contracts; EVE-172
generates its DTO contracts through backend OpenAPI as usual.

## Freshness, paging and bounded work

- Read committed PostgreSQL source data on each refresh. No cache, materialized
  view, duplicated counters, background refresh or new infrastructure is added.
  Return `asOf`/calculation metadata with every measure; no push/realtime SLA
  is implied. Errors are unavailable data, never successful zeroes.
- Within one source read, all counts come from a single statement snapshot.
  Composed module reads can observe different commits; do not claim a global
  point-in-time snapshot. A future need for one requires an approved unit-of-work
  design, not cross-module repository access.
- Runtime input validation belongs to EVE-172: valid UTC dates, `from < to`,
  maximum 366-day cohort interval, and at most 12 complete calendar-month
  buckets for monthly queries. Reject invalid/oversized requests before SQL;
  do not truncate them silently. Current-month buckets are partial observations.
- Entity rows default to 25, maximum 100; deterministic ID order, with an
  authorized ID batch of at most 100. Select an authorized page in its source
  module before measuring where possible. Specimen offsets are bounded to
  10,000 for the future runtime interface; deeper navigation needs a cursor,
  not an unbounded OFFSET. Filters and page counts use the same scoped set.
- Promotion yields at most seven approved channels; monthly creation yields
  at most 60 rows (12 months x 5 source families), completion at most 12.
  Organization aggregates are one row. A page limit bounds returned groups,
  not aggregate input work: source-cardinality growth still requires profiling.

## Query-plan evidence and index decision

The [integration suite](../../apps/api/test/analytics-read-models.integration.spec.ts)
deploys all committed migrations into a disposable PostgreSQL 18 schema. Its
small authoritative fixture verifies rates, cancelled/under-review handling,
UTC interval and overdue boundaries, shared assignees, explicit department
ownership, empty/denied ID sets, deterministic pagination, duplicate completion
history, and promotion/campaign denominator differences.

The representative fixture contains 100,000 tasks, 200,000 assignments,
200,000 task-history rows, 100 departments, 1,000 users, 50 events, 100 campaigns,
20,000 campaign activities, 10,000 promotion extensions, 500 general projects
and 500 productions, spread across two years for task/history reads.
After `ANALYZE`, each of the eight models gets a discarded warm read followed
by 20 `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` samples. CI logs the nearest-rank
p95 (sample 19 of 20), result cardinality and actual scan/index choices when
run with the verbose command below; the normal CI integration run enforces
the same budget assertions.

The database-only planning + execution p95 must fit the existing **500 ms**
warm-read target from [performance budgets](../development/accessibility-and-performance-budgets.md).
The API's 750 ms hard release limit remains unchanged; database-only evidence
does **not** certify network/API p95 or production capacity. Rerun on production-
representative hardware/data, include request/auth/composition cost, and measure
at least 20 warm requests before releasing EVE-172. Each module read must also
have a bounded statement timeout in that runtime implementation.

Existing owner/status task indexes, user-assignment indexes and campaign-activity
indexes are candidates for scoped reads. Organization/year-wide aggregates may
appropriately use sequential scans; requiring an index scan on a broad aggregate
would be misleading. Add indexes/views/durable projections only after a measured
budget miss, with before/after plans and explicit migrations. This slice adds
none. Local PostgreSQL 18 validation on 2026-10-05 produced the following
planning + execution p95s (20 samples per model; measurements are evidence for
this fixture, not production capacity guarantees):

| Model              | p95 (ms) | Returned rows | Representative access path                  |
| ------------------ | -------: | ------------: | ------------------------------------------- |
| Task cohort        |   11.074 |             1 | Sequential task scan                        |
| Department cohort  |   21.606 |           100 | Sequential task/department scans            |
| Employee cohort    |   53.952 |           100 | Sequential assignment, task and user scans  |
| Event progress     |   55.823 |            50 | Sequential task scan; bitmap workspace scan |
| Campaign progress  |    7.166 |           100 | Sequential activity/campaign scans          |
| Promotion delivery |    9.472 |             1 | Sequential activity/extension scans         |
| Monthly creation   |   45.591 |            60 | Sequential scans of the five owning tables  |
| Monthly completion |   70.277 |            12 | Sequential task-history scan                |

The broad fixture favors scans over indexes and stays well within the target.
Do not add write amplification just to force a different plan. Reproduction
also logs buffer hit/read counts; changes in fixture size/selectivity, hardware
or planner statistics can legitimately change the plan and timings.

Run with a reachable local PostgreSQL 18 and `DATABASE_URL`:

```sh
pnpm --filter @event-platform/api test:integration analytics-read-models.integration.spec.ts --reporter=verbose --disableConsoleIntercept
```

## Follow-up boundary

EVE-172 owns runtime services, scope resolution, validation, timeouts, OpenAPI
responses and request-level tests. Dashboard/chart implementation and release
profiling remain their assigned issues. Attendance, marketing reach/conversions,
financial ROI, weighted performance scores, historical staffing snapshots and
audit/activity replay are not delivered or implied by these source measures.
