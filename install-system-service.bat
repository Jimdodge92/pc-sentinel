@echo off
title PC Sentinel System Service Setup
cd /d "%~dp0"
echo =======================================================
echo   PC Sentinel - Windows System Service Installer
echo =======================================================
echo.
echo Checking Administrator privileges...
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Administrator permissions confirmed. Installing...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-system-service.ps1"
) else (
    echo.
    echo *******************************************************
    echo  ELEVATION REQUIRED
    echo  To launch on boot before user login, Windows requires
    echo  Administrator rights to register an ONSTART service.
    echo *******************************************************
    echo.
    echo Requesting Windows Administrator prompt...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -ArgumentList '/c \"\"%~dp0install-system-service.bat\"\"' -Verb RunAs"
)
pause
