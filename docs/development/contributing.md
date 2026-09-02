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

## Local Codex files

The `.codex` directory is workstation-local state and is intentionally ignored by Git. Before
checking out the first change that removes previously tracked Codex files, run this built-in
PowerShell backup from the existing branch:

```powershell
$repositoryRoot = (git rev-parse --show-toplevel).Trim()
$gitDirectory = (git rev-parse --absolute-git-dir).Trim()
$skillsDirectory = Join-Path $repositoryRoot ".codex"
$backupDirectory = Join-Path $gitDirectory "codex-backup"
if (Test-Path -LiteralPath $backupDirectory) { throw "Backup already exists: $backupDirectory" }
Copy-Item -LiteralPath $skillsDirectory -Destination $backupDirectory -Recurse
$sourceFiles = Get-ChildItem -LiteralPath $skillsDirectory -Recurse -File
$mismatches = foreach ($sourceFile in $sourceFiles) {
  $relativePath = $sourceFile.FullName.Substring($skillsDirectory.Length + 1)
  $backupFile = Join-Path $backupDirectory $relativePath
  if (
    -not (Test-Path -LiteralPath $backupFile) -or
    (Get-FileHash -LiteralPath $sourceFile.FullName).Hash -ne
      (Get-FileHash -LiteralPath $backupFile).Hash
  ) { $relativePath }
}
if (@($mismatches).Count -gt 0) { throw "Backup verification failed: $mismatches" }
git -C $repositoryRoot restore --source=HEAD --staged --worktree -- .codex
if ($LASTEXITCODE -ne 0) { throw "Unable to reset the backed-up tracked Codex files." }
```

The scoped restore command resets only the tracked `.codex` paths after their hashes are verified;
untracked local files are unaffected. The branch can then be updated without local tracked changes
blocking checkout. After updating the branch, restore the customized files with Windows
PowerShell:

```powershell
$repositoryRoot = (git rev-parse --show-toplevel).Trim()
$restoreScript = Join-Path $repositoryRoot "scripts/preserve-local-codex-skills.ps1"
powershell -ExecutionPolicy Bypass -File $restoreScript -Mode Restore
```

On Linux, macOS, or Windows with PowerShell 7, use:

```powershell
$repositoryRoot = (git rev-parse --show-toplevel).Trim()
$restoreScript = Join-Path $repositoryRoot "scripts/preserve-local-codex-skills.ps1"
pwsh -File $restoreScript -Mode Restore
```

The backup remains in the repository's private Git metadata until the developer removes it
manually. Restore copies only missing files and never overwrites existing local Codex state.

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
