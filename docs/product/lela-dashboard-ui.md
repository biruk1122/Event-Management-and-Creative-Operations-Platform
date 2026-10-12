# Lela dashboard presentation — EVE-220

## Scope

The existing `/dashboard` route presents all 23 management and 7 employee catalog
cards with shared Lela peach/burgundy tokens, readable summary values, grouped
headings, responsive filter controls and comfortable keyboard/touch targets.
The workspace header distinguishes management from personal work without
role-name checks. Related Reports/Analytics links and existing card drill-downs
require the canonical shell destination permissions as well as card visibility.
Denied cards never expose their titles, values or links.

The catalog, generated contracts, authoritative API, units, cohort/date bounds,
UTC/floating-time semantics, scopes, timestamps, analytics meters/tables, bounded
list previews and export limitation are unchanged. No invented metrics, trends,
charts, new assets, dependencies or endpoints are introduced. Public server-rendered
guidance remains available before the protected client results load.

## States and refresh

Loading, ready-zero, empty, denied, disconnected, selection-required, partial,
unavailable and same-access stale states retain their existing behavior. Refresh
and retry retain focus while busy and suppress repeated activation. Access
rechecks hide protected results, cancel prior reads and evict old epochs.

Existing mutation success, access polling, focus and reconnect continue to
revalidate permissions before REST results. Notification realtime advisories
remain owned by the existing notification feature and never supply dashboard
metrics. There is no existing dashboard-specific socket subscription; this
presentation issue does not invent one. See
[dashboard integration](dashboard-integration.md) for the authoritative refresh
and privacy contract.

## Verification

The dashboard/navigation/server-route unit suite covers all 30 catalog cards,
scope/freshness labels, destination restrictions, empty/denied/error states,
filter submission, busy focus, access epochs, account switching and mutation/focus
refresh. The existing notification-manager suite checks advisory reconciliation.
Browser validation uses isolated PostgreSQL fixtures and real administrator,
management and employee sessions rather than replacement dashboard responses.

Both audience layouts are checked at 360×800, 768×1024 and 1440×900, plus 720px
reflow, in light/dark themes with reduced motion. Screenshots are saved in the
isolated Playwright run's test-results directory. Automated axe WCAG 2.2 AA checks
and both existing Ethiopian-network cold-load/keyboard-refresh profiles retain
their hard thresholds. These laboratory checks do not substitute for human
screen-reader testing, actual browser 200% zoom or production field INP.

### Local delivery evidence

- Dashboard/navigation/server-route tests: 76 passed; existing notification
  advisory tests: 11 passed.
- Full isolated browser rerun `run_eda2043777f9f044`: 19 passed, no failures,
  skips or flakes. The invalid-filter test now waits for login's valid initial
  aggregate before counting invalid-navigation reads; its zero-fetch assertion
  and backend bounds checks remain intact.
- Frontend lint/type checking, E2E type checking, changed-file formatting,
  production webpack build and diff checks passed. Independent review found no
  actionable defects.
- Before an unrelated untracked login reference image was added, bundle budgets
  passed: 646.5 KiB gzipped JavaScript, 13.7 KiB gzipped CSS and 193.5 KiB public
  images. The current workspace-wide image check flags that separate
  `public/branding/login page.png` (1885.3 KiB); it is not changed or included in
  EVE-220. No budget is relaxed.

Backend business logic, contracts, database schema and Docker configuration are
unchanged; no separate full backend or Docker suite is claimed. The browser
harness built the API and applied all 27 migrations to an isolated schema.
