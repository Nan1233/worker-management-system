# KTC Mobile Release — Android + iOS

## Architecture

The mobile apps use the same React/Vite application and the same Render API:

`React/Vite -> Capacitor -> Android/iOS -> Render -> TiDB Cloud`

No local database is required.

## Android (Windows/macOS/Linux)

From the repository root:

```bat
npm run android:sync
npm run android:open
```

For a debug APK:

```bat
npm run build:android
```

For a release AAB:

```bat
npm run build:android:aab
```

Android Studio is required for signing/release configuration.

## iOS (macOS + Xcode required)

iOS builds cannot be produced on Windows. On a Mac:

```bash
npm install
npm --prefix frontend install
npm run ios:add
npm run ios:sync
npm run ios:open
```

Then configure the Apple Team, Bundle Identifier, signing certificate and provisioning profile in Xcode.

The bundle identifier is:

`com.ktchanoi.productioncontrol`

## Mobile UI requirements

- Safe-area aware layout.
- 16px input font to avoid iOS zoom.
- Touch targets at least 44px where practical.
- No horizontal overflow.
- Native WebView does not register the PWA service worker.
- API calls use the production Render URL.
- Do not place DB credentials, JWT secrets or Google service-account keys in the app bundle.

## iOS profile install

The existing `/api/mobile/ios-profile` flow is separate from the Capacitor app. It can remain available for company device profile installation.
