$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$backupRoot = Join-Path $root "backups"
$backupDir = Join-Path $backupRoot "rie_backup_$timestamp"

if (-not (Test-Path $backupRoot)) {
    New-Item -ItemType Directory -Path $backupRoot | Out-Null
}

$itemsToBackup = @(
    (Join-Path $root "data"),
    (Join-Path $root "models"),
    (Join-Path $root ".env"),
    (Join-Path $root "scripts")
)

foreach ($item in $itemsToBackup) {
    if (Test-Path $item) {
        Copy-Item -Path $item -Destination $backupDir -Recurse -Force
    }
}

Write-Host "Backup created: $backupDir" -ForegroundColor Green
