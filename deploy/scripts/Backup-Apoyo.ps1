# Snapshot Postgres, Docker volumes, and (optionally) env/tunnel files onto this PC.
# Does not print secret values. Keep the backup folder off git and off shared drives.

param(
  [string]$OutDir = "",
  [switch]$IncludeSecrets
)

. (Join-Path $PSScriptRoot "common.ps1")

Wait-DockerDesktop | Out-Null

if (-not $OutDir) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutDir = Join-Path $env:USERPROFILE "ApoyoBackups\$stamp"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
Write-Apoyo "Backup directory: $OutDir"

function Backup-DockerVolume {
  param([string]$VolumeName, [string]$FileName)
  $exists = docker volume inspect $VolumeName 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Apoyo "Skip missing volume $VolumeName" "WARN"
    return
  }
  Write-Apoyo "Volume $VolumeName -> $FileName"
  & docker run --rm -v "${VolumeName}:/data:ro" -v "${OutDir}:/backup" alpine:3.20 tar czf "/backup/$FileName" -C /data .
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to archive volume $VolumeName"
  }
}

$dbContainer = docker ps --format "{{.Names}}" | Where-Object { $_ -like "supabase_db_*" } | Select-Object -First 1
if ($dbContainer) {
  $dumpName = "postgres.dump"
  Write-Apoyo "pg_dump from $dbContainer"
  & docker exec $dbContainer pg_dump -U postgres -d postgres --format=custom -f /tmp/apoyo.dump
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed." }
  & docker cp "${dbContainer}:/tmp/apoyo.dump" (Join-Path $OutDir $dumpName)
  & docker exec $dbContainer rm -f /tmp/apoyo.dump
} else {
  Write-Apoyo "No supabase_db_* container; skipping pg_dump." "WARN"
}

$volumes = docker volume ls --format "{{.Name}}"
foreach ($vol in $volumes) {
  if ($vol -match "ApoyoAdmin" -or $vol -match "apoyo-face-verification") {
    $safe = ($vol -replace "[^A-Za-z0-9._-]", "_") + ".tgz"
    Backup-DockerVolume -VolumeName $vol -FileName $safe
  }
}

Copy-Item -LiteralPath (Join-Path $AdminRoot "supabase\config.toml") -Destination (Join-Path $OutDir "config.toml") -Force
Copy-Item -LiteralPath $CloudflaredConfig -Destination (Join-Path $OutDir "cloudflared.config.yml") -ErrorAction SilentlyContinue

if ($IncludeSecrets) {
  $secretDir = Join-Path $OutDir "secrets"
  New-Item -ItemType Directory -Force -Path $secretDir | Out-Null
  $copies = @{
    "supabase.env" = (Join-Path $AdminRoot "supabase\.env")
    "admin.env.local" = (Join-Path $AdminRoot ".env.local")
    "web.env.local" = (Join-Path $WebRoot ".env.local")
    "deploy.env" = $FrontendEnvFile
    "face.env" = $FaceEnvFile
  }
  foreach ($pair in $copies.GetEnumerator()) {
    if (Test-Path -LiteralPath $pair.Value) {
      Copy-Item -LiteralPath $pair.Value -Destination (Join-Path $secretDir $pair.Key) -Force
    }
  }
  $cred = Join-Path $env:USERPROFILE ".cloudflared"
  if (Test-Path $cred) {
    Copy-Item -LiteralPath $cred -Destination (Join-Path $secretDir "cloudflared") -Recurse -Force
  }
  Write-Apoyo "Copied env + tunnel credentials into secrets\ (treat as live keys)."
} else {
  Write-Apoyo "Secrets omitted. Re-run with -IncludeSecrets when you are ready to carry keys to the other PC."
}

Write-Apoyo "Backup finished."
