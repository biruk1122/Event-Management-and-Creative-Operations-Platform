# Lela application shell — EVE-216

## Approved navigation decisions

The user explicitly approved the proposed EVE-216 plan in chat on 2026-10-08.
This approval supersedes conflicting draft placement in the earlier navigation
document for these decisions only; it does not change business behavior.

- NAV-03: Meetings stays a separate destination, using the existing `/meetings`.
- NAV-07: mobile shortcuts are Dashboard, Tasks, Calendar and Discuss, plus More.
  Shortcuts without permission are omitted, not replaced by unauthorized links.
  Discuss opens permitted direct messages, otherwise permitted channels.
- NAV-09: Campaigns stays separate, using the existing `/campaigns` screen.
- NAV-06: current grants and scoped screen predicates remain authoritative.
  No role-name inference, new grants or new administration routes.

No global search, account/profile page, organization-settings page, global Files
index or unshipped detail route is introduced. `/todos` and `/departments` use
their shipped spellings, not draft planned URLs. Other open NAV decisions remain
outside this issue. EVE-218 still owns home/post-login entry behavior.

## Implementation

One client navigation boundary is composed by the server root layout, inside the
existing QueryClient provider. Existing pages stay Server Components and keep
their own authorization, headings, main landmarks and URL filter state. The
shell does not wrap another main around them. Login bypasses shell chrome;
unknown routes retain existing 404 content within the same shell.

Desktop uses a burgundy sidebar, group labels, official full logo and a header.
Tablet uses an icon rail and labelled dialog overlay. Mobile uses four permitted
shortcuts and a full-height More drawer. Account/sign-out and one notification
bell remain reachable at every breakpoint. No second notification REST client or
realtime connection is created; the existing notification queries and panel are
reused, and the notification page retains its existing realtime manager.

Sidebar collapse is a browser-local presentation preference keyed by account ID.
No persistence endpoint is added; unavailable storage leaves an expanded sidebar.
Cached destinations and notification previews are hidden while access is being
checked, is paused, has failed, belongs to another account, or sign-out is pending.
Client navigation is convenience only; server and feature guards remain unchanged.

Navigation landmarks have distinct names. The skip link targets the content
region; each existing page keeps its main landmark. Radix Dialog provides focus
trapping and restoration. Page changes close drawers, focus the streamed page
heading and announce it; query-only filter changes do not move focus. Active
state uses the most-specific path boundary, not naive substring matches.

## Validation

Focused unit tests cover permission scopes, mobile priorities, accessible names,
active paths, login exclusion, uncertain/cross-account authority, sign-out,
drawer focus restoration, account-keyed collapse and route focus/announcement.
Real browser tests cover all five canonical accounts, denied analytics, unknown
routes, sign-out followed by another account, light/dark responsive shell and
drawer axe scans, keyboard focus trapping/restoration and reflow.

The 720x450 CSS viewport is an automated desktop reflow approximation, not a
claim of manual browser zoom or assistive-technology certification. Manual
screen-reader/actual browser-zoom release checks remain required. No API, database
schema or container change is in this issue.

### Delivery verification (2026-10-08)

- `pnpm format:check`, frontend lint, frontend type checking and E2E type
  checking passed. `git diff --cached --check` passed.
- Focused shell/navigation/notification regression tests: three files, 22 tests
  passed, including preview retry and expired-authority reconciliation.
- Full frontend run with explicit public test endpoints,
  `--maxWorkers=2 --pool=threads --reporter=dot`: persisted Vitest results cover
  all 179 source test files with zero failed files. The final console summary
  was unavailable after its process session closed; file-level results were
  verified directly. An earlier default-pool run stalled and was stopped; no
  repository test configuration or quality threshold was changed.
- Isolated real-browser run `run_9f17fdee987d29ea`: all 26 checks passed with
  `application-shell.spec.ts accessibility.spec.ts dashboard-integration.spec.ts
reports.spec.ts`. This includes all five role sign-ins, authorized navigation,
  denied analytics, 404 retention, eight light/dark responsive cases, drawers,
  sign-out/account change, real dashboard/report authorization and performance.
  Existing teardown removed the isolated schema. Test-only rate-limit/logging
  environment overrides do not change product settings.
- Initial browser/review findings were fixed: tablet individual CSS translation,
  temporary streamed heading focus, expanded sidebar control contrast, and a
  sign-out test that revoked shared fixture state. Tests now assert drawer
  bounds and reachable first/last destinations and use a private sign-out session.
- Desktop, mobile and tablet viewport screenshots were visually inspected.
  Screenshots and the Playwright report remain in the ignored run directory.
- Production Turbopack build and `pnpm quality:budgets` passed: JavaScript
  537.1 KiB / 750 KiB, CSS 11.6 KiB / 150 KiB and original logo
  170.0 KiB / 1,500 KiB total image budget. Browser journeys also built webpack.
- Independent implementation review findings were fixed and re-reviewed without
  blockers. PR, merge and Linear closure are separate authorized delivery steps.

### PR #131 CI regression correction

- Updated legacy campaign navigation expectations to the approved Campaigns
  destination and explicit Marketing filter. Recovery links and meeting notices
  are located within page content, separately from shell account/live regions.
- The session lifecycle test now signs in with its own session and verifies that
  exact session's revocation, preserving shared setup sessions across retries.
- Month/week calendar chips place the title above wrapping metadata so the
  narrower shell content cannot shrink the title to zero. Day/agenda titles
  wrap long unbroken text; independent Chromium verification retained a 360px
  scroll width with a 500-character title at a 360px viewport.
- Isolated run `run_25fead9d7844eb2f`: 35 tests passed across shell, session,
  calendar, marketing, meetings, notifications and to-do workflows. Its schema
  was removed by teardown. Production webpack build, frontend/E2E type checks,
  focused calendar lint, formatting and two month-view unit tests passed.
- Independent re-review reported no findings. No CI gates were weakened.
