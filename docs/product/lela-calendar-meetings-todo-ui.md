# Lela calendar, meetings and to-do presentation - EVE-227

## Scope

Calendar, Meetings and To-Do now use the shared Lela work header and branded
dialog presentation. Each route's page (or, for Meetings, its screen
component, which owns its own header) wraps its content in `WorkSurface`
instead of a plain `<h1>`/`<p>` block; the Meetings heading is now "Meetings"
with the schedule description moved to the subtitle (its own unit test was
updated for the new heading text). The calendar and to-do create/edit dialogs
and the calendar's read-only entry-detail dialog use `WorkDialogContent`.

Calendar entries carry a `data-entry-type` accent border reinforcing their
existing type badge (non-color-only, since the Badge's text label already
names the type). The calendar and to-do toolbars are marked `data-work-toolbar`
to pick up the shared card presentation already used by every other restyled
feature. To-do rows carry a priority-accented left border, dimmed further when
completed. Meeting rows and the selected meeting's accent, and participant
response coloring, are non-color-reinforced by the existing status Badge and
response text labels. Month, week, day and agenda views, meeting participant
actions, and to-do smart views/toolbar/list/form retain their existing
business logic; none of it was touched.

No API, permission, route, dependency, workspace tab, or business-logic change
was made. The month grid's "Add entry" day-cell affordance now hides below the
`sm:` breakpoint; the day number itself still opens Day view, which exposes a
full-width "Add entry" action, so the capability isn't lost on mobile.

## Verification bugs found and fixed

Writing the new E2E coverage below surfaced four real, pre-existing or
newly-introduced defects, each confirmed and fixed rather than worked around:

1. **Month view mobile target size (pre-existing).** The day cell's "Add
   entry" icon button and its day-number "Open" button sat in the same row and
   were squeezed below the WCAG 2.2 AA 24x24px minimum target size at 360px
   width - never previously exercised, since no prior E2E spec ran an
   accessibility scan against `/calendar` at a mobile viewport. Fixed by
   hiding the per-day add button below `sm:` (the day number still opens Day
   view, which has its own full-size "Add entry" action).
2. **Dialog `autoFocus` focus-restoration race (pre-existing).** `EntryDialog`
   and `TodoDialog`'s Title field used the native HTML `autoFocus` attribute,
   which could steal focus before the dialog's own capture-the-opener logic
   ran, causing the title field - not the external trigger button - to be
   captured as the "return focus here on close" target. Since the title field
   is gone once the dialog closes, closing then sent focus to the first
   surviving toolbar button instead of back to "Add entry". Fixed by removing
   `autoFocus` from both inputs; keyboard users still reach the field first
   via Tab.
3. **Meetings list/detail overflow on mobile (pre-existing).** The meeting
   list button's title wrapper was a plain inline `<span className="min-w-0">`
   (CSS ignores `min-width` on inline elements), and the list/detail
   `<section>`s were unconstrained CSS Grid items (which default to
   `min-width: auto`). Both let a long, unbroken meeting title force
   horizontal overflow at 360px width. Fixed by making the wrapper `block` and
   adding `min-w-0` to both grid sections.
4. **Selected-meeting contrast (introduced this issue).** The new selected-
   meeting accent set the row's background to `--primary` but didn't override
   the nested muted-foreground timestamp text's own color, failing WCAG AA
   contrast against the new background. Fixed with `color: inherit` on the
   selected item's descendants.

## Verification

- 84 scoped calendar/meetings/todo unit tests passed across 13 files (includes
  the updated `MeetingsScreen` heading-text expectation).
- Frontend typecheck, frontend lint (`--max-warnings=0`), and `pnpm
  format:check` passed. `pnpm turbo build --filter=@event-platform/web`
  (Next.js production build) passed.
- Gzipped JavaScript is 550.5 KiB and CSS 16.3 KiB, within the 750/150 KiB
  limits. The image gate fails solely on the unrelated, untracked
  `apps/web/public/branding/login page.png` (1885.3 KiB versus the 500 KiB
  per-image limit) - the same pre-existing, documented exception every prior
  Lela restyle issue has reported; this issue adds no images.
- `pnpm --filter @event-platform/e2e e2e lela-calendar-meetings-todo.spec.ts
  calendar.spec.ts meetings.spec.ts todo.spec.ts`: 17/17 passed, run with
  `API_RATE_LIMIT_MAX=10000 AUTH_LOGIN_RATE_LIMIT_MAX=10000` set explicitly
  (the local `.env`'s `API_RATE_LIMIT_MAX=100` otherwise silently shadows the
  harness's intended test-only ceiling, per the documented gotcha in
  `e2e/fixtures/environment.ts`). Coverage includes two cold-mobile
  performance profiles (360x800 DPR2, cache disabled, LCP <= 4000/6000ms and
  sampled interaction <= 300/500ms) with a keyboard-driven create/Escape/
  focus-return check; and a real, isolated-account (disposable Team Member)
  journey creating a calendar entry, a to-do and an invited meeting through
  the live API, then exercising all three routes across 360x800, 768x1024,
  1440x900 and 720x450 at light/dark, each scanned with axe WCAG 2.2 AA
  (`expectNoWcag22AaViolations`) and checked for horizontal overflow, plus a
  keyboard Tab-containment pass through the calendar create dialog, a real
  to-do completion PATCH verified after reload, and the invited participant's
  own pending meeting response.
- The pre-existing `calendar.spec.ts`/`meetings.spec.ts`/`todo.spec.ts` suites
  (CRUD, isolation, and denied/recovery journeys) continue to pass unchanged,
  confirming no regression to existing business logic.

Push, PR and Linear closure are separate authorized delivery steps, not
claimed here.
