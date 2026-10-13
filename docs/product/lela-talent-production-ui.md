# Lela talent and production presentation - EVE-224

## Scope

Talent and production routes reuse the shared Lela work headers, action/filter
surfaces and branded form dialogs. Talent profiles group existing fields,
schedule entries and assignments into readable sections. Production cards,
schedule/manager summaries, resource groups and existing workspace tabs use
semantic light/dark tokens, visible focus and wrapping long content. Selected
tabs retain text, aria-selected and a non-color inset indicator.

Existing permissions, workspace scope, API contracts, filters, pagination,
assignment conflicts, schedules and production lifecycle rules are unchanged.
No analytics, uploads, scheduling integration, resource workflow or dependency
was added. Overlapping talent schedules remain permitted by the existing API;
duplicate event assignments still return their existing conflict feedback.

## Verification

- 66 scoped talent, production and shared work unit tests passed across 10 files.
- Frontend and E2E type checks, frontend lint and production webpack build passed.
  The browser harness also built the API and applied 27 migrations to its isolated
  PostgreSQL schema; no database or contract implementation changed.
- Browser run `run_30bc7bd3d8104ba1` passed all 11 checks: five role logins,
  two new presentation journeys and four existing authorized/denied talent and
  production journeys. The harness owns isolated schema teardown.
- Presentation checks cover light/dark 360x800, 768x1024, 1440x900 and 720x450
  (200%-equivalent desktop reflow), reduced motion, axe WCAG 2.2 AA without
  exclusions, long profiles and production names, overlapping schedules,
  duplicate-assignment feedback, date validation, empty filter recovery,
  keyboard entry, dialog containment/Escape and focus return. Existing journeys
  verify resource assignment, persistence and production lifecycle restrictions.
  Screenshots are retained in the gitignored run directory. Mobile dark
  production details and desktop light talent profile were inspected visually.
- Independent review found Tailwind utility selectors being scoped by CSS
  Modules instead of matching the existing elements. They now use explicit
  global utility selectors under local component roots, so the text-size and
  wrapping overrides apply without leaking into other screens.
- Re-review found no remaining findings. Post-fix run `run_79fe0f97a3bd908c`
  rebuilt production assets and passed all seven checks (five role logins and
  both responsive presentation journeys). Compiled CSS was inspected to verify
  the global utility selectors match unchanged Tailwind classes. Its isolated
  PostgreSQL schema was removed successfully by the harness.
- JavaScript gzip is 653.4 KiB and CSS 15.9 KiB, within 750/150 KiB limits.
  The overall image-budget gate fails on the unrelated untracked
  `apps/web/public/branding/login page.png`: 1885.3 KiB versus 500 KiB per image,
  making total public images 2078.8 KiB versus 1500 KiB. That file and the limits
  remain untouched; this issue adds no images.

Commands included scoped `pnpm --filter @event-platform/web test ... --maxWorkers=4`,
frontend/E2E `typecheck`, frontend `lint`, `pnpm format:check`, `git diff --check`,
`pnpm quality:budgets`, and:

```text
pnpm --filter @event-platform/e2e e2e lela-talent-production.spec.ts talent.spec.ts productions.spec.ts --project=chromium
```

The test processes used API/login rate limits of 10000; product configuration
did not change. Manual screen-reader checks, actual browser 200% zoom and field
performance measurements remain release checks. Unavailable workstation
frontend/UI-UX/testing skills were replaced with approved architecture, SRS,
installed Next.js guidance and existing shared Lela patterns. The PDF skill
guided inspection of the relevant talent and production SRS requirements.
Push, PR and Linear closure are separate authorized delivery steps.

## PR #139 CI correction

The first full-suite CI run exposed an ambiguous Events navigation selector,
an invalid shared select height utility that allowed long assignee menus to
extend outside the viewport, and a dashboard response-body race during
navigation. The navigation assertion now matches the exact accessible name;
the select correctly resolves Radix's available-height variable; the dashboard
test leaves the post-login page before capturing and eagerly reading its fresh
response. Existing business assertions and actionability checks remain intact.

Run `run_932a675eed059354` passed all 13 checks across events-admin,
tasks-collaboration, dashboard-integration and select-overflow, including real
uploads, denied roles and a new long-menu desktop/mobile regression. Frontend
and E2E type checks, frontend lint, changed-file formatting, diff checks and the
production build passed. Independent actual-diff review found no findings.
The harness removed its isolated database schema successfully.
