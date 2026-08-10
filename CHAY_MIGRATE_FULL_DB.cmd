@echo off
setlocal
cd /d %~dp0
if not exist backend\package.json (
  echo [LOI] Hay chep thu muc backend trong goi nay vao project KTC truoc.
  exit /b 1
)
echo [1/3] Chay migration + seed du lieu goc...
call npm --prefix backend run db:migrate
if errorlevel 1 exit /b 1
echo [2/3] Kiem tra snapshot seed...
call npm --prefix backend test -- --test-name-pattern="master seed"
if errorlevel 1 exit /b 1
echo [3/3] Kiem tra so luong trong DB...
call npm --prefix backend run db:verify-master
if errorlevel 1 exit /b 1
echo.
echo [KTC] MIGRATE FULL DB HOAN TAT.
endlocal
