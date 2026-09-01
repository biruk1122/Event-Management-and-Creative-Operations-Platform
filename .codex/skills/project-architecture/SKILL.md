---
name: project-architecture
description: Plan or review cross-cutting architecture changes in this repository. Use for module boundaries, shared packages, public contracts, infrastructure, or system-wide patterns; not for isolated work that already follows established boundaries.
---

# Project Architecture

Preserve a scalable modular monolith and the approved separation between frontend, backend,
database, shared contracts, and infrastructure.

## Start with evidence

1. Read `../../../docs/architecture/technical-architecture.md` completely.
2. Read the relevant SRS sections when the change affects product behavior or domain ownership.
3. Inspect the current repository and any applicable `AGENTS.md` files before proposing changes.
4. When a Linear issue is supplied, treat its scope, acceptance criteria, and completed
   dependencies as hard boundaries.

## Make architecture decisions

- Prefer the existing stack and module boundaries unless evidence requires a change.
- Keep `apps/web` and `apps/api` independently buildable and deployable.
- Keep Prisma ownership in `apps/api`; expose frontend contracts through OpenAPI generation.
- Put code in `packages/shared` only when it is framework-neutral and genuinely used by more than
  one application.
- Preserve controller/gateway to application to domain to infrastructure dependency direction.
- Avoid premature services, Redis, storage infrastructure, global state, or generic abstraction.
- Record a consequential, durable decision under `docs/decisions` when the task authorizes it.

## Verify

Check dependency direction, public contract compatibility, environment ownership, migration and
deployment effects, and whether the change expands product scope. Run checks proportionate to the
affected applications and report any unverified external dependency explicitly.
