@echo off
setlocal EnableExtensions
cd /d "%~dp0"
call npm ci
if errorlevel 1 exit /b 1
call npm --prefix ../frontend ci
if errorlevel 1 exit /b 1
call npm run dist:portable
if errorlevel 1 exit /b 1
echo.
echo Hoan tat. File Portable nam trong thu muc release.
pause
endlocal
