@echo off
setlocal
cd /d "%~dp0"

echo [KTC] Checking required Render source files...

if not exist "backend\services\schemaCompatibilityService.js" (
  echo [ERROR] Missing backend\services\schemaCompatibilityService.js
  exit /b 1
)

findstr /n /c:"require('./schemaCompatibilityService')" "backend\services\processExcelExportService.js" >nul
if errorlevel 1 (
  echo [ERROR] processExcelExportService.js does not reference schemaCompatibilityService as expected.
  exit /b 1
)

node --check "backend\services\schemaCompatibilityService.js"
if errorlevel 1 exit /b 1

node --check "backend\services\processExcelExportService.js"
if errorlevel 1 exit /b 1

echo [KTC] Required Render module is present and syntax is valid.
exit /b 0
