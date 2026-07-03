param(
  [string]$ShortcutName = "CR Management System.lnk",
  [string]$ProjectPath = "D:\Discovery AI\cr-management-system"
)

$ErrorActionPreference = "Stop"

$target = Join-Path $ProjectPath "scripts\start-cr-management-system.cmd"
if (-not (Test-Path -LiteralPath $target)) {
  throw "Startup target not found: $target"
}

$startupFolder = [Environment]::GetFolderPath("Startup")
if (-not (Test-Path -LiteralPath $startupFolder)) {
  throw "Startup folder not found: $startupFolder"
}

$shortcutPath = Join-Path $startupFolder $ShortcutName
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $target
$shortcut.WorkingDirectory = $ProjectPath
$shortcut.WindowStyle = 7
$shortcut.Description = "Start CR Management System at Windows logon."
$shortcut.Save()

Write-Host "Startup shortcut installed: $shortcutPath"
Write-Host "Target: $target"
