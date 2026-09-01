# Docker development environment

The Compose stack provides three continuously running services and one explicit tool service:

- `web` runs the Next.js development server with source-mounted hot reload.
- `api` runs NestJS watch mode and regenerates the ignored Prisma client at startup.
- `db` runs PostgreSQL 18 and stores its data in the `postgres_data` named volume.
- `migrate` applies committed Prisma migrations as a one-shot command.

## First run

Copy the root `.env.example` to `.env`, replace the development password and reserved
authentication secrets, then run:

```sh
pnpm docker:up
pnpm docker:migrate
pnpm docker:ps
```

The frontend is available at `http://localhost:3000`, the API at
`http://localhost:4000`, and Swagger UI at `http://localhost:4000/api/docs`.
PostgreSQL is published on host port `5433` by default to avoid colliding with a
locally installed PostgreSQL server; containers communicate with it internally on port `5432`.
The named volume is mounted at `/var/lib/postgresql`, which is the PostgreSQL 18 image's
version-aware persistence root.

Migrations are intentionally not run by the API container. Keeping migration deployment in
a one-shot service prevents multiple API replicas from racing to change the schema.

## Daily workflow

```sh
pnpm docker:up
pnpm docker:logs
pnpm docker:down
```

Source files are mounted into the application containers. Dependency directories and the
generated Prisma client use Docker volumes so host and Linux package artifacts do not mix.
Rebuild the images after changing a package manifest or the lockfile.

`docker compose down` preserves PostgreSQL data. Removing the `postgres_data` volume is a
destructive reset and is deliberately not exposed as a package script.

## Production image targets

Both Dockerfiles contain a non-root `production` target:

```sh
docker build --file docker/api.Dockerfile --target production --tag event-platform-api .
docker build --file docker/web.Dockerfile --target production --tag event-platform-web .
```

The frontend public environment values are compiled into its production bundle. Supply
`API_INTERNAL_URL`, `NEXT_PUBLIC_API_URL`, and `NEXT_PUBLIC_WS_URL` as build arguments for
the deployment environment. Runtime secrets, including `DATABASE_URL`, must be injected by
the deployment platform and must never be baked into an image.
