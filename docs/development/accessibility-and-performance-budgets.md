# Accessibility and performance budgets

This document defines the measurable quality gates for the currently shipped
foundation routes. It is the baseline for feature work and for the later
REL-05 accessibility audit and REL-06 performance work; it does not certify
that future, unimplemented routes conform.

## Automated accessibility gate

`pnpm e2e` runs `e2e/tests/accessibility.spec.ts` and the accessibility
assertions embedded in the authenticated administration journeys. The shared
`expectNoWcag22AaViolations` helper runs axe against WCAG 2.0, 2.1, and 2.2 A
and AA rules. Any violation fails the test, regardless of axe impact level.

The critical-flow coverage currently includes:

| Flow                                 | Automated checks                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Sign in -> authenticated home        | WCAG axe scan before and after sign-in; submitting the form with Enter.                          |
| Departments, teams, users, and roles | WCAG axe scan on the list surface and its create dialog during the real role-authorized journey. |

Automation cannot determine every WCAG 2.2 AA condition. Before a release that
changes a covered flow, verify the changed flow manually with keyboard only and
with NVDA + Firefox or VoiceOver + Safari: landmark and heading announcements,
useful control names and error messages, logical focus order, visible focus,
dialog focus restoration, 200% zoom/reflow, and reduced-motion behavior. Record
the browser, assistive technology, route, and any exception in the release
evidence.

## CI-enforced frontend artifact budgets

`pnpm quality:budgets` measures the production Next.js build. It uses gzip for
JavaScript and CSS, and source bytes for `apps/web/public` images. The Quality
CI job runs it immediately after `pnpm build`.

| Asset class                                | Per asset |     Total |
| ------------------------------------------ | --------: | --------: |
| JavaScript under `.next/static` (gzip)     |   250 KiB |   750 KiB |
| CSS under `.next/static` (gzip)            |    75 KiB |   150 KiB |
| Images in `apps/web/public` (source bytes) |   500 KiB | 1,500 KiB |

The artifact gate is deliberately route-agnostic while the foundation has few
routes. A new route or an unusually large dynamic asset must stay within these
limits or have an approved, measured exception. REL-06 will add route-level
LCP/INP and image-delivery enforcement once the dashboard critical paths exist.

## API and user-perceived response targets

Measurements use the deployed build, exclude a first request that initializes
the process or connection pool, and report p95 from at least 20 sequential
samples for a release check. The Playwright E2E gate exercises the same
authenticated paginated read with five warm samples as a fast regression guard.

| Operation                                            |               p95 target |       Hard release limit |
| ---------------------------------------------------- | -----------------------: | -----------------------: |
| Health/readiness and authenticated paginated read    |                   500 ms |                   750 ms |
| Authenticated create, update, or deactivate mutation |                 1,000 ms |                 1,500 ms |
| Page navigation on the baseline mobile profile       | LCP 2,500 ms; INP 200 ms | LCP 4,000 ms; INP 300 ms |
| Page navigation on the constrained mobile profile    | LCP 4,000 ms; INP 300 ms | LCP 6,000 ms; INP 500 ms |

Run the API guard with `pnpm e2e`; it fails when the warm p95 for
`GET /api/v1/users?page=1&pageSize=25` exceeds 750 ms. For release sampling,
use an authenticated account with equivalent role and data volume, discard the
first sample, save all timings, and calculate the nearest-rank p95.

All list endpoints default to 25 items and reject `pageSize` values above 100.
New list APIs must preserve that maximum (or use a documented cursor limit) and
must not silently return an unbounded collection.

## Ethiopian-network and responsive release profiles

Use browser DevTools or CDP network emulation with caching disabled. These are
product test profiles, not claims about every Ethiopian connection.

| Profile                     |    Downlink |      Uplink |    RTT | Device viewport   | Required check                                                                                              |
| --------------------------- | ----------: | ----------: | -----: | ----------------- | ----------------------------------------------------------------------------------------------------------- |
| Ethiopia mobile baseline    |    1.6 Mbps |    750 Kbps | 300 ms | 360 x 800, DPR 2  | Sign in and the changed critical flow meet the baseline row above; no horizontal overflow.                  |
| Ethiopia mobile constrained |    400 Kbps |    250 Kbps | 600 ms | 360 x 800, DPR 2  | Sign in and the changed critical flow remain operable; loading, error, and retry states are understandable. |
| Tablet                      | Unthrottled | Unthrottled |   0 ms | 768 x 1024, DPR 1 | Verify the EN-03 tablet navigation behavior and keyboard order.                                             |
| Desktop                     | Unthrottled | Unthrottled |   0 ms | 1440 x 900, DPR 1 | Verify the desktop navigation behavior, visible focus, and 200% zoom reflow.                                |

For each changed critical flow, capture the profile, viewport, cache state,
route, LCP and INP values, API p95 data, and screenshots or trace in release
evidence. A hard-limit breach blocks release; a target miss without a hard-limit
breach needs an owner and remediation issue.
