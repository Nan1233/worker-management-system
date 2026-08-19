# KTC Worker UI / Time Fix — 2026-08-17

## UI
- Desktop uses a centered 1180px enterprise workspace on a full-bleed background.
- Mobile remains full-width.
- Machine/product fields are side-by-side on desktop and stacked on mobile.
- Time controls are compact and use three clear metrics.
- Sticky context is click-through except for its actual controls.
- Autocomplete menus are above the form stacking context.

## Time semantics
- `actualHours` / `actualMinutes` are the entered gross total working duration.
- `totalTime` stores that gross duration.
- `deductionTime` stores the deduction duration.
- `actualTime = totalTime - deductionTime`.
- Gross total duration remains capped at 12 hours.
- The UI now labels these values consistently to avoid the previous contradiction.

## Click safety
- Worker form and controls explicitly restore pointer/touch interaction.
- Decorative/sticky context layers cannot act as an invisible click shield.
