# KTC Dark Mode Full Audit — 2026-08-11

Phạm vi sửa: visual/theme only. Không thay đổi API, database, Excel calculation hay business flow.

## Các nhóm đã rà và harden
- Global page/background/surface hierarchy.
- Worker topbar/mobile nav/sticky context.
- Worker process form: date/time/number/select/readonly/disabled, multi-machine, deduction, NG/OK, dropdown, duplicate dialog, network state.
- Worker history/detail/profile.
- Autocomplete menu/options.
- Toast states.
- Management sidebar/header/mobile navigation.
- Manager dashboard/reports/selected review/report detail/edit modal.
- Manager workers table/cards/mobile cards.
- Admin formula/master/governance/permissions/system center.
- Download/export page.
- Offline sync card.
- Native date/time/month controls.
- Notification badge border in dark chrome.

## Cache hardening
- Frontend fallback version: 1.8.12.
- PWA cache build version: 1.8.12-dark-theme-full-audit-20260811.

## Files changed
- frontend/src/styles/dark-mode-contrast.css
- frontend/src/pages/worker/Profile.tsx
- frontend/src/config/version.ts
- frontend/public/sw.js

## Build note
`npm run build` reached TypeScript bootstrap but the bundled node_modules in the supplied archive is incomplete and does not contain type definitions for `vite/client` and `node`. This is an environment/dependency issue, not a CSS parser failure. CSS brace sanity check passed.
