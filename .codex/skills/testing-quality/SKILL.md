---
name: testing-quality
description: Plan, implement, or review automated quality checks for this monorepo. Use for test strategy, Vitest, Testing Library, Supertest, Playwright, PostgreSQL integration tests, CI gates, or verification of a completed issue.
---

# Testing and Quality

Produce evidence that the selected scope works while keeping tests deterministic, maintainable,
and proportionate to risk.

Read `../../../docs/architecture/technical-architecture.md` when testing shared contracts,
database behavior, real-time delivery, or infrastructure boundaries.

## Choose the right boundary

- Use unit tests for pure policies, transformations, and isolated failure handling.
- Use Testing Library for user-observable component behavior rather than implementation details.
- Use Supertest for real NestJS routing, validation, guards, error contracts, and middleware.
- Use a real isolated PostgreSQL database for Prisma migrations, constraints, transactions, and
  repository integration. Test doubles are acceptable at unit boundaries but are not a substitute
  for database verification.
- Use Playwright for critical workflows that cross frontend, API, and persistence boundaries.
- Add Docker smoke checks when container definitions or service wiring change.

## Quality rules

- Derive tests from acceptance criteria, risks, permissions, state transitions, and regressions.
- Cover success and material loading, empty, validation, authorization, conflict, dependency,
  recovery, and error states.
- Keep fixtures minimal and explicit. Avoid shared mutable state, arbitrary sleeps, and assertions
  on incidental markup or logs.
- Verify accessibility and keyboard behavior for changed user-facing workflows.
- Never weaken a check merely to make a failure disappear; fix the product or explain the invalid
  expectation.
- Keep unrelated flaky tests and environment failures distinct from regressions caused by the
  selected issue.

Run the narrowest useful checks during iteration, then the affected package's lint, type-check,
tests, and build. Before completion, run repository-wide checks when shared contracts,
configuration, database, or infrastructure changed. Report commands, results, skipped checks, and
environment limitations precisely.
