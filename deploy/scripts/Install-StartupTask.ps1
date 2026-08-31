# Register a logon task so the Docker stack comes back after reboot.
# Docker Desktop itself should also be set to Start with Windows.
# Requires an elevated PowerShell window.

#Requires -RunAsAdministrator

. (Join-Path $PSScriptRoot "common.ps1")

$startScript = Join-Path $ScriptsRoot "Start-Apoyo.ps1"
Assert-Path $startScript "Start-Apoyo.ps1"

$taskName = "ApoyoHomelabStart"
$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`" -SkipBuild"

$trigger = New-ScheduledTaskTrigger -AtLogOn
$trigger.Delay = "PT90S"

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null

Write-Apoyo "Scheduled task '$taskName' registered (90s after logon, -SkipBuild)."
Write-Apoyo "In Docker Desktop: Settings -> General -> Start Docker Desktop when you sign in."
Get-ScheduledTask -TaskName $taskName | Format-List TaskName, State
