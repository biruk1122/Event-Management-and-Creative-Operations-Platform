# Management analytics UI (EVE-174)

This records the UI-only delivery slice. [EVE-175's integration](analytics-integration.md)
supersedes the disconnected route with authoritative API data and scoped navigation.

## Delivery boundary

`/analytics` is a Server Component route that checks current scoped grants with
an uncached permission request. Expired sessions return to sign-in; failed
permission checks use the existing route error/retry boundary. The interactive
feature workspace is a Client Component. It consumes only generated OpenAPI
response aliases, supplied per-measure states, and controller callbacks.

EVE-174 delivers UI composition, not live metric transport. The route displays
an explicit **not connected** state, never fixtures or successful zero counts.
EVE-175 owns API queries, URL/filter state, permission refresh/cache invalidation,
refresh completion notices and pagination transport. Primary navigation is not
advertised until live integration ships. No backend, schema, contract, export
endpoint, chart dependency, or global store is added.

## Views and semantics

The measure selector contains only permitted capabilities, never role-name
branches. Organization/management grants authorize the exact corresponding
measure. Department-only grants do not authorize employee performance or other
management measures. Ordinary employees receive a denied surface, not a fabricated
self-performance dashboard. The server remains the authority for filtering and
authorization; client presentation never filters a broad response into a scope.

- Task completion: count cards, eligible denominator, pending/overdue, textual
  percentage and native meter. An empty denominator says “No eligible work”.
- Department/employee: paged, ID-ordered work counts. IDs remain identifiers, not
  invented names or links requiring unrelated directory/workspace access.
  Employee attribution explains shared tasks and non-additive totals.
- Event/marketing campaign: current all-time delivery, not task creation period
  or lifecycle status. Promotion: required campaign UUID and channel delivery,
  not reach, revenue or ROI.
- Monthly: separate five-family creation counts and distinct-task completion
  throughput, not an ambiguous activity sum. Current month may be partial.

Every successful response displays its own server timestamp, period where
applicable, and live/current-state caveat. Source composition is not a globally
atomic or historical snapshot. Metric definitions follow
[the catalogue](analytics-read-models.md) and [API](analytics-api.md).

## Interaction and recovery

UTC filters explicitly label the exclusive end. Cohorts allow at most 366 days;
monthly views require first-of-month boundaries for 1–12 months. All-time views
do not render date inputs. Subject filters validate UUIDs and promotion requires
a campaign. Entity pages offer 25/50/100 rows, previous/next bounds, and disable
next beyond offset 10,000 with narrowing guidance. Apply invokes the controller;
it does not locally relabel old response data as freshly filtered results.

Loading, disconnected/disabled, error/retry, denied, empty, partial failure,
refresh-in-progress and success notices are explicit. A denied/error/loading
panel never renders stale successful counts. Mixed success/error panels retain
the successful data while warning about unavailable measures. Export is visibly
disabled with an accessible explanation because no analytics export contract
exists. Controller callbacks are absent/disabled in the disconnected route.

## Accessibility and responsive design

Existing shadcn Button/Input/Label and theme tokens provide consistent controls
and contrast. Native selects, date inputs and semantic tables keep keyboard and
screen-reader behavior conventional. Text/counts accompany every meter; no
meaning relies on color. Tables have captions, scoped headers, and keyboard-
focusable named scroll regions. Horizontal scrolling is contained to wide tables,
not the page. Cards use two columns on mobile and four above the small breakpoint;
filters stack and then expand. Actions wrap and are never hover-only.
No chart library, images or motion is added.

Component/route tests cover all seven measures, grant loss, denominator semantics,
filters, scoped pagination, keyboard selection, failure/recovery, and honest
disconnected routing. Production browser reflow (360/768/1440px, 200% zoom), axe,
theme contrast and manual NVDA/VoiceOver checks remain release validation under
[the accessibility/performance budgets](../development/accessibility-and-performance-budgets.md).
Component tests alone do not certify WCAG conformance or network performance.

Local Chromium component verification on 2026-10-06 rendered all seven measures
with generated-contract fixtures and production-build CSS. Each view passed an
axe WCAG 2.0/2.1/2.2 A/AA scan and document-width overflow assertion at 360, 768,
and 1440 pixels (21 view/width combinations). The mobile monthly table screenshot
was visually inspected: scrolling stays inside its named table region. These are
rendered-component checks, not authenticated live API journeys or hydration tests.
Dark-theme/zoom and manual assistive-technology release checks remain outstanding.

Local implementation verification passed:

- `pnpm --filter @event-platform/web test --maxWorkers=4`: 166 files,
  1,198 tests, including 26 new analytics component/route/policy presentation tests.
- `pnpm --filter @event-platform/web lint` and `typecheck`.
- `pnpm format:check`, targeted Prettier checks, and `git diff --check`.
- `pnpm --filter @event-platform/web build` and `pnpm quality:budgets`:
  gzipped JavaScript 639.7 KiB / 750 KiB; CSS 11.6 KiB / 150 KiB.

Tests/type checking used the existing validated frontend environment variables;
build used production mode. An initial full test invocation without those values
failed the existing marketing suite at environment validation; the final run with
the required environment passed every suite. API/database/contract/Docker checks
were not rerun because this slice changes no backend, schema, contract or container.
Independent PR review and live end-to-end verification remain delivery gates.

## EVE-175 integration checklist

- Supply exact generated responses for each matching measure; fetch only granted
  measures and intersect optional IDs on the backend. Do not query employee or
  department directories merely to obtain labels.
- Key queries by account/scope, measure, normalized period/subject and page size;
  reset page on filter changes and cancel/remove data on permission/session loss.
- Distinguish 401/403/400/404/503; never convert failures to empty success.
- Preserve draft filters on retry; do not present stale filtered pages as current.
- Announce refresh completion only after a successful read, using that response's
  timestamp; avoid polling or query fan-out not justified by the selected view.
- Verify authenticated navigation and browser accessibility/reflow with live API
  integration before exposing the destination in primary navigation.
