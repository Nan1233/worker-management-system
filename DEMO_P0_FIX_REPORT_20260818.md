# KTC Demo P0 Fix — 2026-08-18

## Fixed
1. Fixed `frontend/src/routes/AppRouter.tsx` TypeScript/JSX syntax error at the role-based report edit route.
2. Confirmed the duplicate root Android tree is already absent in this supplied source; canonical Android tree is `frontend/android`.
3. Confirmed stale `PermissionRoute*.bak_*` files are absent from the supplied source.
4. Confirmed `/admin/master` and `/manager/master` fallback routes target `master/processes`.

## Verification
- The previous Render failure was `TS1109` at `AppRouter.tsx(85,218/219)`.
- The offending route expression was corrected.
- A local `npm run build` was attempted. The source syntax error is no longer the reported error; the build environment then stopped at missing TypeScript definitions (`vite/client`, `node`) because dependency installation could not complete in this execution environment.
- No Render/TiDB configuration or production schema was changed.

## Important
This ZIP is the full supplied source with the local code fix applied. `node_modules`, `dist`, and other generated dependency/build directories are intentionally excluded.

## Commit
Use this after reviewing/testing the ZIP:

    git add -A
    git commit -m "fix(demo): resolve web routing and cross-platform demo blockers"
    git push origin main
