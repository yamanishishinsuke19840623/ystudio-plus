@echo off
chcp 65001 > nul
cd /d "%~dp0"
where node > nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js が見つかりません。https://nodejs.org/ から LTS 版をインストールしてから、もう一度実行してください。
  pause
  exit /b 1
)
echo 依存パッケージをインストールしています...
call npm install --omit=dev --no-audit --no-fund
if errorlevel 1 (
  echo [ERROR] npm install に失敗しました。表示されたエラーをそのまま Claude に送ってください。
  pause
  exit /b 1
)
node setup.mjs %*
pause
