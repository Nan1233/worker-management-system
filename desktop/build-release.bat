@echo off
setlocal EnableExtensions
cd /d "%~dp0"
call npm install
if errorlevel 1 exit /b 1
call npm run frontend:install
if errorlevel 1 exit /b 1
call npm run dist:portable:fast
if errorlevel 1 exit /b 1
echo.
echo Hoan tat. File Portable nam trong thu muc release.
pause
endlocal
