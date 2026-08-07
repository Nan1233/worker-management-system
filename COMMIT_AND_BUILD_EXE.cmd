@echo off
setlocal EnableExtensions

REM Chay file nay tai repo KTC. Neu file duoc chep vao root repo, %~dp0 la duong dan dung.
cd /d "%~dp0"
if errorlevel 1 exit /b 1

where node >nul 2>&1 || (
  echo [ERROR] Khong tim thay Node.js trong PATH.
  exit /b 1
)
where npm >nul 2>&1 || (
  echo [ERROR] Khong tim thay npm trong PATH.
  exit /b 1
)
where git >nul 2>&1 || (
  echo [ERROR] Khong tim thay Git trong PATH.
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>&1 || (
  echo [ERROR] Thu muc hien tai khong phai Git repository.
  echo Hay chep source nay vao C:\VSCode\worker-management-system truoc khi chay.
  exit /b 1
)

echo.
echo === 1/5 KTC VERIFY ===
call npm run verify
if errorlevel 1 (
  echo.
  echo [STOP] VERIFY FAILED - KHONG commit, KHONG build EXE.
  exit /b 1
)

echo.
echo === 2/5 GIT STATUS ===
git status --short

echo.
echo === 3/5 COMMIT ===
git add .
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Harden auth and refactor production architecture"
  if errorlevel 1 exit /b 1
) else (
  echo Khong co thay doi moi de commit.
)

echo.
echo === 4/5 PUSH MAIN ===
git push origin main
if errorlevel 1 (
  echo [ERROR] Push that bai. Khong tu dong force-push.
  exit /b 1
)

echo.
echo === 5/5 BUILD WINDOWS EXE ===
call npm run build:exe
if errorlevel 1 exit /b 1

echo.
echo === OUTPUT ===
if exist "desktop\release\*.exe" (
  dir /b desktop\release\*.exe
) else (
  echo [WARN] Khong tim thay EXE trong desktop\release.
)
if exist "desktop\release\SHA256SUMS.txt" type desktop\release\SHA256SUMS.txt

echo.
echo HOAN TAT.
endlocal
