# KTC CSS Reference UI

This build uses the supplied Poketto reference board as the visual direction, but **does not use Poketto template components**.

## Rules
- UI is implemented with React markup already present in KTC + `src/reference-ui.css`.
- No `PokettoRealTemplateShell` / `PokettoWorkerTemplateShell`.
- No dependency on a Poketto UI template for the application shell.
- Existing routes, APIs, permissions, validation and business logic are preserved.
- `reference-ui.css` is imported last from `App.tsx` so it is the final presentation layer.
- Service-worker cache version was bumped to prevent an older deployed stylesheet from being reused.

## Visual direction
- Blue KTC/Poketto enterprise palette.
- Light workspace background.
- Compact left navigation on desktop.
- White cards with subtle borders/shadows.
- Blue active navigation state.
- KPI cards, filters, tables and action buttons aligned to the supplied reference board.
- Responsive 5-item bottom navigation for mobile.
