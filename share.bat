@echo off
chcp 65001 >nul
title SeoShark - Chia se Public
cd /d "%~dp0"

where node >nul 2>nul || (echo [LOI] Chua cai Node.js. & pause & exit /b 1)
where cloudflared >nul 2>nul || (echo [LOI] Chua cai cloudflared. Chay: winget install --id Cloudflare.cloudflared & pause & exit /b 1)

if not exist "node_modules" call npm install

echo Khoi dong server SeoShark (cong 5173)...
start "SeoShark Server" cmd /c "node server.js"
timeout /t 3 >nul

echo.
echo =====================================================================
echo   LINK PUBLIC SE HIEN O DONG "trycloudflare.com" BEN DUOI.
echo   Copy link do de chia se. GIU CUA SO NAY MO de duy tri link.
echo   Dong cua so = tat link chia se.
echo =====================================================================
echo.
cloudflared tunnel --url http://localhost:5173 --no-autoupdate
pause
