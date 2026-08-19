# KTC Demo Final Hardening — 2026-08-18

## Baseline
- Source baseline: `b847493`
- This package is intended as a local demo/release candidate source package.
- No GitHub commit/push was performed by this hardening pass.

## Changes made
1. Removed stale duplicate root application source and build files; `frontend/` remains the sole canonical web/mobile source tree.
2. Removed stale empty frontend source placeholders that could break repository/source contracts.
3. Removed stale `*.bak_auth_refresh` / route backup source files.
4. Removed obsolete `backend/middleware/companyNetworkMiddleware.js`; the worker network compatibility endpoint is intentionally unrestricted and no production route imports the obsolete enforcement middleware.
5. Kept `frontend/android` as the canonical Android source tree.
6. Hardened source-contract tests against Windows CRLF line endings.
7. Hardened the Electron refresh source contract test so it validates ordering without depending on formatting indentation.
8. Preserved the repaired `AppRouter.tsx` route syntax and master-data fallback routes.

## Automated results in this environment
- Root contract suite: **151/151 PASS**
- Frontend contract suite: **146/146 PASS**
- Desktop tests: **7/7 PASS**
- Backend tests: **411/412 PASS** in this environment.
  - The only remaining failure is `backend/tests/canonical-template-contract.test.js` because the execution environment could not install/load `backend/node_modules/exceljs`.
  - `backend/package.json` declares `exceljs: 4.4.0`; this is an environment/dependency-install limitation, not evidence of a business-logic failure.
- Backend/desktop JavaScript syntax scan: **PASS**
- Relative frontend import existence scan: **PASS**
- Canonical source contract: **PASS**

## Platform notes
- Web/PWA source and responsive contracts pass.
- Android canonical source exists at `frontend/android`.
- Native iOS `.ipa` is not generated on Windows; `mobile/ios` contains WebClip/profile delivery documentation and artifacts. A signed native iOS build requires macOS + Xcode.
- Electron source checks and desktop tests pass; a real packaged EXE still needs to be opened on the Windows demo machine.
- Render/TiDB production schema/readiness was intentionally NOT modified in this pass.

## Demo recommendation
Before the demo, on the real Windows machine run:

```bat
npm install
npm --prefix backend install
npm --prefix frontend install
npm run test
npm --prefix frontend run build
```

Then smoke-test one complete Worker -> Manager -> Approve -> Excel flow and open the actual APK/EXE artifacts.

Do not run `npm audit fix --force` before the demo.
