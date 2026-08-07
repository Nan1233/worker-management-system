@echo off
setlocal
cd /d %~dp0

echo [1/4] Cai dat dependency...
call npm ci --prefix backend || exit /b 1
call npm ci --prefix frontend || exit /b 1
call npm ci --prefix desktop || exit /b 1

echo [2/4] Kiem tra toan bo project...
call npm run verify || exit /b 1

echo [3/4] Build EXE...
call npm run build:exe || exit /b 1

echo [4/4] Hoan tat.
echo EXE nam trong desktop\release
endlocal
