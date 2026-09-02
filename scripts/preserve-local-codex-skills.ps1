[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Backup", "Restore")]
  [string]$Mode
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$skillsDirectory = Join-Path $repositoryRoot ".codex"
$gitDirectory = (& git -C $repositoryRoot rev-parse --absolute-git-dir).Trim()

if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($gitDirectory)) {
  throw "Unable to resolve the repository Git directory."
}

$backupDirectory = Join-Path $gitDirectory "codex-backup"

if ($Mode -eq "Backup") {
  if (-not (Test-Path -LiteralPath $skillsDirectory -PathType Container)) {
    throw "No local .codex directory exists at $skillsDirectory."
  }

  if (Test-Path -LiteralPath $backupDirectory) {
    throw "A backup already exists at $backupDirectory. Restore or relocate it before creating another backup."
  }

  Copy-Item -LiteralPath $skillsDirectory -Destination $backupDirectory -Recurse
  Write-Output "Backed up local Codex files to $backupDirectory."
  exit 0
}

if (-not (Test-Path -LiteralPath $backupDirectory -PathType Container)) {
  throw "No local Codex backup exists at $backupDirectory."
}

New-Item -ItemType Directory -Path $skillsDirectory -Force | Out-Null
$backupPrefix = $backupDirectory.TrimEnd("\", "/") + [IO.Path]::DirectorySeparatorChar
$restoredCount = 0
$preservedCount = 0

foreach ($backupFile in Get-ChildItem -LiteralPath $backupDirectory -Recurse -Force -File) {
  $relativePath = $backupFile.FullName.Substring($backupPrefix.Length)
  $destinationFile = Join-Path $skillsDirectory $relativePath

  if (Test-Path -LiteralPath $destinationFile) {
    $preservedCount += 1
    continue
  }

  $destinationDirectory = Split-Path -Parent $destinationFile
  New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
  Copy-Item -LiteralPath $backupFile.FullName -Destination $destinationFile
  $restoredCount += 1
}

Write-Output "Restored $restoredCount missing local Codex files to $skillsDirectory; preserved $preservedCount existing files. The backup was retained."
