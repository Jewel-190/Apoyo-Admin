# Shared paths for Apoyo Windows homelab scripts. Dot-source from the other scripts.

$ErrorActionPreference = "Stop"

$script:ScriptsRoot = $PSScriptRoot
$script:DeployRoot = Split-Path -Parent $ScriptsRoot
$script:AdminRoot = Split-Path -Parent $DeployRoot
$script:DesktopRoot = Split-Path -Parent $AdminRoot

if ($env:APOYO_WEB_ROOT) {
  $script:WebRoot = $env:APOYO_WEB_ROOT
} else {
  $script:WebRoot = Join-Path $DesktopRoot "ApoyoWeb"
}

if ($env:APOYO_FACE_ROOT) {
  $script:FaceRoot = $env:APOYO_FACE_ROOT
} else {
  $script:FaceRoot = Join-Path $DesktopRoot "ApoyoMobile\deploy\face-verification"
}

$script:ComposeFile = Join-Path $DeployRoot "docker-compose.yml"
$script:FrontendEnvFile = Join-Path $DeployRoot ".env"
$script:FaceComposeFile = Join-Path $FaceRoot "docker-compose.yml"
$script:FaceEnvFile = Join-Path $FaceRoot ".env"
$script:CloudflaredConfig = Join-Path $env:USERPROFILE ".cloudflared\config.yml"

function Write-Apoyo {
  param([string]$Message, [string]$Level = "INFO")
  $ts = Get-Date -Format "HH:mm:ss"
  Write-Host "[$ts] [$Level] $Message"
}

function Assert-Path {
  param([string]$Path, [string]$Label)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Missing $Label at $Path"
  }
}

function Wait-DockerDesktop {
  param([int]$TimeoutSec = 180)

  $dockerExe = @(
    "${env:ProgramFiles}\Docker\Docker\Docker Desktop.exe",
    "${env:LOCALAPPDATA}\Docker\Docker\Docker Desktop.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1

  $info = & docker info 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Apoyo "Docker engine is up."
    return
  }

  if ($dockerExe) {
    Write-Apoyo "Starting Docker Desktop..."
    Start-Process -FilePath $dockerExe | Out-Null
  } else {
    throw "Docker Desktop is not installed. Install it, enable Start on login, then re-run."
  }

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    Start-Sleep -Seconds 4
    & docker info 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
      Write-Apoyo "Docker engine is up."
      return
    }
    Write-Apoyo "Waiting for Docker engine..."
  } while ((Get-Date) -lt $deadline)

  throw "Docker engine did not become ready within ${TimeoutSec}s. Open Docker Desktop and wait until it is running."
}

function Ensure-FrontendEnv {
  if (Test-Path -LiteralPath $FrontendEnvFile) {
    return
  }

  $candidates = @(
    (Join-Path $AdminRoot ".env.local"),
    (Join-Path $WebRoot ".env.local")
  )

  foreach ($src in $candidates) {
    if (Test-Path -LiteralPath $src) {
      Copy-Item -LiteralPath $src -Destination $FrontendEnvFile -Force
      Write-Apoyo "Created deploy/.env from existing Vite env (anon key only)."
      return
    }
  }

  throw "Create deploy/.env from deploy/.env.example (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)."
}

function Get-ListeningPids {
  param([int]$Port)
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
}

function Stop-ConflictingListeners {
  param([int[]]$Ports)

  foreach ($port in $Ports) {
    $pids = @(Get-ListeningPids -Port $port)
    foreach ($procId in $pids) {
      if (-not $procId) { continue }
      try {
        $proc = Get-Process -Id $procId -ErrorAction Stop
      } catch {
        continue
      }
      $name = $proc.ProcessName
      if ($name -in @("com.docker.backend", "docker", "vpnkit", "wslrelay")) {
        continue
      }
      Write-Apoyo "Stopping $name (pid $procId) on port $port so nginx can bind 127.0.0.1:$port"
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
  }
}

function Invoke-SupabaseStart {
  Assert-Path (Join-Path $AdminRoot "supabase\config.toml") "Supabase config"
  Push-Location $AdminRoot
  try {
    Write-Apoyo "Starting local Supabase (Kong :54321, Postgres, Auth, Storage, edge functions)..."
    & npx --yes supabase start
    if ($LASTEXITCODE -ne 0) {
      throw "supabase start failed (exit $LASTEXITCODE)."
    }
  } finally {
    Pop-Location
  }
  Ensure-SupabaseRuntime
}

function Ensure-SupabaseRuntime {
  $names = @(docker ps -a --format "{{.Names}}" | Where-Object { $_ -like "supabase_*" })
  foreach ($name in $names) {
    if ($name -like "supabase_vector_*") {
      continue
    }
    & docker update --restart unless-stopped $name | Out-Null
  }

  $edge = $names | Where-Object { $_ -like "supabase_edge_runtime_*" } | Select-Object -First 1
  if (-not $edge) {
    Write-Apoyo "No supabase_edge_runtime_* container. Functions will 503 until supabase start recreates it." "WARN"
    return
  }

  $running = (docker inspect -f "{{.State.Running}}" $edge).Trim()
  if ($running -ne "true") {
    Write-Apoyo "Starting $edge (supabase start skips it when the rest of the stack is already up)..."
    & docker start $edge | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Could not start $edge"
    }
    Start-Sleep -Seconds 2
  } else {
    Write-Apoyo "Edge functions runtime is running."
  }
}

function Invoke-FaceUp {
  Assert-Path $FaceComposeFile "face-verification compose"
  Assert-Path $FaceEnvFile "face-verification .env"
  Write-Apoyo "Starting face-verification stack (CompreFace + verifier :8090)..."
  & docker compose --project-directory $FaceRoot --env-file $FaceEnvFile -f $FaceComposeFile up -d --build
  if ($LASTEXITCODE -ne 0) {
    throw "face-verification compose failed (exit $LASTEXITCODE)."
  }
}

function Invoke-FrontendsUp {
  Assert-Path $WebRoot "ApoyoWeb"
  Ensure-FrontendEnv
  Write-Apoyo "Building and starting nginx frontends (:4173 web, :4174 admin)..."
  & docker compose --project-directory $DeployRoot --env-file $FrontendEnvFile -f $ComposeFile up -d --build
  if ($LASTEXITCODE -ne 0) {
    throw "frontend compose failed (exit $LASTEXITCODE)."
  }
}

function Invoke-FrontendsDown {
  if (Test-Path -LiteralPath $ComposeFile) {
    & docker compose --project-directory $DeployRoot -f $ComposeFile down
  }
}

function Invoke-FaceDown {
  if (Test-Path -LiteralPath $FaceComposeFile) {
    & docker compose --project-directory $FaceRoot --env-file $FaceEnvFile -f $FaceComposeFile down
  }
}

function Invoke-SupabaseStop {
  Push-Location $AdminRoot
  try {
    & npx --yes supabase stop
  } finally {
    Pop-Location
  }
}
