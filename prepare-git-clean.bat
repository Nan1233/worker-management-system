@echo off
setlocal
cd /d "%~dp0"

echo [KTC] Rebuilding Git index from .gitignore...
git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo [KTC] No Git repository yet. Run git init first.
  exit /b 0
)

git rm -r --cached . >nul 2>nul
git add .
node scripts\checkRepository.cjs
if errorlevel 1 exit /b 1

echo [KTC] Git index is clean. node_modules, release, dist and EXE are excluded.
endlocal
