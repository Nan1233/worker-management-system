@echo off
setlocal
set "ROOT=%~1"
if "%ROOT%"=="" set "ROOT=C:\VSCode\worker-management-system"

if not exist "%ROOT%\frontend\package.json" (
  echo [KTC] Khong tim thay frontend tai: %ROOT%
  echo Cach dung: APPLY_TO_PROJECT.cmd "C:\duong-dan\worker-management-system"
  exit /b 2
)

for %%D in (frontend backend desktop) do (
  if exist "%~dp0%%D" (
    robocopy "%~dp0%%D" "%ROOT%\%%D" /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul
    if errorlevel 8 (
      echo [KTC] Loi copy %%D
      exit /b 3
    )
  )
)

copy /Y "%~dp0README_DEMO_READY_20260810.md" "%ROOT%\README_DEMO_READY_20260810.md" >nul
copy /Y "%~dp0CHANGED_FILES.txt" "%ROOT%\CHANGED_FILES_DEMO_20260810.txt" >nul
if exist "%~dp0FULL_STABILIZATION_20260810.md" copy /Y "%~dp0FULL_STABILIZATION_20260810.md" "%ROOT%\FULL_STABILIZATION_20260810.md" >nul
if exist "%~dp0FULL_STABILIZATION_CHANGED_FILES_20260810.txt" copy /Y "%~dp0FULL_STABILIZATION_CHANGED_FILES_20260810.txt" "%ROOT%\FULL_STABILIZATION_CHANGED_FILES_20260810.txt" >nul

echo [KTC] Da chep patch demo vao: %ROOT%
echo [KTC] Tiep theo chay:
echo   cd /d %ROOT%
echo   npm --prefix backend run db:migrate
echo   npm --prefix backend run db:demo-schema
echo   npm --prefix frontend run typecheck
echo   npm --prefix frontend run build
echo   npm --prefix backend run verify
echo   npm --prefix desktop run check
echo   npm --prefix desktop run smoke:excel
echo   npm run verify
exit /b 0
