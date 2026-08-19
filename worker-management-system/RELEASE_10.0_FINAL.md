# KTC 10.0 Final Source Release

## Verified in this release
- Frontend TypeScript: PASS (`tsc -b`)
- Frontend tests: 139/139 PASS
- Backend JavaScript syntax/source check: PASS (151 JS files)
- Excel stability contract: PASS
- Release gate contract: PASS
- Release consistency contract: PASS
- Repository guard: PASS

## Mobile
- Android Capacitor project is included and can be built with the Android SDK/Gradle CLI.
- iOS is prepared through Capacitor scripts; native iOS build/signing must be performed on macOS/Xcode.
- No production secrets are included.

## Important
The source archive intentionally excludes `node_modules`, Gradle caches, build output, `.git`, and real `.env` files.
