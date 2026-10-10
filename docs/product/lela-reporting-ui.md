# Lela reporting screens (EVE-219)

## Scope and preserved behavior

The existing `/reports` surface uses the Lela brand tokens, shared application
shell/logo, and existing buttons, inputs, labels, badges and page header. No new
dependencies, backend contracts, permissions, scoring formula or delivery service
are introduced.

- Daily, weekly and monthly lists retain the authoritative server count, filters,
  date-range validation, pagination and selection. Desktop tables and mobile cards
  show the same records, status and ownership; period guidance is explanatory,
  not an invented dashboard metric.
- Draft metadata, narrative sections and workspace choices have distinct groups.
  The filled-section indicator measures only locally entered narrative fields;
  it is not an employee-performance score or submission authorization.
- Switching report types preserves entered narrative text for a switch back,
  while save payloads include only the current type's supported fields. Failed
  saves retain the form values. Existing backend period/field errors remain visible
  through the request notice, and incomplete drafts remain supported.
- Detail retains authoritative live work facts, UTC/as-of explanations, narrative,
  workspace IDs and immutable review history. An optional authorized directory
  lookup supplies ownership names; unavailable names retain the existing ID fallback.
- Save, submit, review and JSON export use the same APIs. A synchronous in-flight
  guard prevents overlapping writes/downloads; busy action buttons remain focusable
  with `aria-disabled` and guarded handlers. Native submit is guarded too. Review
  notes and draft fields remain present during requests. Successful status changes
  focus the detail heading; cancelling a new draft returns focus to New report.
- Only an author can edit/submit their supported draft state, and only a permitted
  non-author can review a submitted report. Changes Requested must still be edited
  back to Draft before submission. Existing authorization remains authoritative.

Reminder scheduling remains **undelivered** under ADR 0003 NT-01/NT-02: lead times
and expected submitter populations are unresolved. This visual work promises no
automatic report reminder, email delivery or new scheduler.

## Verification

Verified on 2026-10-10:

- `pnpm --filter @event-platform/web test src/features/reports`: 29 tests across
  six files passed, also independently rerun by the reviewer. Coverage includes
  supported/denied actions, filter validation, facts, payloads, failure retention,
  period switching, pending focus and duplicate-review prevention.
- Scoped report ESLint, `pnpm --filter @event-platform/web typecheck`,
  `pnpm --filter @event-platform/e2e typecheck`, `pnpm format:check` and diff
  checks passed. Latest documentation/test formatting is checked separately.
- `pnpm --filter @event-platform/e2e e2e reports.spec.ts --project=chromium`:
  nine checks passed (five real-auth role setup checks plus four reporting cases)
  in run `run_1be3cd58a7eace5b`. The launcher provisioned and then dropped only
  its isolated PostgreSQL schema. Test-only rate limits matched existing harness
  defaults, without changing configuration or quality gates.
- Real employee UI creation/submission and management review passed for all three
  periods. Weekly Changes Requested, editing retained values, returning to Draft,
  resubmitting and reviewing passed. Keyboard Tab/Enter review activation, actual
  JSON download content, denied cross-author reads/exports, workspace selection,
  pagination and the existing warm API budget also passed.
- Axe WCAG 2.2 AA, reduced-motion, no horizontal overflow and employee/manager
  screenshots passed at 360x800, 768x1024, 1440x900 and narrowed 720x900 reflow.
  Screenshots are under the run's `test-results` reporting case directory:
  `reports-{employee,manager}-{360,768,1440,720}.png` and
  `reports-weekly-edit-360.png`. Desktop, tablet, mobile review and mobile draft
  captures were visually inspected. Full-page captures include fixed shell chrome.
- The harness production Webpack frontend build and TypeScript phase passed.
  `pnpm quality:budgets` passed: JavaScript 644.1 / 750 KiB, CSS 13.0 / 150 KiB,
  images 193.5 / 1500 KiB (gzipped code assets).
- Independent actual-diff review found no blocking defects and confirmed the
  persisted 9/9 browser result, screenshots and final verification documentation.

Manual assistive-technology and actual browser 200% zoom remain release checks.
An equivalent narrowed viewport verifies reflow, not a claim of manual zoom testing.
No API/schema changes require new migrations or generated contract updates. Docker
image builds and full unrelated backend suites are not part of the local UI check.
