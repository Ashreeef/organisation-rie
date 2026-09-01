$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $root "api"
$dashboardPath = Join-Path $root "dashboard"
$venvPath = Join-Path $root ".venv"

if (-not (Test-Path $venvPath)) {
    Write-Host "Environment Python .venv not found. Please create it first." -ForegroundColor Red
    Write-Host "Command: py -3.12 -m venv .venv" -ForegroundColor Yellow
    exit 1
}

Write-Host "Starting RIE backend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; .\.$((Split-Path -Leaf $venvPath))\Scripts\Activate.ps1; uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload"

Write-Host "Starting RIE frontend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$dashboardPath'; npm run dev -- --hostname 0.0.0.0 --port 3000"

Write-Host "`nRIE started locally." -ForegroundColor Green
Write-Host "Backend: http://localhost:8000/api/health" -ForegroundColor Yellow
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Yellow
Write-Host "LAN access: http://<PC_IP>:3000" -ForegroundColor Yellow
