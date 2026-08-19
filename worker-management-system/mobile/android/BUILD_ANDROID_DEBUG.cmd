@echo off
setlocal
cd /d "%~dp0\..\.."

echo [KTC] Android setup/build
where node >nul 2>nul || (echo Node.js chua duoc cai & exit /b 1)
for /f "tokens=1 delims=." %%V in ('node -p "process.versions.node"') do set NODE_MAJOR=%%V
if %NODE_MAJOR% LSS 22 (
  echo Capacitor 8 yeu cau Node.js 22+. Hien tai:
  node -v
  exit /b 1
)

call npm --prefix frontend install || exit /b 1
call npm --prefix frontend run android:prepare || exit /b 1
call npm --prefix frontend run build || exit /b 1
if not exist "frontend\android\gradlew.bat" (
  pushd frontend
  call npx cap add android || (popd & exit /b 1)
  popd
)
pushd frontend
call npx cap sync android || (popd & exit /b 1)
popd

pushd frontend\android
call gradlew.bat assembleDebug || (popd & exit /b 1)
popd

echo.
echo APK: frontend\android\app\build\outputs\apk\debug\app-debug.apk
endlocal
