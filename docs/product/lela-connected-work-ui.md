# Lela connected work presentation - EVE-223

## Scope

The existing Events, Projects, Workspaces and Tasks screens use shared Lela
headers, filter/action surfaces, readable tables/mobile cards and pagination.
Task list, board and existing calendar views retain their controllers; selected
views have a visible inset indicator as well as aria-pressed and brand color.
Board columns and scheduled-task cards use restrained burgundy/peach treatments,
readable status/schedule/assignee information and wrapping long names.

Create/detail dialogs reuse the branded administration presentation and Radix
focus trap, with grouped existing forms/sections, usable mobile scrolling and
reduced-motion styling. List-opened dialogs restore focus to the opener, or a
surviving work-area action/filter when the opener disappears. Task attachments
show the complete filename instead of truncating it. Event file selection,
upload, availability, retry, download and removal retain their existing security
and lifecycle rules.

No API, permission, route, dependency, asset, workspace tab, task action or
drag/drop workflow was added. Existing task status buttons remain available;
there was no existing drag/drop interaction to replace. The generic workspace
screen remains manager/team/participant administration, not a redesigned
workspace or a new Files index. Campaign/production/talent styling is outside
this issue. The shared shell supplies the official company logo and role-aware
navigation; all work styling uses approved semantic light/dark tokens.

## Verification

- Scoped event/project/workspace/task/file and shared-presentation unit checks:
  189 tests across 35 files passed. The independent reviewer additionally passed
  12 shared-dialog/task tests across three files.
- Frontend and E2E type checks, frontend lint, formatting, diff checks and
  production webpack builds passed. Backend build and 27 isolated PostgreSQL
  migrations also ran through the browser harness, without changing contracts.
- Initial browser run `run_cae5e13678a2d979`: 18 of 23 checks passed, including
  five role logins, event/project/workspace CRUD and manager/denied journeys,
  denied file/task operations and both cold mobile performance profiles.
  Three new presentation tests had fixture/selector mistakes (an unscheduled
  calendar task and mobile rows with richer accessible names); these were
  corrected. Two existing file journeys failed because the development MinIO
  host port 9000 was unreachable, not because of changed UI behavior.
- Corrected run `run_5850f4ea5fdf6d32`: all 14 checks passed, including five
  role logins, both mobile profiles, all three responsive presentation journeys,
  secure event upload/download/reload, task assignment/comment/progress/upload/
  submission/review/reload and denied file/task operations. Evidence is in the
  gitignored `e2e/.runs/run_5850f4ea5fdf6d32` directory. Desktop light and mobile
  dark task boards, and mobile dark event/project detail screenshots were
  inspected visually.
- Browser coverage includes light/dark 360x800, 768x1024, 1440x900 and 720x450
  (200%-equivalent desktop reflow), reduced motion, axe WCAG 2.2 AA without
  exclusions, overflow assertions, keyboard dialog entry/Tab containment/Escape
  and focus return. Real event/project API records own the tasks' workspace IDs;
  the existing Tasks route displays those tasks without inventing workspace tabs.
  File checks include invalid selection, long authorized filenames, upload,
  availability, download and database-backed persistence. Empty board search
  and recovery retain the existing filters.
- Cold mobile profiles disable cache at 360x800 DPR2 and enforce existing
  LCP limits of 4000/6000ms and sampled interaction bounds of 300/500ms.
  These lab samples are not field INP measurements.
- JavaScript gzip is 652.1 KiB and CSS 15.5 KiB, within 750/150 KiB limits.
  The overall image-budget gate fails solely on the unrelated untracked
  `apps/web/public/branding/login page.png`: 1885.3 KiB versus 500 KiB per image,
  making total public images 2078.8 KiB versus 1500 KiB. The file and limits
  remain untouched; this issue adds no image.
- Independent actual-diff review and re-review found no remaining findings.

Commands included scoped `pnpm --filter @event-platform/web test ... --maxWorkers=4`,
frontend/E2E `typecheck`, frontend `lint`, `pnpm format:check`, `git diff --check`,
`pnpm quality:budgets`, and:

```text
pnpm --filter @event-platform/e2e e2e lela-connected-work.spec.ts events-admin.spec.ts projects-admin.spec.ts workspaces-admin.spec.ts tasks-collaboration.spec.ts managed-files.spec.ts --project=chromium
pnpm --filter @event-platform/e2e e2e lela-connected-work.spec.ts tasks-collaboration.spec.ts managed-files.spec.ts --project=chromium
```

The second run uses isolated temporary MinIO on host port 19000 with test-only
credentials and bucket. The two existing storage-response assertions honor
`FILE_STORAGE_ENDPOINT`, retaining port 9000 as the default. Development services
and data are unchanged. API/login test-process rate limits were 10000; product
configuration did not change. The harness owns isolated schema teardown.

Manual screen-reader checks, actual browser 200% zoom and field INP remain release
checks. The unavailable workstation frontend/UI-UX/testing skills were replaced
with approved architecture, SRS, installed Next.js guidance and existing shared
Lela patterns. No separate backend, contract, migration or Docker product change
requires additional implementation validation. Push, PR and Linear closure are
separate authorized delivery steps, not claimed here.
