---
name: backend-development
description: Implement or review NestJS backend work in this repository, including REST endpoints, application services, authorization, validation, logging, and OpenAPI contracts. Use for apps/api behavior, not frontend-only or schema-only work.
---

# Backend Development

Implement secure, observable NestJS modules without weakening bounded-context ownership.

## Before editing

- Read the selected issue or request, relevant API code, and
  `../../../docs/architecture/technical-architecture.md` when boundaries are involved.
- Confirm dependent migrations and contracts exist before adding API behavior.
- Keep the change inside one bounded context unless an approved contract explicitly crosses it.

## Implementation boundaries

- Follow controller or gateway to application service/use case to domain policy to
  repository/infrastructure dependency direction.
- Keep controllers thin. Do not access Prisma from controllers or expose generated Prisma types.
- Validate input with DTOs and the configured global validation boundary.
- Return versioned REST contracts under `/api/v1` and document them through OpenAPI.
- Use stable Problem Details codes; never expose stack traces, credentials, or internal database
  errors.
- Preserve correlation IDs and structured logging. Do not log tokens, cookies, or sensitive
  payloads.
- Enforce permissions in transport guards and application services. Do not rely on UI visibility
  or hard-coded role names as authorization.
- Use transactions for multi-write invariants and avoid direct access to another module's tables.
- Do not implement unrelated business endpoints or speculative integrations.

## Verification

Run API lint, strict type-checking, relevant Vitest/Supertest tests, and the production build.
Exercise validation, authorization, success, not-found, conflict, and dependency-failure paths
that are material to the change. Regenerate and review OpenAPI-derived contracts when public
interfaces change.
