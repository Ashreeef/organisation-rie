# start-dev.ps1 — Demarrage en mode developpement (RIE Intelligence)
# Lance FastAPI + Next.js (dev) puis l'application Electron.
# A la sortie de l'application Electron, les processus demarres par ce
# script (FastAPI / Next.js) sont arretees (aucun processus orphelin).
#
# Usage:
#   .\start-dev.ps1

param(
    [string]$PortFastAPI = "8000",
    [string]$PortNext = "3000"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Dashboard = Join-Path $Root "dashboard"
$Electron = Join-Path $Root "electron"

$startedApi = $null
$startedNext = $null

function Test-Port($port) {
    try {
        $conn = New-Object System.Net.Sockets.TcpClient
        $conn.Connect("127.0.0.1", $port)
        $conn.Close()
        return $true
    } catch {
        return $false
    }
}

# Se lance via cmd.exe /c quand la commande est un script .cmd/.bat
# (Process.Start ne peut pas executer un .cmd/.bat directement avec
# UseShellExecute=$false). Les scripts .ps1 sont remplaces par leur
# equivalent .cmd (ex. npm -> npm.cmd) car cmd.exe ne peut pas lancer un .ps1.
function Start-Hidden($command, $argumentList, $workdir) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $resolved = $null
    try { $resolved = (Get-Command $command -ErrorAction Stop).Source } catch { $resolved = $command }
    $ext = [System.IO.Path]::GetExtension($resolved)
    if ($ext -eq ".ps1") {
        $resolved = [System.IO.Path]::ChangeExtension($resolved, ".cmd")
        $ext = ".cmd"
    }
    if ($ext -in @(".cmd", ".bat")) {
        $psi.FileName = "cmd.exe"
        $psi.Arguments = "/c `"$resolved`" $argumentList"
    } else {
        $psi.FileName = $resolved
        $psi.Arguments = $argumentList
    }
    $psi.WorkingDirectory = $workdir
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    return [System.Diagnostics.Process]::Start($psi)
}

function Kill-Tree($proc) {
    if ($null -eq $proc) { return }
    try {
        & taskkill /pid $proc.Id /T /F 2>$null | Out-Null
    } catch {
        try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch { }
    }
}

function Get-ListenerPid($port) {
    try {
        $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($conn) { return $conn.OwningProcess }
    } catch { }
    return $null
}

$hadStale = $false
foreach ($port in @($PortFastAPI, $PortNext)) {
    $pidOnPort = Get-ListenerPid $port
    if ($null -ne $pidOnPort) {
        $name = (Get-Process -Id $pidOnPort -ErrorAction SilentlyContinue).ProcessName
        Write-Host "[pre-flight] Port $port occupe par $name (PID $pidOnPort) - arret de l'ancien process" -ForegroundColor Yellow
        & taskkill /pid $pidOnPort /T /F 2>$null | Out-Null
        $hadStale = $true
    }
}
if ($hadStale) { Start-Sleep -Seconds 2 }

Write-Host "=== RIE Intelligence - mode developpement ===" -ForegroundColor Green

# 1. FastAPI
if (Test-Port $PortFastAPI) {
    Write-Host "[1/3] FastAPI deja actif sur :$PortFastAPI (conserve)" -ForegroundColor Yellow
} else {
    Write-Host "[1/3] Demarrage de FastAPI sur :$PortFastAPI (cache)..."
    $venvUvicorn = Join-Path $Root ".venv\Scripts\uvicorn.exe"
    $altVenvUvicorn = Join-Path $Root "venv\Scripts\uvicorn.exe"
    if (Test-Path $venvUvicorn) {
        $startedApi = Start-Hidden $venvUvicorn "api.main:app --port $PortFastAPI --no-access-log" $Root
        Write-Host "     PID: $($startedApi.Id) (.venv uvicorn)"
    } elseif (Test-Path $altVenvUvicorn) {
        $startedApi = Start-Hidden $altVenvUvicorn "api.main:app --port $PortFastAPI --no-access-log" $Root
        Write-Host "     PID: $($startedApi.Id) (venv uvicorn)"
    } else {
        $startedApi = Start-Hidden "uvicorn" "api.main:app --port $PortFastAPI --no-access-log" $Root
        Write-Host "     PID: $($startedApi.Id) (system uvicorn)"
    }
}

# 2. Next.js (dev)
if (Test-Port $PortNext) {
    Write-Host "[2/3] Next.js deja actif sur :$PortNext (conserve)" -ForegroundColor Yellow
} else {
    Write-Host "[2/3] Demarrage de Next.js (npm run dev) sur :$PortNext (cache)..."
    $startedNext = Start-Hidden "npm" "run dev" $Dashboard
    Write-Host "     PID: $($startedNext.Id) (npm run dev)"
}

# 3. Electron (dev mode)
Write-Host "[3/3] Lancement de l'application Electron (dev)..."
Push-Location $Electron
try {
    if (-not (Test-Path (Join-Path $Electron "node_modules"))) {
        Write-Host "     Installation des dependances Electron (npm install)..."
        npm install
    }
    npm start
} finally {
    Pop-Location
}

# Nettoyage : arreter uniquement les processus demarres par ce script.
Write-Host "=== Nettoyage des processus demarres ===" -ForegroundColor Green
if ($startedApi) { Kill-Tree $startedApi; Write-Host "  FastAPI arrete (PID $($startedApi.Id))" }
if ($startedNext) { Kill-Tree $startedNext; Write-Host "  Next.js arrete (PID $($startedNext.Id))" }
Write-Host "=== Application fermee. Fin du mode developpement. ===" -ForegroundColor Green