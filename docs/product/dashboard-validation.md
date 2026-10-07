# Role-based dashboard end-to-end validation

EVE-182 validates the SRS 5.1.1/5.1.2 workflows against the
[approved dashboard contract](dashboard-query-contracts.md), using the real
production frontend, NestJS API and disposable PostgreSQL schema.

## Reproduction

```text
pnpm --filter @event-platform/e2e e2e dashboard-validation.spec.ts dashboard-integration.spec.ts --project=chromium
pnpm --filter @event-platform/e2e typecheck
pnpm quality:budgets
```

Supply the existing harness's local `DATABASE_URL`. Provisioning deploys all
committed migrations and seeds canonical authenticated users. Historical analytics
fixtures deliberately isolate creation-cohort assertions from current writes.
Personal records and private conversations use unique IDs; cleanup targets only
those fixture IDs. Global teardown drops only the validated run-owned schema.
No production fixture, new schema, dashboard contract or infrastructure is added.

The first browser run exposed two presentation defects. Busy refresh/retry now
uses guarded `aria-disabled` controls so temporary busy state does not remove
keyboard focus. The server route renders useful public dashboard guidance before
hydration, following the analytics route pattern; protected metrics and controls
still wait for current permissions. These corrections remain within dashboard
quality/recovery scope.

## Coverage

- Organization overview counts are checked against independent database facts,
  then against rendered cards. Task creation/refresh and URL filter persistence
  remain covered by the integration journeys.
- Known analytics facts cover the lower-inclusive/upper-exclusive cohort,
  completed/cancelled/pending work, selected promotion, missing selection and
  null rates for empty cohorts. No eligible work must not render a percentage meter.
- Personal schedules prove UTC midnight inclusion and next-midnight exclusion;
  another caller's calendar and To-Do remain hidden. To-Do previews are bounded,
  advertise more rows and retain floating date/time semantics.
- Real account switching, task-assignment removal and conversation-membership
  removal suppress protected rows on the next read. Dashboard reads do not advance
  unread cursors or expose message bodies. Employee management deep links are
  denied without a management fetch; direct API calls enforce 403/401.
- Invalid URL filters issue no aggregate read. Server validation rejects caller
  identity selection, duplicate cards, impossible dates and oversized bounds.
- An isolated transaction locks the fixture's tasks table so real source statement
  timeouts yield unavailable cards while successful siblings remain readable.
  Releasing the lock and retrying restores authoritative values. A browser network
  abort separately verifies explicit stale labels, original timestamps, keyboard
  focus retention and real-service recovery.
- Axe WCAG 2.2 AA checks cover success, empty, partial failure and recovery.
  Responsive checks cover 360/768/1440 CSS pixels and 720-pixel desktop reflow,
  existing light/dark tokens and reduced motion. These do not add a theme selector.
- Both full audience compositions are warmed once and sampled sequentially twenty
  times; nearest-rank p95 must meet the approved 750 ms hard limit. Attachments
  retain every sample. The migration count must equal all committed migrations.
- Cache-disabled Ethiopian baseline/constrained mobile profiles enforce LCP
  4,000/6,000 ms and sampled interaction bounds 300/500 ms respectively. The
  Event Timing 16 ms floor is explicit; short-journey observations are not field INP.
  Metrics and screenshots are retained with the existing Playwright report.

The complementary [EVE-179 verification](dashboard-verification.md) covers all
thirty cards, representative-scale SQL plans, custom/department grants, tuple
read cursors, declined meetings, ordering/deduplication and all-source failure.
The browser suite verifies user-visible composition and recovery rather than
duplicating every owner persistence test.

## Release limitations

Automated axe, keyboard and CSS-pixel reflow checks do not certify manual assistive
technology behavior. NVDA/Firefox or VoiceOver/Safari review, actual browser zoom,
production-scale deployment measurements and full accessibility conformance remain
release evidence under EVE-187/EVE-188. Record browser/AT versions and exceptions
there; do not claim those manual checks were performed by this automated suite.

## Delivery evidence

On 2026-10-07, run `run_7ccf108dc399dce2` passed all 19 Playwright tests
(12 validation journeys, two integration journeys and five authentication setups).
Both approved mobile profiles passed unchanged hard limits. All 27 migrations
deployed successfully; teardown removed the disposable schema.

All 67 dashboard component/controller/gateway/selection/route tests passed.
Frontend and E2E type checking, frontend lint, scoped formatting and diff checks
passed. Both production builds passed. Asset budgets measured 679.0 KiB gzipped
JavaScript and 10.6 KiB CSS, with no public images. Independent re-review found
no remaining actionable defects after the assertion and presentation corrections.

Unchanged backend unit/database-scale suites and Docker builds were not rerun;
there are no backend, contract, migration or container changes. Repository-wide
unit suites were not duplicated for this focused dashboard verification slice.
Push, PR checks, merge and Linear completion remain separate authorized delivery
steps; this local evidence does not claim CI or release certification.
