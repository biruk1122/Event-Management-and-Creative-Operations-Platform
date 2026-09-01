# Development and pull request workflow

The `main` branch is the protected integration branch. Development happens on a short-lived
branch named `feature/<linear-issue>-<description>` after Phase 9 introduces Linear issue IDs.
Foundation-only maintenance before Phase 9 may use `feature/<description>`.

## Change flow

1. Confirm the selected Linear issue and its completed dependencies once issue-driven
   development begins.
2. Create a feature branch from the latest `main`.
3. Implement only the approved issue scope and add proportionate tests.
4. Run the repository quality commands and any database or Docker checks affected by the change.
5. Open a pull request using the repository template.
6. Have a Codex instance that did not implement the change review the diff and acceptance
   criteria. Record the result in the pull request.
7. Obtain the required GitHub approval and pass all required CI checks before merging.

GitHub approvals are tied to GitHub identities. If the implementing and reviewing Codex
instances use the same GitHub identity, GitHub cannot prove that they are different agents;
the recorded independent review provides process evidence while branch protection enforces an
approval from an eligible identity.

Direct pushes, force pushes, and deletion of `main` are prohibited. Resolve review conversations
before merging and dismiss approvals when new commits materially change the reviewed diff.

## Required local checks

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

For database changes, also run Prisma generation, migration deployment, and migration status
against a disposable PostgreSQL 18 database. For container changes, build both production image
targets and run the Compose smoke path documented in `docker.md`.
