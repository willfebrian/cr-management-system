$ErrorActionPreference = "Stop"

$projectPath = Split-Path -Parent $PSScriptRoot
$healthUrl = "http://127.0.0.1:3001/api/health"
$databaseHealthUrl = "http://127.0.0.1:3001/api/health/database"

try {
  $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
  if ($health.ok -eq $true) {
    Write-Host "CR Management System is already running at http://127.0.0.1:3001." -ForegroundColor Green
    try {
      $databaseHealth = Invoke-RestMethod -Uri $databaseHealthUrl -TimeoutSec 5
      if ($databaseHealth.ok -eq $true) {
        Write-Host "Database connection is available." -ForegroundColor Green
      }
    } catch {
      Write-Warning "The application is running, but the database is unavailable. Check the network/VPN, firewall, and PostgreSQL service for the host configured in .env."
    }
    exit 0
  }
} catch {
  # No healthy application is listening; continue with startup.
}

$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCommand) {
  throw "npm.cmd was not found. Install Node.js or add its installation directory to PATH."
}

Set-Location -LiteralPath $projectPath
Write-Host "Starting CR Management System at http://127.0.0.1:3001..." -ForegroundColor Cyan
& $npmCommand.Source run start
exit $LASTEXITCODE
