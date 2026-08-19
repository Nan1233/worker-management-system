# KTC interaction hardening — 2026-08-17

Fixed a regression where pages could become visually present but controls were not clickable.

Changes:
- removed blanket `pointer-events:auto` from every Worker descendant;
- added a root-level interaction contract for buttons, links, inputs, selects, textareas and role=button;
- decorative overlays/icons are explicitly click-through;
- Worker/Management content remains interactive;
- sticky Worker context is click-through except for its real controls.

This is intentionally separate from business logic and does not alter API/database behavior.
