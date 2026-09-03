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

1. `global-setup.ts` creates `e2e_<timestamp>_<random>`, applies committed migrations to it with
   `prisma migrate deploy`, and runs `fixtures/seed.ts`.
2. The scoped `DATABASE_URL` is exported on `process.env`, so the API server Playwright starts uses
   the isolated schema.
3. `global-teardown.ts` drops the schema.

Runs therefore do not contaminate each other or the development database, and a failed run leaves no
residue beyond one droppable schema.

## Deterministic accounts

`fixtures/test-users.ts` is the single source of truth for end-to-end accounts. The platform has no
`User` model or authentication yet (IAM-01 / IAM-02), so `fixtures/seed.ts` does not insert them and
no journey signs in. When credential storage exists:

- seed `TEST_USERS` in `fixtures/seed.ts`, hashing each `password`;
- add an `auth.setup.ts` project that signs in as each user and saves `storageState` under
  `e2e/.auth/<key>.json`;
- add an `authenticated` project to `playwright.config.ts` with
  `dependencies: ["auth.setup"]` and `use: { storageState: "e2e/.auth/<key>.json" }`.

## Artifacts

Traces (`on-first-retry`), screenshots (`only-on-failure`), and video (`retain-on-failure`) are
written to `e2e/test-results/`. The HTML report is written to `e2e/playwright-report/`
(`pnpm --filter @event-platform/e2e report` to open it). CI uploads both directories.
