@echo off
chcp 65001 >nul
title SeoShark
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Chua cai Node.js. Hay cai tai https://nodejs.org roi chay lai.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Dang cai dependencies lan dau...
  call npm install
)

echo.
echo  SeoShark dang khoi dong... Mo trinh duyet tai http://localhost:5173
echo  (Nhan Ctrl+C de dung)
echo.
start "" http://localhost:5173
node server.js
pause
