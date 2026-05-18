# Load SUPABASE_* from supabase/.env then repo-root .env (later wins), then run the Supabase CLI.
# Usage: .\scripts\supabase.ps1 db query --linked --agent=no "select 1"
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Import-SupabaseEnvFromFile([string]$Path) {
    if (-not (Test-Path $Path)) { return }
    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line -match "^\s*#" -or $line -eq "") { return }
        if ($line -match "^\s*(SUPABASE_[A-Za-z0-9_]+)\s*=\s*(.*)$") {
            $name = $matches[1]
            $val = $matches[2].Trim().Trim('"').Trim("'")
            Set-Item -Path "Env:$name" -Value $val
        }
    }
}

$supabaseEnv = Join-Path $repoRoot "supabase\.env"
$rootEnv = Join-Path $repoRoot ".env"
Import-SupabaseEnvFromFile $supabaseEnv
Import-SupabaseEnvFromFile $rootEnv

$joined = $args -join " "
if ($joined -match "--linked" -and -not $env:SUPABASE_DB_PASSWORD) {
    Write-Warning "SUPABASE_DB_PASSWORD is empty. Add it to $rootEnv or $supabaseEnv (see .env.example / supabase/.env.example)."
}

Push-Location $repoRoot
try {
    & npx supabase @args
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
