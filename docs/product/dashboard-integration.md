# Live dashboard integration

EVE-181 (DSH-05) connects the [EVE-180 presentation](dashboard-ui.md) to the
[approved dashboard contracts](dashboard-query-contracts.md). Dependencies
EVE-179, EVE-180 and EVE-29 were verified Done.

## Authoritative reads

The protected `/dashboard` Server Component checks uncached effective permissions
before rendering the interactive screen. Expired sessions redirect to login;
failed access lookups fail closed. Home navigation advertises the dashboard only
after current entry grants are verified. No role names determine access.

The browser uses the generated API client for authenticated, `no-store` GETs to
the management or employee aggregate endpoint. It requests the full selected
audience catalogue (23 or seven keys). The API, not client filtering, enforces
entry, source, assignment, membership and department boundaries. No list endpoint
is fetched to calculate totals. There are no production fixtures, approximate
counts, frontend database calls, new contracts or API changes.

## Queries, ranges and recovery

Applied audience/day/limit and management cohort bounds/month buckets/campaign
selection live in the URL. Limits remain 1–10 and months 1–12. Cohort dates are
paired, valid UTC calendar dates, ordered, and at most 366 days apart. Empty
cohort bounds use the server's current UTC month. Employee requests contain only
cards/day/limit, never management filters or caller-selected identities. Unknown
or duplicate URL keys, invalid ranges and unauthorized audience choices issue no
aggregate request and offer a reset link.

Dashboard lists are bounded previews with authoritative `hasMore`, not offset
pagination. Use source workspaces for full lists. Analytics counts/rates and
tables retain their generated metadata; missing results are unavailable, never
disconnected success or invented zeroes. A partial card keeps successful sources
visible and exposes source-level retryability. A card retry refreshes the bounded
composition, updating sibling results consistently. Refresh and retry announce
actual success or partial failures without moving focus; overlapping actions are
disabled while fetching. Existing source mutations remain the only write paths.

Problem Details status/code/request IDs map to public recovery messages. Raw
details, SQL and private resource-existence text are never rendered. Global
401/403 hides all results and evicts dashboard queries. Non-transient validation
failures do not display old data; same-access transient failures may retain the
last successful response with its original timestamp and an explicit stale label.
No persistent cache or server stale fallback is introduced. Export remains
disabled because no approved export endpoint exists.

## Access and invalidation

TanStack Query keys include account, effective grant fingerprint, access-check
epoch, audience, requested cards and every applied filter. Abort signals reach
the generated client. Access polling, focus and reconnect revalidate access
before another aggregate request. During pending/paused/failed checks, cached
metrics disappear and old requests are canceled/evicted. Every successful access
epoch replaces old results even when grants are unchanged, covering department
or membership changes not represented in the permissions DTO. Logout and login
use the existing auth cache boundary; account/grant changes never reuse old data.
Inactive dashboard queries have zero retention.

A successful existing TanStack mutation conservatively invalidates access first,
then the fresh epoch refetches the live dashboard. This also handles ownership or
membership changes rather than merely adjusting a displayed count. No speculative
socket subscription or global state is added.

Unsubmitted filter drafts are retained separately from metric data, scoped to
account, grant fingerprint and applied selection. Same-access polling/focus
cannot silently discard an edit or apply it. Audience, applied URL, account or
grant changes reset the draft. Refresh always uses applied filters, not drafts.

## Verification and follow-up

Targeted tests exercise generated requests, all bounds, Problem Details,
authoritative and denied card states, partial retries, stale failures, 401/403,
access uncertainty, account changes, same-grant epochs, logout, focus, mutation
invalidation, draft preservation, navigation and protected routes.

Real-service Playwright smoke tests use separate disposable PostgreSQL schemas:
management counts match the aggregate response and increase after a task write;
bounded ranges survive reload; responsive layouts and axe checks pass. Employee
To-Do comes from the caller's actual write, and a management deep link sends no
management request for an employee. The harness cleans its schema on completion.

EVE-182 remains the comprehensive release E2E slice (cross-account privacy,
reconnect/network interruption, release performance and manual screen-reader
verification). No infrastructure, database, branding or theme selector changes
are included here.

### Delivery evidence

- Web and E2E type checking, web lint, scoped formatting and diff checks passed.
- Full frontend run: 1,314 passed; the sole failure was the home-page isolation
  fixture missing the new navigation mock. That fixture was corrected using its
  existing conventions; the final focused rerun passed all 67 dashboard/home
  tests. No runtime fix or weakening of assertions was needed for that failure.
- Real-service browser run: both dashboard journeys and five authentication setup
  tests passed. The disposable PostgreSQL schema was removed by teardown.
- The production Webpack build completed; asset budgets passed at 679.0 KiB
  gzipped JavaScript and 10.6 KiB CSS. A local runner startup timeout required
  reusing those completed builds with a local-only longer startup allowance;
  tracked CI settings and browser assertions were unchanged.
- Independent review found no remaining blocking findings after the draft-reset
  correction; late-response/logout and non-transient error tests also passed.
