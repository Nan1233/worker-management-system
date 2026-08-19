@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo [LOI] Chua cai Node.js LTS.& exit /b 1)
where npm >nul 2>nul || (echo [LOI] Khong tim thay npm.& exit /b 1)
call npm run verify
if errorlevel 1 exit /b 1
echo.
echo [OK] Toan bo kiem tra da thanh cong.
