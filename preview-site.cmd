@echo off
rem ---------------------------------------------------------------------------
rem  Test the SwarTM website on this computer (and optionally on a phone).
rem
rem    Double-click this file, or in a terminal in this folder run:
rem      Command Prompt:  preview-site.cmd          (or: preview-site.cmd phone)
rem      PowerShell:      .\preview-site.cmd        (or: .\preview-site.cmd phone)
rem
rem  It builds the production version and opens it in your browser.
rem  "phone" also makes it reachable from a phone/tablet on the same Wi-Fi.
rem ---------------------------------------------------------------------------
setlocal
rem Show the build's symbols correctly.
chcp 65001 >nul
cd /d "%~dp0"
set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 22 or newer from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies, first run only...
  call npm install
  if errorlevel 1 goto failed
)

echo Building the site, this takes about a minute...
call npm run build
if errorlevel 1 goto failed

if /i "%~1"=="phone" set "HOST=0.0.0.0"

node scripts\serve-dist.mjs --open
exit /b 0

:failed
echo.
echo Something went wrong - see the messages above.
pause
exit /b 1
