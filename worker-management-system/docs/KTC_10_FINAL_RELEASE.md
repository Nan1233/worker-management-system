# KTC 10.0 — Final release gate

## 1. Source quality

- TypeScript/build must pass before deployment.
- Backend syntax and test suite must pass.
- Excel stability/release consistency contracts must pass.
- No `.env`, private key, keystore, APK/AAB or archive is committed.
- Dependencies are pinned to the versions recorded in each package-lock.

## 2. Production DB + Excel

Run with Render/TiDB production credentials loaded only in the shell/CI secret store:

```bat
npm run db:verify
npm run db:integrity
npm run validate:real-data
npm run validate:production:smoke
```

`validate:production:smoke` is read-only and verifies:

1. TiDB schema contract.
2. Master/approved report counts.
3. Render liveness/readiness.
4. Worker login + own-history read.
5. Manager login + pending read.
6. Approved report → company-data API.
7. Company data → real `.xlsx` workbook creation using the production-approved data payload.
8. Workbook period and sheet integrity.

## 3. Write-path E2E

Use only a disposable/staging DB:

```bat
set LOCAL_BACKEND_URL=http://127.0.0.1:19080
npm run validate:e2e:staging
```

This exercises Worker create, duplicate protection, backdate limits, machine rules, Manager authorization, approval, optimistic concurrency and Excel sync. The wrapper refuses Render/TiDB production URLs.

## 4. Android

No Android Studio is required. Use Android SDK CLI + Gradle wrapper.

```bat
npm run android:release:check
npm run android:sync
cd frontend\android
gradlew.bat assembleDebug
```

For a signed release AAB configure the KTC Android signing environment variables described in `docs/mobile/ios-android-release.md`, then:

```bat
set KTC_ANDROID_REQUIRE_SIGNING=true
npm run build:android:aab
```

On Windows CMD, set the variables with `set` for the current shell or through a secure CI secret store; never commit them.

## 5. iOS

A native iOS project is generated on macOS with Xcode:

```bash
npm run ios:add
npm run ios:sync
npm run ios:release:check
```

Then configure Apple Team, signing and provisioning in Xcode. Use TestFlight for normal beta distribution.

## 6. Security

```bat
npm run security:contract
npm run audit:prod
```

`security:contract` blocks obvious secret material and tracked archives. Dependency audit requires network access to the npm advisory service.

## 7. Performance / UI gate

- Keep the existing bundle-size contract.
- Test 320/360/375/390/430px and desktop widths.
- Verify no horizontal overflow.
- Verify offline/online banner cleanup and safe-area positioning.
- Test Android keyboard, app reopen, back navigation and network transitions.
