# Dashboard API and persistence verification

EVE-179 verifies the [DSH-01 contract](dashboard-query-contracts.md) and
[dashboard API](dashboard-api.md). This slice adds verification, not UI,
infrastructure, persisted aggregates or new metric definitions.

## Reproduction and isolation

```text
pnpm --filter @event-platform/api test:integration dashboards.integration.spec.ts
```

Supply `DATABASE_URL` for a reachable PostgreSQL 18 instance. The existing
integration helper creates a random `it_` schema, deploys committed migrations,
and drops only that schema after the suite. It does not reset application data.
The test imports environment-dependent providers after setting the isolated URL.
Unrelated reminder/outbox schedulers and file-storage providers are disabled.

Only `Date` is frozen at `2026-10-06T12:00:00Z`; timers, network I/O and
`performance.now()` stay real. Creation-cohort fixtures explicitly use UTC
timestamps. The clock is restored during cleanup.

## Evidence covered

- All 23 management and seven employee cards; exact overview counts and analytics
  cohort, department, event, campaign and monthly results, including null rates.
- UTC lower/upper equality, interval overlap, undated work, pending/completed/
  cancelled distinctions, overdue equality and floating To-Do time/ID ordering.
- Real authenticated Supertest requests; invalid/repeated fields, paired cohort
  ranges, wrong bounds, audience entry and private no-store responses.
- Caller ownership with identical roles, live custom/department grants, missing
  department, department switches, assignment and conversation-membership
  revocation, and session revocation without obtaining new access cookies.
- Tuple-based unread cursors, own/deleted messages, cursor persistence on GET,
  rollback visibility and committed changes reflected on the next read.
- SQL-side list truncation, mixed-source ordering/deduplication and `hasMore`.
- Real statement-timeout cancellation, successful siblings during a source
  failure, all-source failure, error sanitization and post-failure recovery.
- Missing versus nonexistent promotion selection and exact selected promotion
  channel totals on the representative fixture.

## Query-plan and latency gate

Reuse the approved [analytics-scale fixture](../../apps/api/test/fixtures/analytics-api-scale.sql):
100,000 tasks, 200,000 original assignments, 200,000 task-activity rows, 20,000
campaign activities, 100 campaigns, 50 events, 500 projects, 500 productions,
1,000 users and 100 departments, in addition to the small exact fixture.
The suite adds caller assignments and dates/statuses so dashboard operational
lanes do real work rather than benchmarking only empty lists.
Refresh planner statistics after adding caller assignments and changing operational
dates/statuses, before measuring. This avoids benchmarking an out-of-date estimate
of the heavily assigned caller's work.

For each complete audience response, warm once and then take 20 authenticated
HTTP samples. Require warm p95 below the approved 750 ms API budget, no
unavailable cards, all expected keys and bounded returned lists. The management
sample includes selected promotion and the maximum 12 monthly buckets.

Capture the actual parameterized owner SQL executed by these requests. Run
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` in the same isolated schema; require
at least 20 distinct source statements, at most 12 returned rows per statement
(monthly buckets; ordinary lists select limit + 1), and planning plus execution
below 500 ms. Emit statement hashes, returned row counts, elapsed time and buffer
counts without bindings or private SQL values. Planner node choices and elapsed
times are observations, not brittle exact snapshots across PostgreSQL releases.

Passing this deterministic fixture gate does not establish a production SLA for
every deployment or arbitrary data volume. EVE-182 retains release/browser E2E;
EVE-180/181 retain responsive UI, stale-cache recovery and visual accessibility.
