# KTC Worker — Poketto Stack template migration

This release uses actual Poketto Stack UI source, not a CSS-only imitation.

## Vendored template components
- `src/components/poketto/ui/sidebar.tsx`
- `src/components/poketto/ui/button.tsx`
- `src/components/poketto/ui/input.tsx`
- `src/components/poketto/ui/separator.tsx`
- `src/components/poketto/ui/sheet.tsx`
- `src/components/poketto/ui/skeleton.tsx`
- `src/components/poketto/ui/tooltip.tsx`
- `src/poketto-globals.css`

The Worker shell is implemented in `src/layouts/PokettoWorkerTemplateShell.tsx`.

## Business logic
Existing KTC routes, API services, production submission logic, auth, permissions, Approve/Reject and backend code are intentionally untouched.

## Install/build
Run from `frontend`:
`npm install`
`npm run build`

The template uses Tailwind CSS 3.4/PostCSS in this integration.
