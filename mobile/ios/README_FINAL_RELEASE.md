# KTC iOS Release

KTC uses Capacitor for iOS. The repository intentionally does not contain an `.ipa` because Apple signing/building requires macOS/Xcode.

On macOS:
1. Install Node.js 22+.
2. From the project root run `npm install` and `npm --prefix frontend install`.
3. Run `npm run ios:sync` (the script installs the Capacitor iOS package as needed).
4. Open `frontend/ios` in Xcode.
5. Configure the Apple Team/signing for bundle ID `com.ktchanoi.productioncontrol`.
6. Archive and export the signed app.

The existing `mobile/ios/KTC-Production-Control.mobileconfig` is a WebClip/profile artifact and is not an App Store `.ipa`.

No Apple Developer fee is required to prepare the source project. A stable signed distribution to other iPhones is subject to Apple's signing/distribution rules.
