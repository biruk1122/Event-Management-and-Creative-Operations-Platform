---
name: frontend-development
description: Implement or review Next.js frontend work in this repository, including routes, feature UI, forms, server state, and API integration. Use for apps/web changes, not backend-only or database-only tasks.
---

# Frontend Development

Build maintainable Next.js interfaces within the existing feature-based architecture.

## Before editing

- Read `../../../apps/web/AGENTS.md` and the relevant frontend files.
- Read `../../../docs/architecture/technical-architecture.md` when work changes a boundary or
  public contract.
- If a Linear issue is supplied, implement only its approved scope after checking dependencies.

## Implementation boundaries

- Use Server Components by default. Add `"use client"` only for browser APIs, interaction,
  client-side forms, or live state.
- Place feature composition under `src/features/<feature>` and reusable shadcn/ui primitives under
  `src/components/ui`.
- Keep transport code under `src/lib/api`. Use `packages/api-client` contracts rather than
  duplicating backend DTOs or importing Prisma types.
- Use TanStack Query for client-side server state, React Hook Form plus Zod for forms, and URL or
  local state before considering a global store.
- Keep server-only configuration out of client bundles and validate every public environment
  variable.
- Preserve loading, empty, error, disabled, and success behavior for every asynchronous surface.
- Do not add business behavior beyond the selected issue.

## Verification

Run the web lint, type-check, relevant Vitest/Testing Library tests, and production build. For user
flows, verify responsive behavior, keyboard operation, and API failure handling; add Playwright
coverage when the flow crosses meaningful application boundaries.
