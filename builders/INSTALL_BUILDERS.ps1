$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
try {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) { throw 'Install Python 3.10 or newer from python.org, enable Add Python to PATH, then run this installer again.' }
    & $python.Source -c 'import sys; assert sys.version_info >= (3,10), "Python 3.10 or newer is required"'
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.10 or newer is required.' }
    if (-not (Test-Path '.venv\Scripts\python.exe')) {
        & $python.Source -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the local Python environment.' }
    }
    & '.\.venv\Scripts\python.exe' -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check your internet connection and run this installer again.' }
    & '.\.venv\Scripts\python.exe' -m builders.verify
    if ($LASTEXITCODE -ne 0) { throw 'Some bundle files are missing or changed. Extract all matching asset packs into this folder.' }
    Write-Host 'Ready. Open START_BUILDERS.bat, START_AVATAR_CREATOR.bat, or START_WORLD_BUILDER.bat.' -ForegroundColor Green
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
