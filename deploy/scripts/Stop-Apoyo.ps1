# Stops nginx frontends and optionally the rest of the homelab.
# Does not stop the Cloudflare Tunnel service unless -StopTunnel is passed.

param(
  [switch]$All,
  [switch]$StopTunnel
)

. (Join-Path $PSScriptRoot "common.ps1")

Write-Apoyo "Stopping Apoyo frontends..."
Invoke-FrontendsDown

if ($All) {
  Write-Apoyo "Stopping face-verification..."
  Invoke-FaceDown
  Write-Apoyo "Stopping local Supabase..."
  Invoke-SupabaseStop
}

if ($StopTunnel) {
  $svc = Get-Service -Name "cloudflared" -ErrorAction SilentlyContinue
  if ($svc) {
    Write-Apoyo "Stopping cloudflared Windows service..."
    Stop-Service -Name "cloudflared" -Force
  } else {
    Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force
  }
}

Write-Apoyo "Stop complete."
