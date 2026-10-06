# Live management analytics integration (EVE-175)

The `/analytics` route checks authenticated grants on the server, then the client
rechecks current access before mounting its query controller. Navigation follows
the same exact measure keys/scopes. Only the selected authorized measure is
requested; no parallel seven-endpoint fan-out, directory lookups, mutation,
report export or synthetic data is introduced. The API remains authoritative
for department/employee/subject filtering, denominator semantics and freshness.

## Transport and URL state

The gateway uses `packages/api-client` generated endpoint/query/response types.
GET requests forward TanStack Query's abort signal and use `cache: no-store`.
Each endpoint receives only applicable bounded parameters. Marketing progress
explicitly requests `MARKETING`; promotion requires a campaign UUID. UTC cohort
and monthly boundaries follow [the API](analytics-api.md), not local timezone.
Default dates cover the current UTC calendar month (including its partial current
observation); page size defaults to 25, UI choices are 25/50/100, and offset is
bounded to 10,000. Invalid URL inputs do not issue metric requests or silently
expand into an unrestricted query.

`measure`, applicable `from`/`toExclusive`, `subjectId`, `page` and `pageSize`
are URL state. Apply and measure changes reset page to 1; paging uses applied
filters, never unsubmitted draft fields. Reload/back/forward reconstruct state.
Switching to monthly resets dates to valid whole-month boundaries. Query keys
include user, sorted effective grants, permission-check epoch, measure and the
canonical selection. There is no `asOf`/scope override, identity list truncation,
client-side filtering of a broad response, or handwritten parallel API contract.

## Recovery and sensitive-cache handling

Changed selections do not use previous-page placeholder data. Loading/error
states never display stale successful counts as the current filtered response.
Previously visited permitted measures can remain available after an unrelated
measure fails; unavailable measures are not zeroes. Refresh preserves drafts and
announces success only after an authoritative successful response. Each displayed
response retains its server timestamp and live-current-state caveat.

Problem Details map 400 validation/range/page, 404 subject-not-found and 503
unavailable codes to safe recovery messages. Unknown/network failures do not
expose raw backend detail or substitute mock data. A 401/403 hides the entire
analytics controller and clears/cancels cached/in-flight analytics until access
is rechecked. Permission-check failure, session loss or missing grants also
fail closed. Permission revalidation hides metrics while checking and changes
the query epoch even when the returned grants are identical: current department
membership is server-resolved and absent from the permission response contract.
This prevents reusing an old department projection after a successful access
recheck. Existing access polling/focus checks are retained; analytics itself adds
no polling. Export remains explicitly disabled without an approved contract.

Unsubmitted filter drafts live only in screen-level memory, scoped to the user
and the selected measure's applied filters. They survive controller remounts
during polling/focus permission rechecks, without being applied to API requests.
Changed applied filters/measures or a different user do not reuse the old draft.
No metric responses are retained in this draft state; fail-closed hiding and
permission-epoch cache eviction remain unchanged.

The follow-up draft-retention correction passed 75 targeted analytics tests,
including unchanged-access/focus rechecks, an in-flight access check and user
switching. Independent re-review also ran those 75 tests and reported no
findings. Frontend type checking, lint, formatting, production build and asset
budgets passed (664.4 KiB JavaScript, 11.6 KiB CSS). The full browser suite was
not rerun for this state-only correction; the original integration evidence
below remains separate.

## Verification

Gateway, URL, query-controller, cache-revocation, navigation and server-route tests
cover all endpoints, bounded inputs, authoritative data, scoped/deep-link denial,
same-grant revalidation, paging, refresh/draft retention and partial failure.
`e2e/tests/analytics-integration.spec.ts` exercises real authenticated API counts,
refresh after durable task creation, URL reload, responsive monthly tables/axe,
promotion not-found and an ordinary employee denial. It runs only against the
standard isolated migrated schema; production mocks are prohibited.

```sh
pnpm --filter @event-platform/web test --maxWorkers=4
pnpm --filter @event-platform/e2e e2e analytics-integration.spec.ts
```

Local verification on 2026-10-06 passed 1,244 frontend tests, 661 API tests,
one API-client test and eight authenticated Chromium tests (including setup).
The final targeted route/integration rerun passed 73 tests. Chromium verified
real counts after task creation, monthly URL reload, WCAG checks and no page
overflow at 360/768/1440px. The route explicitly fills the app's flex layout;
wide monthly tables scroll within their own labeled region.

Formatting, workspace lint/type checks, the standard production build and
Prisma generation passed. The
isolated browser harness deployed all existing migrations and dropped its own
schema afterward. No schema, API contract, dependency or Docker changes are
included, so separate migration/contract/container changes are not required.
Independent pull-request review remains a delivery gate; this verification is
not self-approval.

EVE-176 owns the broader analytics release/end-to-end validation slice. Manual
screen-reader, dark-theme/zoom and constrained-network release checks still
follow [the existing budgets](../development/accessibility-and-performance-budgets.md).
