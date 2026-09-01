---
name: database-development
description: Design, migrate, query, or review PostgreSQL and Prisma data structures for this repository. Use for schema, migration, indexing, integrity, transaction, or database-readiness work; not for persistence-free application changes.
---

# Database Development

Keep PostgreSQL authoritative and make every schema change explicit, reviewable, and safe to
deploy.

## Before editing

- Read the issue's data requirements and `../../../docs/architecture/technical-architecture.md`.
- Inspect existing Prisma models, migrations, queries, and access patterns before designing.
- Confirm database work precedes dependent backend and frontend tasks.

## Data design

- Keep Prisma schema and migrations inside `apps/api`; no other package accesses the database.
- Use UUID identifiers, UTC timestamps, explicit foreign keys, uniqueness, checks, and indexes.
- Model memberships, assignees, talents, and participants with explicit join entities.
- Avoid unchecked polymorphic foreign keys. Attach shared capabilities through enforceable
  workspace relations.
- Store money as `numeric` plus a currency code; define rounding and precision deliberately.
- Add soft deletion only for an explicit recovery or audit requirement.
- Base compound indexes on demonstrated query filters and ordering, especially for high-volume
  messages, notifications, and audit records.

## Migration safety

- Create and commit Prisma migrations. Never use `prisma db push` for shared or production data.
- Review generated SQL. Name constraints and indexes when doing so improves operations.
- Use expand-and-contract changes when a single destructive migration could break running code.
- Do not rewrite an applied migration; add a corrective migration.
- Require explicit authorization before destructive production data operations.

Use the root `db:generate`, `db:migrate:create`, `db:migrate`, `db:migrate:deploy`, and
`db:migrate:status` commands. Verify migrations against a clean real PostgreSQL database and test
the affected repository behavior, constraints, rollback or recovery plan, and readiness checks.
