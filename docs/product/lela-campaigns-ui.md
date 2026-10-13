# Lela campaign, marketing and promotion presentation - EVE-225

## Scope

The Campaigns route reuses shared Lela work headers, filters, action surfaces,
tables/mobile cards and branded create/detail dialogs. Campaign identity, type,
status and dates have a grouped summary. Existing workspace-section buttons
retain their accessible names and aria-current, with a non-color inset indicator.
Activity cards, schedules, readable progress figures, marketing strategy/people
summaries and promotion activity selection use approved semantic light/dark
tokens, visible focus and wrapping long content.

No API, lifecycle, approval, authorization, filter, pagination, workspace ownership
or connected-task behavior changed. Promotion configuration and talent assignment
remain governed by their existing grants; strategy conflicts retain drafts.
No publishing, integration, budget KPI, chart, upload, dependency or image was
added. Marketing and promotion remain the existing campaign work areas, not new
roles or routes. Shared shell branding is unchanged.

## Verification

- 282 scoped campaign, marketing, promotion and shared work unit tests passed
  across 21 files. Frontend/E2E type checks, frontend lint, formatting, diff
  checks and production webpack build passed. Vitest required process permission
  escalation after the sandbox initially prevented its worker startup.
- Browser run `run_e79981156eef5365` passed all 17 checks: five role logins,
  campaign authorized/limited/denied workflows, marketing connected strategy/
  campaign/activity/task persistence and concurrent-conflict/denied checks,
  promotion channel/talent persistence/conflicts and the talent.assign boundary,
  two new responsive journeys and both cold-mobile performance profiles.
- New journeys cover light/dark 360x800, 768x1024, 1440x900 and 720x450
  (200%-equivalent desktop reflow), reduced motion, axe WCAG 2.2 AA without
  exclusions, document/dialog overflow, long campaign/activity/strategy content,
  empty strategy and filtered campaign/activity recovery, form validation,
  keyboard entry, dialog Tab containment/Escape and focus restoration.
  Screenshots are in the gitignored run directory. Desktop light marketing
  strategy and mobile dark promotion activity screenshots were inspected.
- Cold mobile 360x800 DPR2 profiles disable cache and retain existing baseline/
  constrained LCP bounds of 4000/6000ms and sampled interaction bounds of
  300/500ms. These are lab samples, not field INP measurements.
- JavaScript gzip is 651.4 KiB and CSS 16.0 KiB, within 750/150 KiB limits.
  The overall image gate fails on the unrelated untracked
  `apps/web/public/branding/login page.png`: 1885.3 KiB versus 500 KiB per image,
  making total public images 2078.8 KiB versus 1500 KiB. It and the limits remain
  untouched, and the image is not part of this issue.
- Independent actual-diff review found no findings. The browser harness built
  the API, applied 27 migrations to an isolated PostgreSQL schema and removed
  that schema after validation; no product database or contract changes were made.

Commands included scoped `pnpm --filter @event-platform/web test ... --maxWorkers=4`,
frontend/E2E `typecheck`, frontend `lint`, `pnpm format:check`, changed-file
Prettier checks, `git diff --check`, `pnpm quality:budgets`, and:

```text
pnpm --filter @event-platform/e2e e2e lela-campaigns.spec.ts campaigns.spec.ts marketing.spec.ts promotion.spec.ts --project=chromium
```

API/login test-process rate limits were 10000; product configuration did not
change. Manual screen-reader testing, actual browser 200% zoom and field
performance remain release checks. Unavailable local frontend/UI-UX/testing
skills were replaced by approved architecture, installed Next.js guidance and
existing patterns. The PDF skill guided SRS promotion/marketing requirements
inspection. Push, PR and Linear closure require separate authorization.
