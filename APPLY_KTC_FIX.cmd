@echo off
setlocal
cd /d "%~dp0"
node scripts\cleanupSourceArtifacts.cjs || exit /b 1
npm --prefix frontend test || exit /b 1
npm --prefix backend test || exit /b 1
echo [KTC] FIX VERIFIED OK
exit /b 0
