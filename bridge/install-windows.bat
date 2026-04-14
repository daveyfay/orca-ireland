@echo off
REM ORCA Ireland - Decoder Bridge (Windows installer)
REM Double-click this file to set up the bridge on a Windows laptop.
REM
REM What it does:
REM   1. Checks Node.js is installed (helps you install if not)
REM   2. Downloads the latest bridge code from GitHub
REM   3. Installs dependencies
REM   4. Creates a config file in simulator mode (safe to test without a decoder)
REM   5. Creates run-bridge.bat on your Desktop to start it

setlocal ENABLEDELAYEDEXPANSION
title ORCA Decoder Bridge - Installer

echo.
echo ======================================================
echo   ORCA Ireland - Decoder Bridge Installer (Windows)
echo ======================================================
echo.

REM ---- 1. Check for Node.js ----
where node >nul 2>&1
if errorlevel 1 (
  echo [!] Node.js is not installed.
  echo.
  echo     Please install it from https://nodejs.org
  echo     Pick the "LTS" installer, run it, accept the defaults,
  echo     then double-click this file again.
  echo.
  start https://nodejs.org
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -v') do set NODEVER=%%v
echo [OK] Node.js !NODEVER! detected.
echo.

REM ---- 2. Pick install folder ----
set TARGET=%USERPROFILE%\orca-bridge
echo Installing into: %TARGET%
if not exist "%TARGET%" mkdir "%TARGET%"
cd /d "%TARGET%"

REM ---- 3. Download the bridge files from GitHub ----
echo.
echo Downloading bridge code...
set ZIP=%TARGET%\orca-bridge.zip
set REPO=https://github.com/daveyfay/orca-ireland/archive/refs/heads/master.zip

powershell -NoProfile -Command ^
  "try { Invoke-WebRequest -Uri '%REPO%' -OutFile '%ZIP%' -UseBasicParsing } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 (
  echo [!] Download failed. Check your internet connection.
  pause
  exit /b 1
)

echo Extracting...
powershell -NoProfile -Command ^
  "Expand-Archive -Path '%ZIP%' -DestinationPath '%TARGET%\_tmp' -Force"
if errorlevel 1 (
  echo [!] Extract failed.
  pause
  exit /b 1
)

REM Copy just the bridge folder contents into TARGET
xcopy /E /Y /Q "%TARGET%\_tmp\orca-ireland-master\bridge\*" "%TARGET%\" >nul
rmdir /S /Q "%TARGET%\_tmp"
del "%ZIP%"

echo [OK] Bridge code installed.
echo.

REM ---- 4. npm install ----
echo Installing dependencies (this may take a minute)...
call npm install --omit=dev --loglevel=error
if errorlevel 1 (
  echo [!] npm install failed. See messages above.
  pause
  exit /b 1
)
echo [OK] Dependencies installed.
echo.

REM ---- 5. Create default config if missing ----
if not exist "%TARGET%\config.json" (
  > "%TARGET%\config.json" echo {
  >> "%TARGET%\config.json" echo   "decoder": "amb",
  >> "%TARGET%\config.json" echo   "simulate": true,
  >> "%TARGET%\config.json" echo   "wsPort": 2346
  >> "%TARGET%\config.json" echo }
  echo [OK] Created config.json in simulator mode.
  echo     Edit %TARGET%\config.json when you have decoder details.
) else (
  echo [OK] Keeping existing config.json.
)
echo.

REM ---- 6. Desktop shortcut ----
set RUNBAT=%USERPROFILE%\Desktop\run-orca-bridge.bat
> "%RUNBAT%" echo @echo off
>> "%RUNBAT%" echo title ORCA Decoder Bridge
>> "%RUNBAT%" echo cd /d "%TARGET%"
>> "%RUNBAT%" echo node bridge.js
>> "%RUNBAT%" echo pause
echo [OK] Shortcut created on Desktop: run-orca-bridge.bat
echo.

echo ======================================================
echo   Installation complete.
echo.
echo   To start the bridge:
echo     Double-click "run-orca-bridge.bat" on your Desktop.
echo.
echo   To switch from simulator to a real decoder, edit:
echo     %TARGET%\config.json
echo.
echo   Race control connects to ws://localhost:2346 (this PC)
echo   or ws://^<this-pc-ip^>:2346 from other machines on WiFi.
echo ======================================================
echo.
pause
