@echo off
rem yayoi-mcp setup (ASCII only: Japanese text lives in setup.mjs)
cd /d "%~dp0"
where node > nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install the LTS version from https://nodejs.org/ and run this again.
  pause
  exit /b 1
)
echo Installing packages...
call npm install --omit=dev --no-audit --no-fund
if errorlevel 1 (
  echo [ERROR] npm install failed. Send the error shown above to Claude.
  pause
  exit /b 1
)
node setup.mjs %*
pause
