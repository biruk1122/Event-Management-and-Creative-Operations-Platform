# Management analytics verification (EVE-173)

This slice verifies the [approved metrics](analytics-read-models.md) and
[EVE-172 API](analytics-api.md). It changes tests and documentation only: no
commands, public contracts, business behavior, indexes, or migrations are introduced.

## Acceptance evidence

| Criterion                                    | Automated evidence                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact known-fixture results                  | Authenticated Supertest assertions for all seven queries, current-state cohorts, cancelled/under-review work, shared assignments, direct department/workspace ownership, empty denominators, promotion-only extensions, zero-filled monthly families, and deduplicated completion history.                                   |
| Security and period/range boundaries         | Complete three-permission/six-scope policy matrix; custom single-measure grants and revocation with the same cookie; current department reassignment; authorized filtering before paging; 401/403; calendar/leap-year/366-day/month and offset bounds; injected IDs and client `asOf` rejected before any source projection. |
| Deterministic tests and representative plans | Fixed fixture IDs/UTC dates and exact expected counts; isolated migrated PostgreSQL schemas; restored temporary mutations; committed versus rolled-back status/history; source uniqueness and composite ownership FK conflicts; actual runtime SQL plans and existing design specimens at representative cardinalities.      |

`apps/api/src/analytics/analytics.policy.spec.ts` owns pure policy tests.
`apps/api/test/analytics.integration.spec.ts` exercises the real NestJS transport,
authentication, scoped authorization, application composition, and owning source
queries. `analytics-read-models.integration.spec.ts` retains ANA-01's independent
SQL specimens and PostgreSQL timezone evidence. No approval is inferred from an
implementation test run; independent PR review remains part of delivery.

The HTTP harness verifies its source connection selects the isolated schema before
creating principals. Unrelated task/meeting reminder timers and the notification
relay are overridden in this harness so wall-clock jobs cannot mutate fixtures or
consume the benchmark pool. This is query verification, not a background-job load test.

## Persistence and error semantics

Source mutations occur only inside the disposable integration schema. Tests commit
status, task ownership, and assignment changes, then verify refreshed counts through
HTTP. A deliberately rolled-back status/history transaction leaves no completion
throughput behind. Temporary data and principal assignments are restored in
`finally` blocks. Duplicate task assignments and cross-campaign promotion extensions
are rejected by existing constraints without inflating aggregates. Since analytics
is read-only, these are source persistence conflicts, not invented analytics 409
mutation endpoints.

Microsecond timestamps immediately before UTC midnight, explicit timezone offsets,
the exclusive next-month boundary, and repeated completions in different months
have exact bucket assertions. Overdue equality/null rules remain covered by the
existing runtime and specimen tests. Refresh metadata remains live-current-state,
not historical or globally atomic. Ordinary reads leave operational task rows unchanged.

Invalid input is rejected before aggregate SQL. Failed single or composed reads
return request-correlated Problem Details, never successful zero counts or partial
monthly results. A slow, otherwise valid SELECT proves the 500 ms statement timeout
cancels execution; a subsequent query proves pool recovery after rollback.

## Runtime query-plan reproduction

The existing scale fixture supplies 100,000 tasks, 200,000 assignments, 200,000
history rows, 100 departments, 1,000 employees, 50 events, 100 campaigns, 20,000
activities, 10,000 promotion extensions, and 500 projects/productions each.
All relevant tables are analyzed before profiling.

The HTTP benchmark discards a warmup and measures twenty requests per endpoint,
including authentication and composition. It captures the actual parameterized SQL
passed to the source `readModel` interfaces, then runs twenty
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` samples per distinct statement in the same
isolated schema. Parameters are bound; values are not printed in plan logs. Nearest-rank
p95 is sample 19 of 20. Assertions bound root result rows to 100 and enforce the
existing 500 ms database target and 750 ms API release budget.

Determinism means reproducible fixture semantics, query shapes, ordered pages,
sample counts, and budget assertions. It does **not** freeze planner operator choices,
buffer counts, or timings: hardware, statistics, and PostgreSQL can legitimately
choose different plans. Broad aggregates may use sequential scans. No production
capacity guarantee or new index requirement follows from the benchmark.

With a reachable PostgreSQL 18 and the repository's normal test environment:

```sh
pnpm --filter @event-platform/api db:generate
pnpm --filter @event-platform/api test
pnpm --filter @event-platform/api test:integration analytics.integration.spec.ts analytics-read-models.integration.spec.ts --reporter=verbose --disableConsoleIntercept
pnpm --filter @event-platform/api typecheck
pnpm --filter @event-platform/api lint
pnpm format:check
```

The API unit suite supplies explicit test environment values. Integration tests
provision all committed migrations and drop only their validated disposable schema;
they do not reset the application database. Frontend/UI integration and deployment
verification remain separate issues.

## Local verification evidence

On 2026-10-05 (Node 24.11.0, pnpm 10.18.1), API generation, type-checking, lint,
661 unit tests, the 29-test authenticated analytics suite, and the two existing
read-model specimen tests passed. Repository formatting and diff checks passed.
The final isolated HTTP run measured warm p95 69.7–185.0 ms across seven endpoints;
the eighteen actual runtime statement shapes measured p95 1.6–131.5 ms. Every shape
received twenty plan samples. These numbers are fixture evidence, not capacity claims.

No frontend builds, browser end-to-end tests, Docker builds, schema changes, or
contract regeneration were needed: the delivery changes only API verification tests
and this report. PR review and CI remain separate delivery gates.
