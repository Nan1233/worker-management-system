@echo off
setlocal
cd /d "%~dp0"

node scripts\checkRepository.cjs
if errorlevel 1 exit /b 1

if "%~1"=="" (
  set "MSG=update KTC source"
) else (
  set "MSG=%~1"
)

git add .
node scripts\checkRepository.cjs
if errorlevel 1 exit /b 1

git commit -m "%MSG%"
if errorlevel 1 exit /b 1

git push origin main
endlocal
