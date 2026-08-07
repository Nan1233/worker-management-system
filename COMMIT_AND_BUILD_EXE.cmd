@echo off
setlocal
cd /d C:\VSCode\worker-management-system
if errorlevel 1 exit /b 1

echo === KTC VERIFY ===
call npm run verify
if errorlevel 1 (
  echo VERIFY FAILED - khong commit/build.
  exit /b 1
)

echo === GIT STATUS ===
git status

echo === COMMIT ===
git add .
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Finalize professional UI and responsive layout"
  if errorlevel 1 exit /b 1
) else (
  echo Khong co thay doi moi de commit.
)

echo === PUSH ===
git push origin main
if errorlevel 1 exit /b 1

echo === BUILD EXE ===
call npm run build:exe
if errorlevel 1 exit /b 1

echo === OUTPUT ===
dir desktop\release\*.exe

echo.
echo HOAN TAT.
endlocal
