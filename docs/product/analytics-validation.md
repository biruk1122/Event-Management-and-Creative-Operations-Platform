# Management analytics end-to-end validation (EVE-176)

This slice validates the shipped read-only analytics contract using isolated
fixtures and Playwright journeys. Result rendering explicitly selects promotion
by measure rather than detecting a metadata property. Public workspace context
renders before hydration; grants, controls and metric data remain permission-gated.
It adds no schema changes, production mocks, new metrics or infrastructure.

## Authoritative fixture

`e2e/fixtures/analytics.ts` uses the existing guarded isolated-schema helper.
It refuses a datasource that differs from the harness marker. UUID-scoped cleanup
restores the canonical department manager and removes only fixture records;
global teardown drops the disposable schema. Historical September 2001 values
do not depend on current wall-clock creation dates or other journeys' current
records. Foreign keys and constraints remain enabled.

| Measure                         | Known September 2001 expectation                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| Task cohort                     | 1 completed / 3 eligible, 2 pending, 1 overdue, 33%                                            |
| Department A                    | 1 / 2, 1 pending, 1 overdue, 50%                                                               |
| Assigned employee               | 1 / 1, 100%; the shared task also belongs to its other assignee                                |
| Event all-time direct workspace | 3 / 5, 60%; includes tasks outside the cohort                                                  |
| Marketing activity progress     | 1 / 2, 50%; cancelled activity excluded                                                        |
| Promotion radio extensions      | 1 / 2, 50%; ordinary activity and cancelled social extension excluded                          |
| Monthly source counts           | 4 tasks, 2 events, 1 project, 1 production, 2 campaigns, 2 distinct completed task transitions |

The fixture includes exact UTC start/end records, an August backlog task,
cancelled work, Under Review, a shared assignment, repeated completion history,
an empty department/event and 29 departments to exercise bounded paging.
Tests compare both real API responses and rendered cards/table cells with these
known facts, not merely one API response with its own display.

## Coverage and evidence

`e2e/tests/analytics-validation.spec.ts` covers management success for all seven
measures, authoritative freshness/no-store metadata, null denominator versus
unknown subject, zero-filled months, exclusive end boundaries, deterministic
server pagination and URL reload. Malformed dates, oversized ranges/pages and
non-month boundaries are rejected; invalid UI inputs send no metric requests.

Department-manager journeys verify the current department only, disallowed
department filters, no current department, denied employee performance and a
same-grant membership change during a focus recheck. The latter also verifies
that unsubmitted filters survive without being applied. Ordinary employees
cannot request any management measure, even when explicitly assigned fixture
tasks; deep links make no browser metric requests. Expired sessions redirect to
sign-in and unauthenticated transport returns 401.

The failure journey takes an exclusive `tasks` lock only in the disposable
schema. The real backend's bounded projection timeout returns 503 Problem
Details; UI partial failure does not display synthetic zeroes. Releasing the
lock and retrying recovers authoritative counts. No response is intercepted or
fulfilled with a mock.

The suite checks all committed migrations are applied and records 20 warmed
authenticated samples for each endpoint, enforcing the existing 750ms hard p95
limit. `analytics-http-p95` is a report attachment. This small correctness
fixture is **not** production-capacity evidence; EVE-173's representative-volume
PostgreSQL/API benchmarks remain complementary.

Chromium mobile checks disable cache and emulate the documented Ethiopia
baseline/constrained profiles at 360x800/DPR2. They record LCP and short-journey
Event Timing interaction samples, enforcing the existing hard limits. Events
below Chromium's 16ms observation floor are recorded as an upper bound, not an
invented zero INP. Attachments contain raw measurements and screenshots; the
short journey does not claim field-wide or percentile interaction performance.

WCAG 2.2 A/AA axe checks run on every measure and scoped/recovered states, with
no rule exclusions. Monthly tables are checked at 360/768/1440px and a 720px
desktop-200%-reflow equivalent, in both root-class dark and light themes with
reduced motion. Keyboard refresh and horizontal table-region scrolling are
verified. The 720px viewport is not manual browser-zoom certification.

## Run

```sh
pnpm --filter @event-platform/e2e typecheck
pnpm --filter @event-platform/e2e e2e analytics-validation.spec.ts analytics-integration.spec.ts
pnpm quality:budgets
```

Use the standard local PostgreSQL 18 harness environment. A local `.env` can
override its test rate-limit defaults; set `API_RATE_LIMIT_MAX=10000` and
`AUTH_LOGIN_RATE_LIMIT_MAX=10000` in the command environment, matching CI, for
the 140-request timing sample. No production environment is changed.

## Local validation — 2026-10-06

Run `run_369080194fbd3913` passed all 19 browser tests (including five
authentication setups and three existing integration journeys). All 27 committed
migrations applied, and both API and production Webpack frontend builds passed.
All 73 analytics unit tests, frontend lint/type checking, E2E type checking,
repository formatting and diff checks passed. Independent Codex review found no
blocking findings. Unchanged backend unit suites were not rerun.

All seven warmed HTTP p95 values were below 67ms (750ms hard limit), on the small
correctness fixture only. Cold-cache mobile LCP was 924ms baseline and 2348ms
constrained; sampled interaction upper bounds were 16ms and 40ms respectively.
The unchanged profile limits remain enforced. Gzipped assets measured 666.3KiB
JavaScript and 10.5KiB CSS, within the 750KiB/150KiB hard limits.

## CI performance correction

PR #123's first CI run passed 90 journeys but failed constrained-mobile LCP.
The permission-loading heading was replaced when verification finished. The
screen now keeps that public context mounted across verification/rechecks and
renders gated controls separately; metric hiding and cache eviction are unchanged.
The regression test verifies heading and scope DOM identity. Mobile reports now
save paint candidates before asserting the unchanged performance limits.

Correction run `run_5b367143e8795476` passed all 19 targeted browser tests without
retries, including baseline/constrained LCP of 916ms/2224ms and sampled interaction
bounds of 16ms/32ms. The 73 analytics unit tests passed. GitHub CI must still verify
the pushed correction on its runner.

## Residual release checks

Record actual command results and attachments in the delivery comment/PR.
Do not equate writing these tests with a passed run. Manual NVDA + Firefox or
VoiceOver + Safari, meaningful focus/announcement checks, and actual browser
200% zoom still require human release evidence under the existing budgets and
EVE-187; automated checks do not certify full WCAG conformance. Independent
review, CI and merge remain required before closing the issue.
