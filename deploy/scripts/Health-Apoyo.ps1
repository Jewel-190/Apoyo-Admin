# Probe local origins the Cloudflare Tunnel points at. Exit 1 if any required check fails.

param(
  [switch]$AllowWarmingFace
)

. (Join-Path $PSScriptRoot "common.ps1")

$script:failed = $false

function Test-HttpOk {
  param(
    [string]$Name,
    [string]$Url,
    [int[]]$OkStatus = @(200),
    [switch]$Optional
  )

  try {
    $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 20 -MaximumRedirection 0 -ErrorAction Stop
    $code = [int]$resp.StatusCode
    if ($OkStatus -contains $code) {
      Write-Apoyo "$Name  $code  $Url"
      return
    }
    Write-Apoyo "$Name  unexpected status $code  $Url" "WARN"
    if (-not $Optional) { $script:failed = $true }
  } catch {
    $code = $null
    if ($_.Exception.Response) {
      $code = [int]$_.Exception.Response.StatusCode
    }
    if ($code -and ($OkStatus -contains $code)) {
      Write-Apoyo "$Name  $code  $Url"
      return
    }
    Write-Apoyo "$Name  FAIL  $Url  $($_.Exception.Message)" "ERROR"
    if (-not $Optional) { $script:failed = $true }
  }
}

Test-HttpOk -Name "web     " -Url "http://127.0.0.1:4173/"
Test-HttpOk -Name "admin   " -Url "http://127.0.0.1:4174/"
Test-HttpOk -Name "auth    " -Url "http://127.0.0.1:54321/auth/v1/health"
Test-HttpOk -Name "rest    " -Url "http://127.0.0.1:54321/rest/v1/" -OkStatus @(200, 401)
Test-HttpOk -Name "web fn  " -Url "http://127.0.0.1:54321/functions/v1/web" -OkStatus @(200, 401, 405)

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:8090/health" -TimeoutSec 15
  $status = [string]$health.status
  if ($status -eq "ok") {
    Write-Apoyo "face    ok  http://127.0.0.1:8090/health"
  } elseif ($AllowWarmingFace -and $status -eq "warming") {
    Write-Apoyo "face    warming (models still loading)  http://127.0.0.1:8090/health" "WARN"
  } else {
    Write-Apoyo "face    status=$status  http://127.0.0.1:8090/health" "WARN"
    if (-not $AllowWarmingFace) { $script:failed = $true }
  }
} catch {
  Write-Apoyo "face    FAIL  http://127.0.0.1:8090/health  $($_.Exception.Message)" "ERROR"
  $script:failed = $true
}

if ($script:failed) {
  Write-Apoyo "One or more health checks failed." "ERROR"
  exit 1
}

Write-Apoyo "All required local origins responded."
exit 0
