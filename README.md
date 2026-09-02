# Event Management and Creative Operations Platform

Professional monorepo foundation for the Event Management and Creative Operations Platform.

The repository is currently in its foundation phase. Business modules are intentionally not implemented yet.

## Workspace

- `apps/web` - Next.js frontend
- `apps/api` - NestJS backend
- `packages/api-client` - framework-neutral API transport and generated contracts
- `packages/shared` - shared constants and framework-neutral types
- `packages/typescript-config` - shared strict TypeScript configuration
- `docs` - requirements, architecture decisions, and development documentation

## Frontend development

1. Copy `.env.example` to `.env` at the repository root.
2. Run `pnpm install`.
3. Run `pnpm dev:web`.

The frontend is available at `http://localhost:3000`. Root-level environment variables are loaded and validated by the Next.js configuration.
The foundation health bridge is available at `http://localhost:3000/api/health/backend`; it makes
a real server-side request to the NestJS liveness endpoint.

## Backend development

1. Copy `.env.example` to `.env` at the repository root.
2. Run `pnpm install`.
3. Run `pnpm dev:api`.

The API is available at `http://localhost:4000`, with liveness at `/health/live`,
database-backed readiness at `/health/ready`, OpenAPI documentation at `/api/docs`,
and its JSON document at `/api/docs-json`.

## Database development

PostgreSQL is the authoritative data store and Prisma migrations are committed to Git.
After configuring `DATABASE_URL` in the root `.env` file, use:

- `pnpm db:generate` to generate the typed Prisma client.
- `pnpm db:migrate:create -- --name <migration-name>` to create a migration without applying it.
- `pnpm db:migrate -- --name <migration-name>` for local development migrations.
- `pnpm db:migrate:deploy` to apply committed migrations in shared and production environments.
- `pnpm db:migrate:status` to inspect migration state.
- `pnpm db:studio` to open Prisma Studio for local development.

Do not use `prisma db push` in shared or production environments.

## Docker development

1. Copy `.env.example` to `.env` and replace the development passwords and reserved secrets.
2. Run `pnpm docker:up` to build and start PostgreSQL, the API, and the frontend.
3. Run `pnpm docker:migrate` to apply committed migrations.
4. Open the frontend at `http://localhost:3000` and API documentation at
   `http://localhost:4000/api/docs`.

Useful commands include `pnpm docker:ps`, `pnpm docker:logs`, and `pnpm docker:down`.
PostgreSQL data is retained in a named volume when the stack is stopped. See
`docs/development/docker.md` for development and production-target details.

The complete variable inventory is documented in `docs/development/environment.md`. The feature
branch and protected pull request workflow is documented in `docs/development/contributing.md`.

## Quality commands

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm format:check`
