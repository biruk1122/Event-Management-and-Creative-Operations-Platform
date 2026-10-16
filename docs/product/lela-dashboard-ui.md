# Lela dashboard presentation — EVE-220

## Scope

The existing `/dashboard` route presents all 24 management and 7 employee catalog
cards with shared Lela peach/burgundy tokens, readable summary values, grouped
headings, responsive filter controls and comfortable keyboard/touch targets.
The workspace header distinguishes management from personal work without
role-name checks. Related Reports/Analytics links and existing card drill-downs
require the canonical shell destination permissions as well as card visibility.
Denied cards never expose their titles, values or links.

The catalog, generated contracts, authoritative API, units, cohort/date bounds,
UTC/floating-time semantics, scopes, timestamps, bounded list previews and export
limitation are unchanged. Public server-rendered guidance remains available before
the protected client results load.

**Visual update (follow-up to this issue):** the user explicitly asked for a
modernized look with real charts, reversing this issue's original "no invented
metrics, trends, charts, new assets, dependencies" boundary. Recharts is now an
approved dependency, scoped to the remaining Analytics-group cards and the
budget card: a horizontal bar chart sits above the event/marketing/promotion
comparison tables (the tables themselves are unchanged), and a mini comparison
bar is added inside each budget list item. Every other card keeps its existing
number/list presentation, now with an icon badge and modernized card/typography
treatment.

**Relocation (follow-up to the visual update):** task completion rate,
department performance and monthly activity moved from the dashboard to the
`/analytics` page, where they are permanently pinned above its existing
single-measure selector (see [lela-analytics-ui.md](lela-analytics-ui.md)).
They render only there now; the dashboard's management catalog dropped from
27 to 24 entries (31 total catalog cards across both audiences, down from 34).
No card was renamed or re-scoped in the move, no metric was invented beyond
what the existing per-measure analytics endpoint already returns, and no new
API endpoint was added - the pinned panels reuse the same `fetchAnalytics`
gateway and permission checks the single-measure selector already used. Charts
supplement the existing textual/numeric content; they never replace it.

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

The dashboard/navigation/server-route unit suite covers all 31 catalog cards,
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
