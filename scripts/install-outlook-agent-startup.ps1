# Start CR Outlook Agent for current session
$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "cr-outlook-agent.mjs"
$startupDir = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
$shortcutPath = Join-Path $startupDir "CR_Outlook_Agent.lnk"

if (Test-Path $shortcutPath) {
  Remove-Item -Force $shortcutPath
  Write-Host "Removed legacy startup shortcut: $shortcutPath" -ForegroundColor Yellow
}

Write-Host "Starting CR Outlook Agent for current session..." -ForegroundColor Green
Start-Process "node.exe" -ArgumentList "`"$scriptPath`"" -WindowStyle Hidden
Write-Host "Agent is running locally at http://127.0.0.1:18888" -ForegroundColor Green
