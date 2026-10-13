# Lela communication presentation - EVE-226

## Scope

The existing Discuss (direct messages and channels) and Notifications screens
reuse the shared Lela work header, toolbar/filter surfaces and branded dialog
presentation already shipped for other work areas. Conversation and channel
rows show a decorative initials/channel avatar beside the existing name, unread
indicator and timestamp; the selected row keeps a non-color inset indicator in
addition to its existing `aria-current`. Message rows add the same avatar next
to the author name, a readable card treatment that distinguishes the viewer's
own messages from others', and legible mention text. The notification feed and
the header bell panel mark unread items with a non-color inset indicator in
addition to their existing state; the bell panel's compact list also states
"Unread"/"Read" in text so the signal never depends on color or position alone.

The conversation list/detail split moves to a `md:` breakpoint (from `sm:`) so
narrow tablets keep the two-pane layout usable instead of cramming both panes
side by side. No API, permission, pagination, realtime event, read-cursor,
mention, pin, channel-membership or notification-preference behavior changed.
Existing reconnect feedback ("Reconnecting to live updates") is unchanged.
Message composer, message thread and conversation filters needed no
presentation changes: their existing `aria-label`/`aria-label`-scoped markup
already matches the shared CSS module's selectors. The shared shell, branding
and other work areas are unchanged.

## Verification

- Scoped discuss, notifications and shared `work` presentation unit tests: 178
  tests across 32 files passed (`vitest run src/features/discuss
src/features/notifications src/components/ui/work.test.tsx src/app`).
- Frontend type-check and lint passed with no errors. `pnpm format:check`
  passed. Production build (`pnpm build`) succeeded for both apps.
- `pnpm quality:budgets`: gzipped JavaScript is 546.1 KiB and CSS 16.3 KiB,
  within the 750/150 KiB limits. The image gate fails solely on the unrelated,
  untracked `apps/web/public/branding/login page.png` (1885.3 KiB versus 500
  KiB per image; 2078.8 KiB total versus 1500 KiB) - the same pre-existing
  file EVE-223/224/225 documented and left untouched. It is not part of this
  issue and is not included in this change.
- End-to-end: `pnpm --filter @event-platform/e2e e2e lela-communication.spec.ts
discuss.spec.ts notifications.spec.ts --project=chromium` against the
  harness's own isolated PostgreSQL schema (31 migrations applied, then torn
  down) and freshly built API/web servers on dynamic ports: 17 of 17 passed,
  including five role logins, both existing `discuss.spec.ts` administrator/
  denied/isolation/session-recovery journeys, both existing
  `notifications.spec.ts` journeys, both new cold-mobile baseline/constrained
  profiles (keyboard-only dialog open/close, LCP and sampled-interaction
  bounds), and both new DIRECT/CHANNEL two-account journeys (cross-user
  delivery, light/dark 360x800/768x1024/1440x900/720x450 responsive
  screenshots with reduced motion, axe WCAG 2.2 AA with no exclusions, offline
  notification reconnect and catch-up, and keyboard open/close of the list,
  create dialog and notification panel with focus return).
  - An initial run of the same command, before `API_RATE_LIMIT_MAX` and
    `AUTH_LOGIN_RATE_LIMIT_MAX` were set to `10000` in the invoking shell, hit
    8 failures (3 in `discuss.spec.ts`, 2 in `lela-communication.spec.ts`, 3 in
    `notifications.spec.ts`), all surfacing as "We could not check your
    permissions. Try again." This was the documented gotcha in
    `e2e/fixtures/environment.ts` (`serverEnv`'s comment on `API_RATE_LIMIT_MAX`):
    this repository's own `.env` sets `API_RATE_LIMIT_MAX=100` for local dev,
    and an ambient value always wins over the harness's intended 10000 ceiling,
    so the shared per-IP limiter tripped mid-suite under the combined request
    volume. Re-running with those two variables set in the shell (so they are
    already in `process.env` before the harness's own dotenv load, which does
    not overwrite an existing key) passed all 17; the three previously-failing
    `discuss.spec.ts` tests and all of `lela-communication.spec.ts` and
    `notifications.spec.ts` passed on that corrected run. No product code
    changed between the two runs - this is a pre-existing local-environment
    interaction, not a regression from this issue.
- Cross-cutting states already present and unchanged by this pass: checking-
  permissions/loading, ready, empty (no conversations/channels/notifications)
  and filtered-empty (search), mutation pending/success/error for send/edit/
  delete/pin/membership/preferences, denied/expired-session, realtime
  disconnected/reconnected, and dialog focus trap/Escape/restore. This issue
  did not change any of that logic; it only adds presentation on top of it.

Commands run: `pnpm --filter ./apps/web typecheck`, `pnpm --filter ./apps/web
lint`, `pnpm format:check`, `pnpm build`, `pnpm quality:budgets`, and the
`vitest run` invocation above. Manual screen-reader checks, actual browser
200% zoom and field INP remain release checks, consistent with the other Lela
restyle issues. Push, PR and Linear closure are separate authorized delivery
steps, not claimed here.
