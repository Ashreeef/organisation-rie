<#
.SYNOPSIS
    Planifie la génération quotidienne des features live sur Windows
    (Planificateur de tâches).

.DESCRIPTION
    Enregistre une tâche quotidienne qui exécute
    scripts\run_daily_features.py (logging + journal JSON). La tâche est
    *relancée si le PC était éteint* (StartWhenAvailable) et redémarrée 3 fois
    en cas d'échec.

.PARAMETER At
    Heure d'exécution (HH:MM), défaut 06:00.

.PARAMETER Days
    Horizon en jours calendaires, défaut 14.

.PARAMETER PythonPath
    Chemin absolu du python à utiliser (défaut : celui de Get-Command python).

.PARAMETER TaskName
    Nom de la tâche, défaut "RIE_df_daily_features".

.EXAMPLE
    .\scripts\install_daily_task.ps1                      # installe à 06:00
    .\scripts\install_daily_task.ps1 -At 06:30 -Days 14
    .\scripts\install_daily_task.ps1 -Uninstall           # supprime la tâche
    .\scripts\install_daily_task.ps1 -RunNow              # exécution de test immédiate

.NOTES
    Enregistre pour l'utilisateur courant (aucun mot de passe requis) ; la
    tâche s'exécute uniquement lorsque l'utilisateur est connecté.
#>
[CmdletBinding()]
param(
    [string]$At = "06:00",
    [int]$Days = 14,
    [string]$PythonPath = "",
    [string]$TaskName = "RIE_df_daily_features",
    [switch]$Uninstall,
    [switch]$RunNow
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if (-not $PythonPath) {
    $cmd = Get-Command python -ErrorAction Stop
    $PythonPath = $cmd.Source
}
if (-not (Test-Path -LiteralPath $PythonPath)) {
    throw "Python introuvable: $PythonPath"
}

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Tâche '$TaskName' supprimée (si elle existait)."
    exit 0
}

$argLine = "`"$repo\scripts\run_daily_features.py`" --days $Days --out `"$repo\data\processed\features_live.csv`" --log `"$repo\data\logs\daily_features.log`""

if ($RunNow) {
    $psArgs = @(
        (Join-Path $repo "scripts\run_daily_features.py"),
        "--days",  [string]$Days,
        "--out",   (Join-Path $repo "data\processed\features_live.csv"),
        "--log",   (Join-Path $repo "data\logs\daily_features.log")
    )
    Write-Host "Exécution de test :"
    Write-Host "  $PythonPath $($psArgs -join ' ')"
    Write-Host "  (workdir: $repo)"
    & $PythonPath @psArgs
    Write-Host "Exit code: $LASTEXITCODE"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    exit 0
}

$action = New-ScheduledTaskAction -Execute $PythonPath -Argument $argLine -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 5) `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "RIE - génération quotidienne features_live.csv (python $PythonPath)" | Out-Null

Write-Host "Tâche '$TaskName' planifiée tous les jours à $At."
Write-Host "  commande : $PythonPath $argLine"
Write-Host "  test     : .\scripts\install_daily_task.ps1 -RunNow"
Write-Host "  retrait  : .\scripts\install_daily_task.ps1 -Uninstall"