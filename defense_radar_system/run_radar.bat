@echo off
title ESM-ASTRA // Tactical Situational Awareness & RF Command Workstation
color 0B
echo =======================================================================
echo    ESM-ASTRA: ADAPTIVE ELECTRONIC SUPPORT & SITUATIONAL AWARENESS
echo    Unified Multi-Sensor Defence Command & Control Workstation (SIH26055)
echo =======================================================================
echo.

cd /d "%~dp0"

IF NOT EXIST "node_modules" (
    echo [INFO] First time setup: Installing server dependencies...
    call npm.cmd install
)

echo [INFO] Starting ESM-ASTRA Workstation Server on http://localhost:8080 ...
start "" "http://localhost:8080"
node server.js

pause
