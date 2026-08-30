# Install Cloudflare named tunnel `apoyo-dasma` as a Windows service.
# Origin ports stay 127.0.0.1:4173 / 4174 / 54321 (see %USERPROFILE%\.cloudflared\config.yml).
# Requires an elevated PowerShell window.

#Requires -RunAsAdministrator

. (Join-Path $PSScriptRoot "common.ps1")

Assert-Path $CloudflaredConfig "cloudflared config.yml"

$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflared) {
  $guess = @(
    "$env:ProgramFiles\cloudflared\cloudflared.exe",
    "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe",
    "$env:LOCALAPPDATA\cloudflared\cloudflared.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $guess) {
    throw "cloudflared.exe not found. Install it from Cloudflare, then re-run this script elevated."
  }
  $exe = $guess
} else {
  $exe = $cloudflared.Source
}

Write-Apoyo "Using $exe"

$existing = Get-Service -Name "cloudflared" -ErrorAction SilentlyContinue
if ($existing) {
  Write-Apoyo "cloudflared service already installed ($($existing.Status))."
  if ($existing.Status -ne "Running") {
    Start-Service cloudflared
  }
  Get-Service cloudflared | Format-List Name, Status, StartType
  exit 0
}

Write-Apoyo "Installing cloudflared Windows service from $CloudflaredConfig"
& $exe --config $CloudflaredConfig service install
if ($LASTEXITCODE -ne 0) {
  throw "cloudflared service install failed (exit $LASTEXITCODE)."
}

Start-Service cloudflared
Get-Service cloudflared | Format-List Name, Status, StartType
Write-Apoyo "Tunnel service installed and started. Do not also run a manual cloudflared tunnel process."
