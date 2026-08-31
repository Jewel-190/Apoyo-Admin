# Install / repair Cloudflare named tunnel `apoyo-dasma` as a Windows service.
# The service runs as LocalSystem, so config must live under
# C:\Windows\System32\config\systemprofile\.cloudflared\
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

$userCf = Join-Path $env:USERPROFILE ".cloudflared"
$systemCf = "C:\Windows\System32\config\systemprofile\.cloudflared"
New-Item -ItemType Directory -Force -Path $systemCf | Out-Null

Get-ChildItem -LiteralPath $userCf -File | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $systemCf $_.Name) -Force
}

$tunnelId = "ce66d181-aeda-4e87-b18c-db817ed4a826"
$credName = "$tunnelId.json"
if (-not (Test-Path (Join-Path $systemCf $credName))) {
  throw "Missing tunnel credentials JSON in $systemCf"
}

$systemConfig = Join-Path $systemCf "config.yml"
@(
  "tunnel: $tunnelId"
  "credentials-file: $systemCf\$credName"
  ""
  "ingress:"
  "  - hostname: api.apoyo-dasma.online"
  "    service: http://127.0.0.1:54321"
  "  - hostname: admin.apoyo-dasma.online"
  "    service: http://127.0.0.1:4174"
  "  - hostname: www.apoyo-dasma.online"
  "    service: http://127.0.0.1:4173"
  "  - hostname: apoyo-dasma.online"
  "    service: http://127.0.0.1:4173"
  "  - service: http_status:404"
) | Set-Content -LiteralPath $systemConfig -Encoding ascii

Write-Apoyo "Wrote LocalSystem tunnel config at $systemConfig"

Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

$svc = Get-Service -Name "cloudflared" -ErrorAction SilentlyContinue
if (-not $svc) {
  Write-Apoyo "Installing cloudflared Windows service..."
  & $exe --config $systemConfig service install
  if ($LASTEXITCODE -ne 0) {
    throw "cloudflared service install failed (exit $LASTEXITCODE)."
  }
}

$imagePath = "`"$exe`" --config `"$systemConfig`" tunnel run"
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\cloudflared" -Name ImagePath -Value $imagePath
Write-Apoyo "Service ImagePath set to use the system profile config."

Restart-Service cloudflared -Force
Start-Sleep -Seconds 3
Get-Service cloudflared | Format-List Name, Status, StartType
if ((Get-Service cloudflared).Status -ne "Running") {
  throw "cloudflared service is not running."
}
Write-Apoyo "Tunnel service is running with the system profile config."
