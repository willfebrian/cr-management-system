@echo off
title Installing CR Outlook Agent...
echo ========================================================
echo   Installing CR Outlook Agent for Passwordless Outlook
echo ========================================================
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0install-outlook-agent-startup.ps1"
echo.
echo ========================================================
echo   Installation Complete! Agent is running locally.
echo ========================================================
pause
