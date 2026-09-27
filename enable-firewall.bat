@echo off
:: PC Sentinel - Silent / Interactive Inbound Firewall Rule
net session >nul 2>&1
if %errorLevel% neq 0 (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process '%~0' -Verb RunAs"
    exit /b
)

netsh advfirewall firewall delete rule name="PC Sentinel Remote Access" >nul 2>&1
netsh advfirewall firewall add rule name="PC Sentinel Remote Access" dir=in action=allow protocol=TCP localport=3500 >nul 2>&1

if "%~1"=="--interactive" (
    echo ===================================================
    echo  PC Sentinel - Inbound Firewall Configuration
    echo ===================================================
    echo.
    echo [SUCCESS] Windows Firewall rule added! Inbound TCP port 3500 is now allowed.
    echo.
    pause
)
