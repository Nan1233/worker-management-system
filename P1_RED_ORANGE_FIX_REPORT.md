# KTC RED + ORANGE FIX REPORT — 2026-08-18

Baseline: KTC_P0_FIXED-2026-08-18.zip / source state aligned with GitHub main at ccc7169.

## RED handled

### 1. Production DB / Render readiness
A read-only production runtime gate was added:
- `scripts/productionRuntimeGate.cjs`
- `npm run audit:production:runtime`
- `P0_RUNTIME_PRODUCTION_CHECK.md`

The gate checks:
- `/api/health/ready` HTTP 200
- `status=ready`
- `schemaReady=true`
- canonical schema contract version 26
- `/api/health` ready
- optional deployed frontend HTML

IMPORTANT: this ZIP cannot directly access your Render/TiDB credentials. Therefore the actual production DB state is NOT claimed as verified. Run the gate on your Windows machine with the production API URL before release.

### 2. Render/web source mismatch
The web deployment is now explicitly built from the canonical `frontend/` tree:
- root `render.yaml` builds `frontend`
- static output is `frontend/dist`
- root package build/check/mobile commands delegate to `frontend`

This removes the previous ambiguity where Render built root source while Desktop/Capacitor used `frontend`.

### 3. Worker/runtime logging hardening
Removed infrastructure host/port details from normal worker/server startup logs.
Sensitive/auth diagnostics are now aggregate-only by default.

`backend/scripts/checkAuthData.js` only prints detailed worker/user records when:
`KTC_DEBUG_AUTH_DATA=true`

Google Sheet and company Excel diagnostic logs are debug-gated.

## ORANGE handled

### 4. Canonical source consolidation
`frontend/` is now the sole canonical web/mobile source tree.

Removed stale root duplicates:
- `src/`
- `public/`
- `android/`
- root Vite/TypeScript/Capacitor config files
- root `index.html`

Root package is now orchestration-only and delegates to `frontend`.

Root contract now fails if these duplicates return.

### 5. Empty source artifacts
Removed:
- empty `tsc`
- empty `npm`
- empty `node`
- four empty unused admin source files

The canonical source contract now rejects empty source files.

### 6. Theme contract drift
Fixed:
- `100vh` -> `100dvh`
- hard-coded white surfaces -> semantic `--ktc-surface`
- translucent white surface -> semantic theme expression

Theme contract now PASS.

### 7. Stale service-worker contract
Updated stale root/frontend contract tests to the actual current service-worker cache namespace:
`1.8.22-manager-ui-v2-20260817`

## Verification performed

PASS:
- root tests: 151/151
- frontend tests: 146/146
- backend source syntax: 153 JS files
- source consistency contract
- release consistency contract
- release gate contract
- dependency release contract
- theme contract
- threshold color contract

Not executed:
- npm install/build/typecheck (ZIP environment has no installed node_modules)
- real Render/TiDB runtime verification
- Android/iOS native artifact builds
- production Excel stress test

No GitHub Actions were invoked.
No GitHub repository was modified by this ZIP operation.
