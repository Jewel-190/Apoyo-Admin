# Start the named tunnel in the current session (no admin).
# Prefer Install-CloudflaredService.ps1 so it survives reboot.

. (Join-Path $PSScriptRoot "common.ps1")

Assert-Path $CloudflaredConfig "cloudflared config.yml"

$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if ($cloudflared) {
  $exe = $cloudflared.Source
} else {
  $exe = @(
    "$env:ProgramFiles\cloudflared\cloudflared.exe",
    "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe",
    "$env:LOCALAPPDATA\cloudflared\cloudflared.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}

if (-not $exe) {
  throw "cloudflared.exe not found."
}

$svc = Get-Service -Name "cloudflared" -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq "Running") {
  Write-Apoyo "cloudflared Windows service is already running. Not starting a second tunnel."
  exit 0
}

$existing = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue
if ($existing) {
  Write-Apoyo "cloudflared already running (pid $($existing.Id -join ', '))."
  exit 0
}

Write-Apoyo "Starting named tunnel apoyo-dasma (foreground-friendly background process)..."
$logDir = Join-Path $AdminRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Process -FilePath $exe `
  -ArgumentList @("--config", $CloudflaredConfig, "tunnel", "run", "apoyo-dasma") `
  -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $logDir "cloudflared.out.log") `
  -RedirectStandardError (Join-Path $logDir "cloudflared.err.log")

Start-Sleep -Seconds 3
$proc = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue
if (-not $proc) {
  throw "cloudflared did not stay running. See logs\cloudflared.err.log"
}
Write-Apoyo "cloudflared running (pid $($proc.Id -join ', ')). Install the Windows service for reboot survival."
