# Brings the Apoyo Windows homelab to a serving state.
# Docker Desktop + local Supabase + face stack + nginx SPAs.
# Cloudflare Tunnel is a separate Windows service (Install-CloudflaredService.ps1).

param(
  [switch]$SkipBuild,
  [switch]$SkipFace
)

. (Join-Path $PSScriptRoot "common.ps1")

Write-Apoyo "Apoyo homelab start"
Assert-Path $WebRoot "ApoyoWeb (set APOYO_WEB_ROOT if it is not next to ApoyoAdmin)"

Wait-DockerDesktop
Stop-ConflictingListeners -Ports @(4173, 4174)

Invoke-SupabaseStart

if (-not $SkipFace) {
  Invoke-FaceUp
}

if ($SkipBuild) {
  Write-Apoyo "Starting frontends without rebuild..."
  Ensure-FrontendEnv
  & docker compose --project-directory $DeployRoot --env-file $FrontendEnvFile -f $ComposeFile up -d
  if ($LASTEXITCODE -ne 0) {
    throw "frontend compose up failed (exit $LASTEXITCODE)."
  }
} else {
  Invoke-FrontendsUp
}

& (Join-Path $PSScriptRoot "Health-Apoyo.ps1") -AllowWarmingFace
if ($LASTEXITCODE -ne 0) {
  throw "Health checks failed. See messages above."
}

$svc = Get-Service -Name "cloudflared" -ErrorAction SilentlyContinue
if (-not ($svc -and $svc.Status -eq "Running")) {
  Write-Apoyo "Starting Cloudflare Tunnel process (install the Windows service for reboot survival)..."
  & (Join-Path $PSScriptRoot "Start-Cloudflared.ps1")
}

Write-Apoyo "Stack is up. Public door is Cloudflare Tunnel (cloudflared service or config.yml run)."
