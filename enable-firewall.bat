@echo off
:: Self-elevate to Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process '%~0' -Verb RunAs"
    exit /b
)

echo ===================================================
echo  PC Sentinel - Inbound Firewall Configuration
echo ===================================================
echo.
echo Opening inbound TCP Port 3500 for off-network port forwarding...

netsh advfirewall firewall delete rule name="PC Sentinel Remote Access" >nul 2>&1
netsh advfirewall firewall add rule name="PC Sentinel Remote Access" dir=in action=allow protocol=TCP localport=3500

if %errorLevel% equ 0 (
    echo.
    echo [SUCCESS] Windows Firewall rule added! Inbound TCP port 3500 is now allowed.
) else (
    echo.
    echo [ERROR] Failed to add firewall rule. Please run this script as Administrator.
)

echo.
echo You can now set up your router's port forwarding rule:
echo   - Local/Internal IP: 192.168.4.39
echo   - Internal Port:     3500
echo   - External Port:     3500
echo   - Protocol:          TCP
echo.
pause
