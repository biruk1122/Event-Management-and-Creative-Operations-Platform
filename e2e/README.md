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

- A reachable PostgreSQL instance and a `DATABASE_URL` (from the repository `.env`, or the
  environment). `pnpm docker:up` provides one during development.
- Nothing else running on the API or web port; in local runs Playwright reuses an already-running
  server if one is present (`reuseExistingServer`).

## Isolation

Each run is confined to its own PostgreSQL **schema**:

1. `scripts/provision.mjs` creates `e2e_<timestamp>_<random>`, applies committed migrations to it
   with `prisma migrate deploy`, and seeds the canonical accounts.
2. It writes the scoped connection string to `.e2e-datasource.json` (gitignored, and deliberately
   outside `test-results/`, which Playwright empties at startup). `playwright.config.ts` reads
   that file to put `DATABASE_URL` in the servers' own environment, and `global-setup.ts` reads it
   again to republish the value onto the test runner's `process.env`, for test files and
   `global-teardown.ts`.
3. `global-teardown.ts` drops the schema.

Runs therefore do not contaminate each other or the development database, and a failed run leaves no
residue beyond one droppable schema.

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
password with `@node-rs/argon2` (its defaults match the API's `PasswordHasher`); its email and
password literals are mirrored from `test-users.ts` (see that file's header comment - it cannot be
imported from provisioning, so keep them in sync by hand).

- `tests/auth.setup.ts` is the `setup` project: it signs in as each account through the real
  `/login` UI and saves the resulting `storageState` to `e2e/.auth/<key>.json` (gitignored). The
  `chromium` project depends on it.
- An authenticated suite reuses that state per file with
  `test.use({ storageState: authStatePath("<key>") })` (see `tests/auth-session.spec.ts`).

## Artifacts

Traces (`on-first-retry`), screenshots (`only-on-failure`), and video (`retain-on-failure`) are
written to `e2e/test-results/`. The HTML report is written to `e2e/playwright-report/`
(`pnpm --filter @event-platform/e2e report` to open it). CI uploads both directories.
