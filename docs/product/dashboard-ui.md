# Role-based dashboard presentation

EVE-180 (DSH-04) delivers the presentation slice for SRS 5.1.1–5.1.2 and
[the approved dashboard contract](dashboard-query-contracts.md).

## Delivery boundary

`/dashboard` is a protected Server Component route. It checks uncached effective
permissions, redirects expired sessions, and fails closed when access cannot be
verified. The workspace renders all 23 management and seven employee card
definitions only when entry and source grants permit them. Denied responses are
omitted, including their titles and links. Roles are never inferred from names.

This route deliberately displays **not connected**, not fixtures or zero totals.
EVE-181 owns live endpoint integration, query keys, filters, cache invalidation,
scope/account transitions, permission polling and navigation wiring. No API,
database, global navigation, company branding or theme-switcher changes are made.
The UI uses existing light/dark theme tokens and shadcn controls.

## Interaction and accessibility

Management sections separate Overview, Today, Communication and Analytics. The
employee view groups caller-only work. Cards collapse to one column on narrow
screens; overview expands to three columns and other groups to two. Tables stay
inside labelled, keyboard-focusable horizontal scroll regions. Native meters
have textual count/rate alternatives, and no diagram is the sole information
source. Headings, labels, a results skip link and visible native/control focus
support keyboard use.

Each card independently presents loading, empty, ready, selection-required,
partial or unavailable state. Source failures are labelled, denied sources are
not listed, and retry actions are offered only for retryable failures. Zero
counts are valid ready results. To-Do dates/times remain floating; operational
instants and the selected day explicitly remain UTC. Lists preserve server
ordering and indicate truncation. Analytics IDs are not replaced by invented
names or additional directory requests. Links lead to existing, independently
authorized source workspaces; no invented entity-detail routes are used.

Export remains disabled with an accessible explanation because no dashboard
export contract exists. Refresh, applied-day/campaign filtering, audience changes
and success notices are callback-driven; disconnected controls cannot imply a
successful request. Cohort/month/limit query controls remain integration work.

## Integration obligations

The controller must pass only responses belonging to the currently verified
account, audience, grant scope and applied query. Set `accessStatus` to checking,
error or signedOut before rendering cached results during any access transition;
all protected content is then hidden. Never relabel old data after a scope change.
Only same-account/same-scope last-successful data may use `staleKeys`, retaining
its original server `asOf`. Clear stale results on session loss. `onAudienceChange`
is controlled: the controller switches the audience and its matching panels
together rather than reinterpreting the old response.

## Verification

Component and route tests cover catalogue completeness, entry/source scope,
permission revocation, session/access uncertainty, denied card suppression,
loading/empty/zero states, partial source retries, floating dates, truncation,
keyboard form submission, accessible tables/meters and disconnected controls.
Delivery verification: 22 targeted component/route tests and all 1,271 web tests
passed, alongside web lint, type checking and the production build. Generated
assets met the budgets (668.8 KiB gzipped JavaScript; 11.6 KiB gzipped CSS).
Independent review found no remaining blocking findings after source-permission
and partial-retry regressions were corrected.

Headless Chromium checked static component markup with production CSS in both
audiences and light/dark themes at 360, 768 and 1440 pixels: no WCAG A/AA axe
violations, page-width overflow or skip-link focus failures. Tablet/desktop also
passed 200% CSS zoom containment. This is not hydrated or live endpoint testing;
the existing shared body minimum of 320 CSS pixels remains unchanged. The browser
harness and screenshots are local ignored build artifacts, not product routes.

Live API journeys and network interruption tests belong to EVE-181/EVE-182.
Manual screen-reader release verification is still required by the repository's
[accessibility budgets](../development/accessibility-and-performance-budgets.md).
