# KTC Demo Release Gate

## Render
Run `node scripts/renderDemoSmoke.cjs` against the deployed Render URL with a real Manager token and current pending report IDs.
Do not use a synthetic token or bypass authorization.

## Android
Required real-device smoke:
- install release APK/AAB
- login
- select process
- create/submit report
- duplicate protection
- notification
- background/foreground
- Wi-Fi -> 4G -> Wi-Fi
- approve flow from Manager web

## Windows EXE
Required real Windows smoke:
- install
- login
- API connectivity
- Excel export
- restart/update
- uninstall/reinstall
- verify data is not silently lost

## iOS
Requires macOS + Xcode:
- `npm run ios:prepare`
- `npm run ios:doctor:production`
- build/sign archive
- install on physical iPhone
- login/submit/notification/background/network switch
- verify App Store/TestFlight release configuration

A source ZIP cannot truthfully mark these physical-device gates PASS.
