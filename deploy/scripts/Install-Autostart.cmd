@echo off
setlocal
cd /d "%~dp0"

net session >nul 2>&1
if not %errorLevel%==0 (
  echo Requesting Administrator permission...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo.
echo === Apoyo autostart install ===
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-CloudflaredService.ps1"
if errorlevel 1 (
  echo.
  echo Cloudflared service install failed.
  pause
  exit /b 1
)

echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-StartupTask.ps1"
if errorlevel 1 (
  echo.
  echo Startup task install failed.
  pause
  exit /b 1
)

echo.
echo Done. Docker Desktop should also be set to start when you sign in.
echo Settings -^> General -^> Start Docker Desktop when you sign in.
echo.
pause
