# KTC — Giai đoạn 9/10: Windows release readiness and CI backlog

Date: 2026-11-19. Branch `refactor/ktc-local-cleanup`. No merge, deploy, signing keys, TiDB or NAS writes.

## Executed

- Reviewed GitHub Actions run history: phase 6 and 7 source SHA runs were cancelled; phase 8 latest source SHA run was pending at the time of review. Do not count cancelled/pending runs as green.
- Extended `.github/workflows/phase2-consolidated-safe.yml` Windows job with Node contract tests for `release-signing.test.cjs`, `setup-auto-update.test.cjs`, `portable-upgrade-safety.test.cjs`, and `deployment-profile.test.cjs`.
- Added syntax checks for `checkWindowsSigning.cjs`, `verifyWindowsRelease.cjs` and `deviceSmoke.cjs`.
- Registered the added contract test files in workflow path filters.
- Existing Windows job still runs synthetic XLSX import/export, packaging source contract and shared contract checks; it does **not** produce a signed NSIS installer or install it on a real Windows device.

## Release decision

This is a source-level Windows readiness extension, **not a release**. No certificate or production signing is attempted. A green run for the source SHA must be observed before declaring these tests passed.

Before D-18 can be PASS, build NSIS + portable artifacts in a controlled Windows environment, verify signature and release manifest, test installation/uninstallation, app launch, authentication, Excel import/export with disposable data, update and rollback on a real device. D-19 still needs end-to-end Excel preview and TiDB CAS. Other D-IDs unchanged: 8 PASS, 11 PARTIAL, 1 OPEN, including D-07 OPEN. Production release NOT APPROVED.
