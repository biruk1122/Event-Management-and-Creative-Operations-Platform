# OpenAPI contract generation

The NestJS controllers and their Swagger decorators are the source of truth for the public REST
contract. The repository commits both generated artifacts so contract changes are visible during
pull request review:

- `packages/api-client/openapi/openapi.json` contains the deterministic OpenAPI document.
- `packages/api-client/src/generated/schema.ts` contains the generated TypeScript paths,
  operations, and component schemas.

Never edit either generated file directly. Regenerate them from the repository root:

```text
pnpm openapi:generate
```

The generator compiles and initializes the Nest application without opening a network port. It
uses a placeholder PostgreSQL URL when local configuration is absent, but it does not connect to a
database. This makes generation available from a clean checkout after `pnpm install`.

CI runs `pnpm openapi:check`. The command regenerates both artifacts and fails when Git detects a
modified, deleted, or untracked generated file. Run it locally before committing an API contract
change.

## Compatibility review

Review the generated OpenAPI diff for every API change. In particular, verify:

- removed or renamed paths, methods, operation IDs, response statuses, and content types;
- newly required request fields or parameters and narrowed enum values;
- renamed, removed, or newly required response properties;
- authentication, cookie, and CSRF requirements; and
- changes that require a coordinated frontend migration.

The frontend imports API clients and contract types only from the public
`@event-platform/api-client` package entrypoint. It must not import backend DTOs, Prisma types,
generated-file internals, or application source paths. Backend OpenAPI decorators should be updated
first, followed by regeneration and any frontend changes needed to consume the new contract.
