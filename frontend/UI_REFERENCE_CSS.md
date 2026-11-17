# KTC Industrial Minimal — Design System v1

## Direction
An independent, KTC-branded production interface: navy headings, restrained blue actions, neutral surfaces, meaningful status colors. Avoid unnecessary gradients, shadow layers, miniature typography and decorative UI.

## Roles
- **Worker — mobile-first:** 320–800px, readable text (16px on text inputs), generous touch targets (at least 44px on primary controls), four-item navigation, single-column forms where needed, safe-area-aware bottom spacing.
- **Manager / Lead / Admin — desktop-first:** 801px and up, readable sidebar labels, aligned filters, clear tables, compact but legible density and contextual charts. Responsive behavior at laptop widths.
- **Accessibility:** focus-visible indicator, reduced-motion support, no color-only status communication; dark theme contrast must be retained.

## Source of truth
- `src/reference-ui.css`: legacy-compatible design tokens and base styles.
- `src/styles/KtcIndustrialMinimal.css`: role-scoped KTC design layer, imported after legacy styles from `src/App.tsx`.
- Route-specific CSS still owns individual form field geometry, table columns, popup behavior and critical positioning. Do not hide table columns or change worker submission mechanics in the theme layer.

## Historical note
An earlier visual direction was documented as a Poketto reference board. KTC now uses its own branded design direction; this change does **not** claim the old reference was never used. No external Poketto template components are integrated here.

## Safe change scope and release checklist
- Visual CSS only; preserve endpoints, roles, validation, production calculations, browser/mobile offline storage, TiDB, and Electron/Excel exports.
- Test worker home, select process, each report form (especially GC multi-machine), history and submission at 320/375/390/430px on real touch devices.
- Test manager sidebar, pending/approved filters, row actions and tables at 1024/1280/1440/1920px, with browser zoom 100% and 125%.
- Check both light and dark themes, keyboard focus, long Vietnamese labels and empty/error/loading states.
- Run frontend lint/typecheck/tests and mobile/management visual regressions before shipping.
- Do not deploy a changed frontend to an EXE package without a separate desktop compatibility check.

## Cleanup roadmap
1. Confirm the design baseline by visual regression.
2. Consolidate duplicate styles from `ManagementNavigation.css`, worker page typography overrides and report filter patches into component-owned CSS.
3. Remove obsolete `!important` declarations **after** screenshot comparisons; avoid mass deletion that might break layouts.
