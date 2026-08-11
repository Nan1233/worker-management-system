# KTC UX Optimization Freeze — 2026-08-11

Final conservative UX pass before FE freeze.

## Changes
- Validate local form fields before network check so workers receive immediate feedback.
- Focus/scroll toward the most likely invalid field after validation failure.
- Preserve progressive disclosure while showing NG and deduction summaries when collapsed.
- Add clear save-state copy and a larger `Lưu báo cáo` CTA.
- Add confirmation before `Làm mới` discards entered production data.
- Surface pending reports as the manager's primary next action.
- Make the pending KPI keyboard-accessible/clickable and show the pending count in quick actions.
- Keep all production rules, APIs, DB contracts and Excel behavior unchanged.
- Frontend version: 1.8.15; PWA cache: 1.8.15-ux-freeze-20260811.
