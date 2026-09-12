# End-to-end test harness

`@event-platform/e2e` runs Playwright journeys against the real web application, the real NestJS
API, and a real PostgreSQL database. No production code path is mocked.

## Running

```sh
pnpm e2e
```

From the repository root this builds `@event-platform/api` and `@event-platform/web`, then runs
Playwright. The first run also needs the browser binary:

```sh
pnpm --filter @event-platform/e2e exec playwright install chromium
```

Requirements:

- Reachable PostgreSQL and MinIO services, plus `DATABASE_URL` and the `FILE_STORAGE_*` values
  from the repository `.env` (or environment). `pnpm docker:up` provides both during development.
- Nothing else running on the API or web port; in local runs Playwright reuses an already-running
  server if one is present (`reuseExistingServer`).

## Isolation

Each invocation is confined to its own PostgreSQL **schema**, ports, and
artifact directory. `scripts/run.mjs` creates a random run ID, selects unused
local API and web ports, and passes all three values to provisioning and
Playwright. This means two `pnpm e2e` commands can run at once without sharing
servers, database state, auth files, or artifacts.

Each run then follows this lifecycle:

1. `scripts/provision.mjs` creates `e2e_<timestamp>_<random>`, applies committed migrations to it
   with `prisma migrate deploy`, seeds the RBAC catalog (permissions, the five SRS roles and their
   grants, baseline grants) with `pnpm --filter @event-platform/api db:seed`, and seeds the
   canonical accounts - each assigned its catalog role via `user_role_assignments`.
2. It writes the scoped connection string to
   `.runs/<run-id>/datasource.json` (gitignored, and deliberately outside the
   run's `test-results/`, which Playwright empties at startup). `playwright.config.ts` reads
   that file to put `DATABASE_URL` in the servers' own environment, and `global-setup.ts` reads it
   again to republish the value onto the test runner's `process.env`, for test files and
   `global-teardown.ts`.
3. `global-teardown.ts` drops the schema and removes the datasource marker.

Runs therefore do not contaminate each other or the development database. A
failed run leaves only its named artifact directory and one droppable schema.

Provisioning runs as a **plain Node script before `playwright test` starts** (see the `"e2e"`
script in `package.json`), not as Playwright's `globalSetup` hook. Playwright starts `webServer`
processes _before_ running `globalSetup` - too late to hand a freshly created, seeded
`DATABASE_URL` to servers that have already booted with the wrong one. `scripts/provision.mjs` is
JavaScript rather than TypeScript because it runs outside Playwright's own loader, which is what
resolves this package's `./foo.js` specifiers to their `./foo.ts` sources; a plain `node` process
can't.

## Deterministic accounts

`fixtures/test-users.ts` is the source of truth for the end-to-end accounts' shape and role
assignment. `scripts/provision.mjs` seeds them into `users` / `user_credentials`, hashing the
password with `@node-rs/argon2` (its defaults match the API's `PasswordHasher`), and assigns each
to its catalog role in `user_role_assignments` so permission-aware journeys resolve real grants
(Super Admin gets full `role.*` access; Team Member gets none, which the denied journey relies on).
The email, password, and role-name literals are mirrored from `test-users.ts` (see that file's
header comment - it cannot be imported from provisioning, so keep them in sync by hand).

- `tests/auth.setup.ts` is the `setup` project: it signs in as each account through the real
  `/login` UI and saves the resulting `storageState` to
  `e2e/.runs/<run-id>/auth/<key>.json` (gitignored). The
  `chromium` project depends on it.
- An authenticated suite reuses that state per file with
  `test.use({ storageState: authStatePath("<key>") })` (see `tests/auth-session.spec.ts`).

## Artifacts

Traces (`on-first-retry`), screenshots (`only-on-failure`), and video
(`retain-on-failure`) are written to `e2e/.runs/<run-id>/test-results/`. The
HTML report is written to `e2e/.runs/<run-id>/playwright-report/`; the launcher
prints `<run-id>`. Set `E2E_RUN_ID` to that value before running
`pnpm --filter @event-platform/e2e report`. CI uploads the run-scoped report
and artifacts.
