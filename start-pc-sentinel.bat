@echo off
title PC Sentinel Diagnostic Hub
cd /d "%~dp0"

echo Starting PC Sentinel background service...
start "" http://localhost:3500
node server/index.js
pause
