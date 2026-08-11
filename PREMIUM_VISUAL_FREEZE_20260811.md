# KTC Premium Visual Freeze — 2026-08-11

## Scope
Visual-only FE hardening. No API, database, Excel calculation, permission, authentication or production business logic was changed.

## Premium pass
- Refined light palette to a softer enterprise neutral hierarchy.
- Raised surface/radius/elevation system without adding decorative gradients to operational pages.
- Reworked visual hierarchy so nested sections read as sections instead of stacked cards.
- Premium typography rhythm, numeric alignment and tighter heading hierarchy.
- Unified input hover/focus/readonly/disabled treatment.
- Unified table header/row/hover/focus hierarchy.
- Refined button elevation and primary/secondary emphasis.
- Refined management/worker navigation chrome.
- Refined dashboard KPI depth and hover behavior.
- Refined modal/autocomplete/toast/offline floating surfaces.
- Refined empty/loading states.
- Worker production form receives the strongest operational hierarchy.
- Login remains borderless/cardless on the content side, with a more restrained showcase palette.
- Dark mode receives matching elevation depth without reducing contrast.
- Reduced-motion remains supported.

## Release
- frontend: 1.8.14
- PWA cache: 1.8.14-premium-freeze-20260811

## Verification completed in packaging environment
- `npm --prefix frontend run check:theme`: PASS
- `npm --prefix frontend test`: 30/30 PASS
- CSS brace balance: PASS

Full TypeScript/Vite build should still be run on the target workstation after dependency installation.
