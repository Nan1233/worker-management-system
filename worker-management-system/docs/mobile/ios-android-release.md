# KTC Mobile Release — Android + iOS (production checklist)

## Architecture

`React/Vite -> Capacitor -> Android/iOS -> Render API -> TiDB Cloud`

No local database is required. Native apps must never contain DB credentials, JWT secrets or Google service-account keys.

## Android — Windows without Android Studio

The project can be built with Android SDK Command-line Tools + Gradle wrapper. Android Studio is not required.

Required environment:

```text
ANDROID_HOME=C:\Android\Sdk
ANDROID_SDK_ROOT=C:\Android\Sdk
PATH += C:\Android\Sdk\platform-tools
PATH += C:\Android\Sdk\cmdline-tools\latest\bin
```

Verify:

```bat
adb --version
sdkmanager --version
```

Sync and debug APK:

```bat
npm --prefix frontend run android:sync
cd frontend\android
gradlew.bat assembleDebug
```

Release AAB requires signing. Credentials are never stored in Git. Set these environment variables on the build machine/CI only:

```text
KTC_ANDROID_KEYSTORE_PATH=C:\secure\ktc-release.jks
KTC_ANDROID_KEYSTORE_PASSWORD=***
KTC_ANDROID_KEY_ALIAS=ktc-release
KTC_ANDROID_KEY_PASSWORD=***
KTC_ANDROID_REQUIRE_SIGNING=true
KTC_ANDROID_VERSION_CODE=10
KTC_ANDROID_VERSION_NAME=10.0.0
```

Then:

```bat
npm --prefix frontend run android:release:check
npm --prefix frontend run android:aab:release
```

The signing variables are read only by Gradle. Do not put them in `.env`, source code or Git.

## Android free distribution

A debug APK can be installed directly on an Android phone without Google Play. A signed release APK can also be distributed directly, subject to Android device security settings. Google Play distribution is optional and has its own developer-account requirements.

## iOS production setup

iOS native builds/signing require macOS + Xcode. Windows can prepare and validate the Capacitor source, but cannot produce an Apple-signed production IPA.

On macOS:

```bash
npm install
npm --prefix frontend install
npm --prefix frontend run ios:add
npm --prefix frontend run ios:sync
npm --prefix frontend run ios:release:check
```

Open the generated `frontend/ios` workspace/project in Xcode and configure:

- Apple Team
- Bundle Identifier: `com.ktchanoi.productioncontrol`
- Signing certificate
- Provisioning profile
- Release configuration
- App icon / launch assets
- Push notification capability only if/when a real APNs setup is enabled

For beta distribution use TestFlight. Direct device installation is subject to Apple's signing/provisioning rules; there is no permanent, universal free IPA distribution mechanism.

## Mobile UX release gate

- Safe-area aware layout
- 16px input font to avoid iOS zoom
- Touch targets >= 44px where practical
- No horizontal overflow at 320/360/375/390/430px
- Keyboard does not cover submit controls
- Back/reopen app does not corrupt an in-progress report
- Network loss shows a clear banner and preserves the draft/queue
- Production API URL is used by native builds

## Production smoke / E2E

`npm run validate:production:smoke` is deliberately **read-only**. It checks the real TiDB schema/counts, Render health/readiness, Worker login, Manager login, approved-report API, and builds real Excel workbooks from the returned production data.

Required variables:

```text
KTC_PROD_API_URL=https://<render-service>/api
KTC_E2E_WORKER_CODE=<dedicated-test-worker-code>
KTC_E2E_MANAGER_USERNAME=<dedicated-test-manager>
KTC_E2E_MANAGER_PASSWORD=<dedicated-test-password>
DB_HOST=...
DB_PORT=4000
DB_NAME=worker_management
DB_USER=...
DB_PASSWORD=...
DB_SSL=true
```

Run:

```bat
npm run validate:production:smoke
```

The generated files are placed under `validation-artifacts/` and are ignored by Git.

For write-path Worker/Manager E2E (create -> approve -> conflict -> Excel sync), use `scripts/zero-cost/critical-e2e.cjs` only against an isolated/staging database with disposable test accounts. It intentionally exercises write operations and must not be pointed at production.

## Write-path E2E gate

The full Worker -> Manager workflow is covered by `scripts/zero-cost/critical-e2e.cjs`. It creates test data, exercises duplicate protection, approval and optimistic-concurrency conflict, and checks Excel sync. Use the guarded wrapper:

```bat
set LOCAL_BACKEND_URL=http://127.0.0.1:19080
npm run validate:e2e:staging
```

The wrapper refuses any URL containing `onrender.com` or `tidbcloud`, so production cannot be used accidentally for write-path E2E.
