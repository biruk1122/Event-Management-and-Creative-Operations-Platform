# Technical architecture

## Source of truth and scope

The versioned SRS at `docs/requirements/software-requirements-specification.pdf` defines
product requirements. This document defines the approved technical boundaries for implementing
those requirements. Resolve conflicts in favor of the SRS, and document consequential
architecture changes before implementation.

Foundation work must not introduce event, project, campaign, messaging, reporting, or other
business workflows before an approved development issue authorizes them.

## System shape

The platform begins as a modular monolith. Events, projects, productions, and campaigns will be
connected operational workspaces linked to people, teams, tasks, discussions, meetings,
calendars, files, notifications, and reports. NestJS modules preserve bounded-context seams so a
module can be extracted later only when operational evidence justifies it.

```text
Browser
  |-- Next.js App Router
  |-- REST /api/v1/*
  `-- Socket.IO /realtime (when implemented)
                  |
                  |-- NestJS application modules
                  |-- Prisma -> PostgreSQL
                  `-- Future S3-compatible object storage
```

## Technology baseline

- Node.js 24 LTS, ESM, and TypeScript 5.9 strict mode.
- pnpm 10 workspaces and Turborepo 2.
- Next.js 16 App Router, React 19, Tailwind CSS 4, shadcn/ui, TanStack Query,
  React Hook Form, and Zod.
- NestJS 12 with REST, OpenAPI, Socket.IO when authorized, structured Pino logging,
  validation, Helmet, and rate limiting.
- PostgreSQL 18 and Prisma ORM 7 with the PostgreSQL driver adapter.
- Vitest, Testing Library, Supertest, Playwright, and real PostgreSQL integration tests.

## Repository ownership

```text
apps/web                 Next.js UI and frontend feature composition
apps/api                 NestJS API, Prisma schema, and migrations
packages/api-client      Generated OpenAPI client and transport boundary
packages/shared          Framework-neutral primitives only
packages/typescript-config Shared strict TypeScript configuration
docker                   Container definitions
docs                     Requirements, architecture, decisions, and workflow guidance
```

Only `apps/api` may access Prisma or PostgreSQL. Backend DTOs and generated Prisma types must not
leak into the frontend. Cross-application request and response contracts are generated from
OpenAPI into `packages/api-client`; do not maintain parallel handwritten contract types.

## Backend boundaries

NestJS feature modules follow this dependency direction:

```text
controller/gateway -> application service/use case -> domain policy -> repository/infrastructure
```

Modules communicate through exported application interfaces and domain events. They must not
reach into another module's tables, repositories, or internal services. Authentication and
authorization are enforced at transport and application-service boundaries.

Public REST routes use `/api/v1`. Health routes remain `/health/live` and `/health/ready`.
Errors use Problem Details with stable codes and request IDs. Socket events use authenticated,
versioned envelopes with acknowledgements; PostgreSQL remains the durable source of truth.

## Frontend boundaries

Server Components are the default. Client Components are reserved for forms, boards, calendars,
real-time surfaces, and other genuine browser interactions. Organize business work by feature;
keep reusable primitives under `src/components/ui` and infrastructure under `src/lib`.

TanStack Query manages browser-side server state. Prefer URL state and local component state over
a global store. Server-only and public environment variables remain separately validated.

## Data rules

- Commit explicit migrations; never use `prisma db push` for shared or production databases.
- Use UUID identifiers, UTC `timestamptz`, explicit foreign keys, constraints, and indexes.
- Store money as `numeric` with an explicit currency code.
- Use explicit join entities for memberships and participants.
- Do not use unchecked `entityType/entityId` polymorphic references for connected workspaces.
- Add soft deletion only when recovery or audit requirements justify it.

## Operations

The development stack consists of web, API, PostgreSQL, and an explicit one-shot migration
service. PostgreSQL uses a persistent volume. Production images run as non-root users and receive
secrets from the deployment environment. Redis, MinIO, external monitoring, and a reverse proxy
remain extension points until approved.

## Delivery boundary

When development is driven by a Linear issue, its scope, acceptance criteria, and completed
dependencies are hard boundaries. Implement one selected issue, verify it, submit it for
independent review, and stop after updating that issue. Do not begin another issue automatically.
