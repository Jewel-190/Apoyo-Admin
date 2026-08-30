# Restore a Backup-Apoyo.ps1 snapshot onto this PC.
# Requires Docker Desktop and an already-started local Supabase (so volumes exist).
#
# Usage:
#   .\Start-Apoyo.ps1
#   .\Restore-Apoyo.ps1 -FromDir "$env:USERPROFILE\ApoyoBackups\yyyyMMdd-HHmmss"

param(
  [Parameter(Mandatory = $true)]
  [string]$FromDir,
  [switch]$RestoreVolumes,
  [switch]$RestoreDatabase
)

. (Join-Path $PSScriptRoot "common.ps1")

Assert-Path $FromDir "backup directory"
Wait-DockerDesktop

if ($RestoreDatabase) {
  $dump = Join-Path $FromDir "postgres.dump"
  Assert-Path $dump "postgres.dump"
  $dbContainer = docker ps --format "{{.Names}}" | Where-Object { $_ -like "supabase_db_*" } | Select-Object -First 1
  if (-not $dbContainer) { throw "Start Supabase first (Start-Apoyo.ps1) so supabase_db_* exists." }
  Write-Apoyo "Restoring pg_dump into $dbContainer (this replaces current data)."
  & docker cp $dump "${dbContainer}:/tmp/apoyo.dump"
  & docker exec $dbContainer pg_restore -U postgres -d postgres --clean --if-exists /tmp/apoyo.dump
  if ($LASTEXITCODE -ne 0) {
    throw "pg_restore failed (exit $LASTEXITCODE)."
  }
  & docker exec $dbContainer rm -f /tmp/apoyo.dump
}

if ($RestoreVolumes) {
  Get-ChildItem -LiteralPath $FromDir -Filter "*.tgz" | ForEach-Object {
    $vol = $_.BaseName
    Write-Apoyo "Restoring volume $vol from $($_.Name)"
    & docker volume create $vol | Out-Null
    & docker run --rm -v "${vol}:/data" -v "${FromDir}:/backup" alpine:3.20 tar xzf "/backup/$($_.Name)" -C /data
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to restore $($_.Name)"
    }
  }
}

Write-Apoyo "Restore step finished. Run Health-Apoyo.ps1 next."
