@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-cr-management-system.ps1"
exit /b %ERRORLEVEL%
