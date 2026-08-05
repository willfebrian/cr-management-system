# Install CR Outlook Agent into Windows Startup Folder
$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "cr-outlook-agent.mjs"
$startupDir = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
$shortcutPath = Join-Path $startupDir "CR_Outlook_Agent.lnk"

Write-Host "Installing CR Outlook Agent to Startup..." -ForegroundColor Green
Write-Host "Target Script: $scriptPath" -ForegroundColor Yellow

$WScriptShell = New-Object -ComObject WScript.Shell
$Shortcut = $WScriptShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = "node.exe"
$Shortcut.Arguments = "`"$scriptPath`""
$Shortcut.WindowStyle = 7 # Minimized / Hidden
$Shortcut.Description = "CR Management System Local Outlook Agent"
$Shortcut.Save()

Write-Host "Successfully installed CR Outlook Agent to Windows Startup!" -ForegroundColor Green
Write-Host "Shortcut created at: $shortcutPath" -ForegroundColor Cyan
Write-Host "Starting agent now..." -ForegroundColor Green

Start-Process "node.exe" -ArgumentList "`"$scriptPath`"" -WindowStyle Hidden
Write-Host "Agent is running locally at http://127.0.0.1:18888" -ForegroundColor Green
