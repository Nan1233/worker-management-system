# KTC free mobile release

## One link

Use:

`https://<your-render-frontend>/download`

The page detects the device.

### Android

The page starts the APK download automatically and also provides a fallback button.

For the free Render-hosted download to work, copy the APK you built locally to:

`frontend/public/downloads/ktc-production-control.apk`

Then commit that single APK. The repository intentionally ignores other APK/AAB artifacts.

Build the APK first:

```bat
cd /d F:\VSCode\worker-management-system
npm run android:sync
cd frontend\android
gradlew.bat assembleDebug
```

Then copy `frontend\android\app\build\outputs\apk\debug\app-debug.apk` to `frontend\public\downloads\ktc-production-control.apk`.

### iPhone / iPad

No paid Apple account and no IPA is required for the free deployment. The same `/download` page opens the KTC PWA and gives the Safari installation steps.

Apple's supported flow is Safari → Share → Add to Home Screen → Open as Web App → Add.

The repository also keeps `KTC-Production-Control.mobileconfig` as an optional WebClip shortcut. It is not an IPA and does not bypass Apple's native app signing.

## Important

Do not put `.env`, signing keys, passwords, or production service-account credentials in the repository.
