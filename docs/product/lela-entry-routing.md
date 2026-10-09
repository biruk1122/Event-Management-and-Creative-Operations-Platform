# Lela entry routing (EVE-218)

## NAV-08 decision

The previous navigation document left NAV-08 open and the original helper accepted
any single-slash path. EVE-218, explicitly requested by the user on 2026-10-09,
authorizes safe, permitted, implemented return destinations and dashboard fallback.
This issue resolves that decision only for shipped routes; it does not approve new
routes, permissions or infrastructure.

- Signed-out `/` goes to `/login?next=/`; authenticated `/` goes to `/dashboard`.
- An authenticated `/login` goes to `/dashboard` before rendering the form,
  regardless of its `next` value. Session validity is checked against the API with
  forwarded cookies and `no-store`, not inferred from cookie presence.
- Successful login defaults to `/dashboard`. A root `next` also resolves there.
- Return paths must be exact implemented shell destinations available through the
  newly signed-in account's current scoped grants, or `/notifications` with
  `notification.read`. Query and fragment state are retained unchanged.
- The two implemented Discuss catch-all routes additionally accept a single UUID.
  The existing conversation API must authorize that record and match the DM/channel
  route kind before it is accepted. Record authorization remains authoritative on
  the destination and may change after the check.
- External/protocol-relative URLs, backslashes, controls, malformed percent encoding,
  encoded path segments, normalized dot segments, login/API routes and nonexistent
  pages fall back to `/dashboard`. Denied dashboard audiences also fall back.
- A permission/read-check outage after successful sign-in fails closed to the
  dashboard; it does not report bad credentials or expose a denied destination.
  Entry session-check outages use the existing error/retry boundary, not a login loop.

No authentication endpoints, cookie rotation, session lifetimes, refresh APIs,
sign-out flows or dashboard audience selection rules are changed. Reports and
Analytics remain in the existing Overview shell group based on actual grants.
Direct denied navigation continues to show the destination's existing denial UI;
only post-login `next` selection falls back.

The existing workspace routes and loading skeleton live inside a URL-neutral
`(workspace)` route group. This preserves their loading behavior while keeping
the entry/login session checks outside that skeleton: anonymous server-rendered
login remains visible without JavaScript. No route spellings or page contents
are changed by this file move.

The visible server-rendered login fields are read-only and the submit/reveal
controls disabled until hydration attaches the existing form handlers. This
prevents early input being discarded by React Hook Form on slower connections.
Without JavaScript the labelled form remains visible with an explicit explanation.

## Verification

Validation on 2026-10-09:

- Auth unit suite: 80 tests passed; shell suite: 18 passed. Moved workspace
  route/loading coverage: 22 passed, including the two server-page suites rerun
  with the required non-secret public API environment settings.
- Scoped frontend ESLint, frontend/E2E type checking, formatting and diff checks
  passed. The production Webpack build passed with the final route group and
  hydration-readiness guard. An earlier pre-group Turbopack build also passed;
  it is not evidence for the final route-group change.
- Final Webpack bundle budgets passed: JavaScript 641.5 KiB / 750 KiB,
  CSS 12.6 KiB / 150 KiB and images 193.5 KiB / 1500 KiB.
- The production-browser run `run_ad53f1444ce63be4` passed 37 of 38 selected
  checks, including all six entry-routing cases, real login/expiry/sign-out,
  permitted/denied return paths, role-aware navigation, responsive screenshots,
  accessibility, reduced motion and performance samples. The remaining assertion
  was a no-JavaScript paragraph selector; the visible form and explanation were
  rendered correctly. After scoping the selector to the visible form, the focused
  rerun `run_db99b8128219ad92` passed the remaining case. All 38 selected cases
  therefore passed across the broad run and the focused rerun, not one clean
  full-suite run. The isolated database schema was dropped by teardown.
- Independent review found no blocking findings in the implementation, unchanged
  route moves or hydration guard; the reviewer independently ran unit coverage.

No screenshot alone constitutes completion. Manual assistive-technology and actual
browser zoom remain release checks; automated equivalent reflow is not claimed as
manual zoom. Full backend tests and Docker image builds were not rerun locally:
there are no backend/schema changes, and the updated Docker entry smoke remains a
CI verification step. Initial browser runs exposed real rendering/hydration
regressions which were fixed, not waived. A later isolated-port collision prevented
one rerun from starting; its own test schema was explicitly cleaned up.
