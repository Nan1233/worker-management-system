# KTC — Poketto UI Source of Truth

- The UI primitive source is copied from `poketto-stack-main/packages/ui/src/components/ui`.
- The same template primitives replace the prior hand-written KTC Poketto primitives under `src/components/poketto/ui`.
- Worker and management shells consume these primitives.
- Legacy KTC CSS imports were removed from application/page TypeScript entry points.
- `src/poketto-globals.css` now contains Poketto's theme tokens adapted for Tailwind CSS v4.
- Business logic, API calls, validation, permissions and workflow code were not intentionally changed by this UI migration.

Build verification must be run on the user's Windows checkout with `npm install` then `npm run build`.
