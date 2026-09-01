# Environment configuration

The root `.env.example` is the canonical variable inventory for local and Docker development.
Copy it to `.env`, keep `.env` untracked, and replace placeholder credentials. Production values
must be injected by the deployment environment rather than committed or baked into images.

## Runtime and API

| Variable                | Used by      | Purpose                                                                          |
| ----------------------- | ------------ | -------------------------------------------------------------------------------- |
| `NODE_ENV`              | Web, API     | Runtime mode: `development`, `test`, or `production`.                            |
| `WEB_PORT`              | Compose      | Host port published for Next.js.                                                 |
| `API_HOST`              | API          | Network interface bound by NestJS.                                               |
| `API_PORT`              | API, Compose | NestJS port and host-published API port.                                         |
| `LOG_LEVEL`             | API          | Pino log threshold.                                                              |
| `CORS_ORIGINS`          | API          | Comma-separated, explicit browser origins allowed to send credentialed requests. |
| `API_RATE_LIMIT_TTL_MS` | API          | Rate-limit window in milliseconds.                                               |
| `API_RATE_LIMIT_MAX`    | API          | Maximum requests per client in a rate-limit window.                              |

## PostgreSQL

| Variable            | Used by     | Purpose                                                                              |
| ------------------- | ----------- | ------------------------------------------------------------------------------------ |
| `POSTGRES_DB`       | Compose     | Database created by the PostgreSQL container.                                        |
| `POSTGRES_PORT`     | Compose     | Host port mapped to container port `5432`; development defaults to `5433`.           |
| `POSTGRES_USER`     | Compose     | PostgreSQL application user.                                                         |
| `POSTGRES_PASSWORD` | Compose     | PostgreSQL application password; it must be replaced outside disposable development. |
| `DATABASE_URL`      | API, Prisma | PostgreSQL connection URL used by the application and migration tooling.             |

If a username or password contains reserved URL characters, percent-encode it in `DATABASE_URL`.
The Compose API and migration services construct an internal URL using service name `db`; local
host commands use the root `DATABASE_URL` unchanged.

## Frontend routing

| Variable              | Exposure        | Purpose                                                                                               |
| --------------------- | --------------- | ----------------------------------------------------------------------------------------------------- |
| `API_INTERNAL_URL`    | Server only     | NestJS `/api/v1` base URL used by Next.js server code. In Compose this uses `http://api:4000/api/v1`. |
| `NEXT_PUBLIC_API_URL` | Browser-visible | Public NestJS `/api/v1` base URL. Never place secrets in this value.                                  |
| `NEXT_PUBLIC_WS_URL`  | Browser-visible | Reserved public Socket.IO origin. Real-time features are not implemented yet.                         |

## Reserved authentication configuration

| Variable                    | Purpose                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `AUTH_ACCESS_TOKEN_SECRET`  | Future access-token signing secret; use at least 32 random characters.             |
| `AUTH_REFRESH_TOKEN_SECRET` | Future refresh-token signing secret; use at least 32 random characters.            |
| `AUTH_ACCESS_TOKEN_TTL`     | Future access-token lifetime, such as `15m`.                                       |
| `AUTH_REFRESH_TOKEN_TTL`    | Future refresh-session lifetime, such as `30d`.                                    |
| `AUTH_COOKIE_SECURE`        | Whether future authentication cookies require HTTPS. Must be `true` in production. |
| `AUTH_COOKIE_SAME_SITE`     | Future cookie SameSite policy: `lax`, `strict`, or `none`.                         |

These authentication variables reserve and validate the configuration contract only. They do not
implement authentication. Generate separate secrets for each environment and rotate them through
the deployment secret manager.
