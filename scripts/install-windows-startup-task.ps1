param(
  [string]$TaskName = "CR Management System",
  [string]$ProjectPath = "D:\Discovery AI\cr-management-system",
  [string]$NodeCommand = "npm run start"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ProjectPath)) {
  throw "Project path not found: $ProjectPath"
}

$action = New-ScheduledTaskAction `
  -Execute "cmd.exe" `
  -Argument "/c cd /d `"$ProjectPath`" && $NodeCommand"

$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 0)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Start CR Management System web app at Windows logon." `
  -Force | Out-Null

Write-Host "Scheduled task installed: $TaskName"
Write-Host "Project path: $ProjectPath"
Write-Host "Command: $NodeCommand"
Write-Host "Run manually from Task Scheduler or log off/on to test auto-start."
