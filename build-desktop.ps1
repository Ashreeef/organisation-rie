# build-desktop.ps1 — Build RIE Intelligence as a Windows desktop application
#
# Steps:
#   1. Build Next.js standalone (dashboard/.next/standalone/)
#   2. Build FastAPI via PyInstaller (dist/rie-api/)
#   3. Build Electron installer (electron/dist/)
#
# Usage:
#   .\build-desktop.ps1

param(
    [switch]$SkipNext,
    [switch]$SkipApi,
    [switch]$SkipElectron
)

# NOT "Stop": in PowerShell 5.1, $ErrorActionPreference='Stop' turns any line a
# native tool writes to stderr (npm notices, PyInstaller INFO logs) into a
# terminating error the moment 2>&1 merges it. Each build step below already
# gates on $LASTEXITCODE, so "Continue" keeps native output flowing while real
# failures are still caught.
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=== RIE Intelligence — Desktop Build ===" -ForegroundColor Green

# ── Step 1: Next.js standalone ──────────────────────────────────────────
if (-not $SkipNext) {
    Write-Host "[1/3] Building Next.js standalone..." -ForegroundColor Cyan
    Push-Location (Join-Path $Root "dashboard")
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "Next.js build failed" }
        Write-Host "     Next.js standalone built." -ForegroundColor Green
    } finally {
        Pop-Location
    }

    # Next.js standalone output does NOT include the static client assets
    # (.next/static = all compiled CSS/JS chunks) or the public/ folder.
    # Without them the pages render with zero styling. Copy them in now.
    $src = Join-Path $Root "dashboard"
    $dst = Join-Path $src ".next\standalone"
    if (Test-Path (Join-Path $src ".next\static")) {
        Copy-Item (Join-Path $src ".next\static") (Join-Path $dst ".next\static") -Recurse -Force
        Write-Host "     Copied .next/static into standalone." -ForegroundColor Green
    }
    if (Test-Path (Join-Path $src "public")) {
        Copy-Item (Join-Path $src "public") (Join-Path $dst "public") -Recurse -Force
        Write-Host "     Copied public/ into standalone." -ForegroundColor Green
    }
} else {
    Write-Host "[1/3] Skipping Next.js build." -ForegroundColor Yellow
}

# ── Step 2: PyInstaller (FastAPI bundle) ────────────────────────────────
if (-not $SkipApi) {
    Write-Host "[2/3] Building FastAPI bundle via PyInstaller..." -ForegroundColor Cyan

    # Ensure PyInstaller is installed in the .venv.
    $venvPyinstaller = Join-Path $Root ".venv\Scripts\pyinstaller.exe"
    if (-not (Test-Path $venvPyinstaller)) {
        Write-Host "     Installing PyInstaller into .venv..."
        & (Join-Path $Root ".venv\Scripts\pip.exe") install pyinstaller
    }

    Push-Location $Root
    try {
        # Clean previous build.
        $distDir = Join-Path $Root "dist"
        $buildDir = Join-Path $Root "build"
        if (Test-Path $distDir) { Remove-Item $distDir -Recurse -Force }
        if (Test-Path $buildDir) { Remove-Item $buildDir -Recurse -Force }

        & $venvPyinstaller rie-api.spec --noconfirm --clean
        if ($LASTEXITCODE -ne 0) { throw "PyInstaller build failed (exit $LASTEXITCODE)" }
        Write-Host "     FastAPI bundle built at dist/rie-api/" -ForegroundColor Green
    } finally {
        Pop-Location
    }
} else {
    Write-Host "[2/3] Skipping PyInstaller build." -ForegroundColor Yellow
}

# ── Step 3: Electron Builder ────────────────────────────────────────────
if (-not $SkipElectron) {
    Write-Host "[3/3] Building Electron installer..." -ForegroundColor Cyan

    # Ensure winCodeSign binaries are cached. app-builder extracts this archive
    # with 7-Zip, which fails on machines without admin rights because of two
    # macOS symlinks ("Cannot create symbolic link"). Pre-extracting it into the
    # expected cache folder lets app-builder skip the download entirely.
    $wcsDir = Join-Path $env:LOCALAPPDATA "electron-builder\Cache\winCodeSign"
    $wcsVersioned = Join-Path $wcsDir "winCodeSign-2.6.0"
    if (-not (Test-Path (Join-Path $wcsVersioned "rcedit-x64.exe"))) {
        Write-Host "     Pre-extracting winCodeSign to electron-builder cache..."
        New-Item -ItemType Directory -Path $wcsVersioned -Force | Out-Null
        $sevenZip = Join-Path $Root "electron\node_modules\7zip-bin\win\x64\7za.exe"
        $archives = Get-ChildItem $wcsDir -Filter "*.7z" -ErrorAction SilentlyContinue
        if ($archives) {
            # Reuse an already-downloaded archive if present.
            & $sevenZip x $archives[0].FullName ("-o" + $wcsVersioned) -y *> $null
        } else {
            # Otherwise download it ourselves (once), then extract.
            $url = "https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z"
            $tmp = Join-Path $env:TEMP "winCodeSign-2.6.0.7z"
            Start-BitsTransfer -Source $url -Destination $tmp
            & $sevenZip x $tmp ("-o" + $wcsVersioned) -y *> $null
            Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        }
        if (-not (Test-Path (Join-Path $wcsVersioned "rcedit-x64.exe"))) {
            throw "winCodeSign extraction failed - missing rcedit-x64.exe"
        }
    }

    Push-Location (Join-Path $Root "electron")
    try {
        # No code-signing certificate -> don't let electron-builder try to sign
        # (otherwise it blocks on signtool discovery).
        $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
        npm run dist
        if ($LASTEXITCODE -ne 0) { throw "Electron build failed" }
        Write-Host "     Installer built at electron/dist/" -ForegroundColor Green
    } finally {
        Remove-Item Env:\CSC_IDENTITY_AUTO_DISCOVERY -ErrorAction SilentlyContinue
        Pop-Location
    }
} else {
    Write-Host "[3/3] Skipping Electron build." -ForegroundColor Yellow
}

Write-Host "`n=== Build complete ===" -ForegroundColor Green
$setup = Get-ChildItem (Join-Path $Root "electron\dist") -Filter "*.exe" -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne "Uninstall*" } | Select-Object -First 1
if ($setup) {
    Write-Host "Installer: $($setup.FullName)" -ForegroundColor Cyan
}
