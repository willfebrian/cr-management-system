import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchOutlookEmails } from "../services/outlookService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const agentScriptPath = path.join(projectRoot, "scripts", "cr-outlook-agent.mjs");

export const outlookRoutes = Router();

// Raw agent source, fetched by the installer .bat at install time via a
// detached PowerShell process with no browser session — must stay unauthenticated.
// Mounted separately in index.ts, ahead of the requireAuth-gated /api/outlook router.
export const outlookPublicRoutes = Router();

outlookPublicRoutes.get("/agent-script", (_req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  fs.createReadStream(agentScriptPath).pipe(res);
});

outlookRoutes.get("/search-email", async (req, res, next) => {
  try {
    const q = String(req.query.q || "");
    const results = await searchOutlookEmails(q);
    res.json({ rows: results });
  } catch (error) {
    next(error);
  }
});

outlookRoutes.get("/download-agent", (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const bat = buildInstallerBat(baseUrl);
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", 'attachment; filename="Install_Outlook_Agent.bat"');
  res.send(bat);
});

function buildInstallerBat(baseUrl: string): string {
  return `@echo off
title Installing CR Outlook Agent...
echo ========================================================
echo   Installing CR Outlook Agent for Passwordless Outlook
echo ========================================================
echo.

where node.exe >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not in PATH.
  echo Please install Node.js from https://nodejs.org first, then run this installer again.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$targetDir = Join-Path $env:LOCALAPPDATA 'CR_Outlook_Agent';" ^
  "New-Item -ItemType Directory -Force -Path $targetDir | Out-Null;" ^
  "$scriptPath = Join-Path $targetDir 'cr-outlook-agent.mjs';" ^
  "Invoke-WebRequest -Uri '${baseUrl}/api/outlook/agent-script' -OutFile $scriptPath -UseBasicParsing;" ^
  "$startupDir = [System.IO.Path]::Combine($env:APPDATA, 'Microsoft\\Windows\\Start Menu\\Programs\\Startup');" ^
  "$shortcutPath = Join-Path $startupDir 'CR_Outlook_Agent.lnk';" ^
  "if (Test-Path $shortcutPath) { Remove-Item -Force $shortcutPath; }" ^
  "Start-Process 'node.exe' -ArgumentList ('\\\"' + $scriptPath + '\\\"') -WindowStyle Hidden;" ^
  "Write-Host 'Agent installed and running at http://127.0.0.1:18888' -ForegroundColor Green;"

if errorlevel 1 (
  echo.
  echo ========================================================
  echo   Installation FAILED. See the error above.
  echo ========================================================
  pause
  exit /b 1
)

echo.
echo ========================================================
echo   Installation Complete! Agent is running locally.
echo ========================================================
pause
`;
}
