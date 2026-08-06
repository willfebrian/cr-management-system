# Install CR Outlook Agent into Windows Startup Folder (Zero-Config Automatic)
$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "cr-outlook-agent.mjs"
$workingDir = $PSScriptRoot

# Find exact absolute path of node.exe
$nodeCmd = (Get-Command "node" -ErrorAction SilentlyContinue).Source
if (-not $nodeCmd) {
    $nodeCmd = "node.exe"
}

$startupDir = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
$vbsPath = Join-Path $startupDir "CR_Outlook_Agent.vbs"
$shortcutPath = Join-Path $startupDir "CR_Outlook_Agent.lnk"

Write-Host "Installing CR Outlook Agent to Startup..." -ForegroundColor Green
Write-Host "Node Path: $nodeCmd" -ForegroundColor Yellow
Write-Host "Target Script: $scriptPath" -ForegroundColor Yellow

# Remove old shortcut if exists
if (Test-Path $shortcutPath) {
    Remove-Item $shortcutPath -Force -ErrorAction SilentlyContinue
}

# Create silent VBScript launcher in Startup folder
$vbsContent = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "$workingDir"
WshShell.Run """$nodeCmd"" ""$scriptPath""", 0, False
"@

Set-Content -Path $vbsPath -Value $vbsContent -Encoding String

Write-Host "Successfully installed CR Outlook Agent to Windows Startup!" -ForegroundColor Green
Write-Host "Startup script created at: $vbsPath" -ForegroundColor Cyan
Write-Host "Starting agent now..." -ForegroundColor Green

# Kill existing node agent process if running, then restart
Start-Process -FilePath "wscript.exe" -ArgumentList "`"$vbsPath`""
Write-Host "Agent is running silently in background at http://127.0.0.1:18888" -ForegroundColor Green

