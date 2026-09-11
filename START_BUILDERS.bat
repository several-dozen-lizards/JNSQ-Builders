@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
 echo Run INSTALL_BUILDERS.bat first.
 pause
 exit /b 1
)
".venv\Scripts\python.exe" -m builders.server --editor home
if errorlevel 1 pause
