# KTC — Real Poketto Stack Template Migration V1

The uploaded Poketto Stack source is now the actual UI foundation, not a CSS imitation.

Integrated verbatim from the uploaded template:
- Sidebar primitives
- Button/Input/Card/Separator/Sheet/Skeleton/Tooltip/ScrollArea primitives
- Template design tokens (`globals.css`)
- Template Tailwind token configuration

KTC-specific integration:
- Worker, Lead, Manager and Admin all use the same real Poketto Sidebar shell.
- Existing KTC React Router routes remain in place.
- Existing auth, API, permissions, business rules and Approve/Reject handlers remain unchanged.
- Login visual structure now uses the real template primitives/tokens while preserving KTC's employee-code/role/password login flow.

Old custom CSS files remain on disk for rollback but are no longer imported by `main.tsx`.
