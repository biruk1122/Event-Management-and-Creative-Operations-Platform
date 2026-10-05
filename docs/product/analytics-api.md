# Management analytics API (EVE-172)

This read-only slice implements the definitions in
[the approved read-model catalogue](analytics-read-models.md). It introduces no
commands, mutations, historical snapshots, scheduled jobs, caches, or schema changes.
The generated OpenAPI document and `packages/api-client` contracts describe the
transport. All paths below are under `/api/v1/analytics` and require an authenticated
access-token cookie and the exact measure grant.

| GET path            | Query                                                                   | Permission                              |
| ------------------- | ----------------------------------------------------------------------- | --------------------------------------- |
| `/task-completion`  | `from`, `toExclusive`                                                   | `analytics.management.read`             |
| `/departments`      | period, pagination, optional `departmentId`                             | `analytics.department_performance.read` |
| `/employees`        | period, pagination, optional `employeeId`                               | `analytics.employee_performance.read`   |
| `/events`           | pagination, optional `eventId`                                          | `analytics.management.read`             |
| `/campaigns`        | pagination, optional `campaignId`, `campaignType` (default `MARKETING`) | `analytics.management.read`             |
| `/promotion`        | required `campaignId` for one `PROMOTION` campaign                      | `analytics.management.read`             |
| `/monthly-activity` | whole-month period                                                      | `analytics.management.read`             |

## Authorization and query bounds

`ORGANIZATION` or `MANAGEMENT` scope authorizes organization-wide measures.
Department performance also permits `DEPARTMENT`, restricted to the caller's
current department. A department grant with no current department returns an empty
page. Employee performance does **not** permit department/self scope. Authorization
does not inherit from roles, workspace membership, directory, dashboard, or report
access. Filters intersect the authorized identity set **before** pagination; they
never expand it. Each response contains aggregate counts and identifiers, not user
profiles or operational detail records.

Periods use real `YYYY-MM-DD` UTC dates, include `from`, exclude `toExclusive`,
and span at most 366 days. Monthly queries require first-of-month boundaries and
1–12 complete calendar buckets. Pagination is ID-ordered, 1-based, defaults to
`page=1&pageSize=25`, permits 1–100 items, and caps offset at 10,000. `total` counts
authorized matching entities, including those without work. Unknown optional IDs
return empty pages. Missing/non-promotion campaign subjects return 404 for the
promotion query. Promotion returns at most seven nonempty channel buckets;
monthly queries zero-fill their bounded buckets.

## Metrics and freshness

Task cohorts use creation time and **current** status, excluding cancelled work.
Department ownership is the task's direct department; employee ownership is current
explicit assignment (shared tasks count once for each assignee). Overdue means
pending work with a non-null due date strictly before server `asOf`. Percentages
round completed/non-cancelled totals to a whole percentage and are `null` for an
empty denominator.

Event progress uses all-time tasks directly linked to its workspace. Campaign
progress uses all-time campaign activity statuses. Promotion groups only activities
with promotion extensions, omitting channels whose activities are all cancelled;
ordinary campaign activities do not enter its denominator. Monthly creations count
current records, including cancelled records, for each distinct source type. Monthly
completions count distinct task IDs with a `STATUS_CHANGED` to `COMPLETED` in the
bucket, regardless of creation date or repeated completion history.

Every response carries server `asOf` and `freshness: "live-current-state"`, and
`Cache-Control: no-store`. This is a refresh timestamp, **not** an atomic or
historical snapshot: exported source read interfaces can observe separate commits.
Analytics never reads another module's tables or repository directly. Each source
owns its projection; Promotion obtains activity status counts through Campaigns.
SQL values are bound parameters, schema selection is transaction-local, and each
aggregate statement has a 500 ms PostgreSQL timeout (transaction 2 seconds).

## Errors and verification

Failures use the existing request-correlated `application/problem+json` contract:
401 unauthenticated; 403 missing/invalid scoped measure grant; 400
`VALIDATION_ERROR` for malformed transport input, `ANALYTICS_INVALID_RANGE` for
invalid calendar/range boundaries, or `ANALYTICS_INVALID_PAGE` for excessive offset;
404 `ANALYTICS_SUBJECT_NOT_FOUND`; and 503 `ANALYTICS_UNAVAILABLE` for failed or
timed-out projections. Failures never become successful zero counts. Logs retain
the request ID and safe error code without exposing SQL or credentials.

`analytics.policy.spec.ts` verifies grant, calendar, and offset boundaries.
`analytics.integration.spec.ts` exercises real authenticated HTTP requests over an
isolated migrated PostgreSQL schema, leakage prevention, metric semantics, safe
failures, timeout recovery, and twenty warmed requests per endpoint at the approved
representative volume. Its fixture includes 100,000 tasks, 200,000 assignments,
200,000 history rows, 100 departments, 1,000 employees, 50 events, 100 campaigns,
20,000 activities, 10,000 promotion extensions, and 500 projects/productions each.
The warm p95 acceptance budget is below 750 ms; the operational target is 500 ms.

Local PostgreSQL 18 verification (2026-10-05, twenty warmed HTTP requests per
endpoint) measured p95: task completion 58.9 ms, departments 69.6 ms, employees
80.3 ms, events 84.1 ms, campaigns 53.1 ms, promotion 59.1 ms, and monthly activity
134.1 ms. These are reproducible fixture results, not production capacity guarantees.

Frontend consumption and additional EVE-173 release verification remain separate
issues. This slice does not add UI or speculative drill-down endpoints.
