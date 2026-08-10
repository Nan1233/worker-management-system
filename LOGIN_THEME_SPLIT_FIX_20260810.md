# KTC Login Theme Split Fix — 2026-08-10

## Symptom
Dark mode showed the login card in dark colors while the whole right login panel stayed white.

## Root cause
`frontend/src/pages/Login.css` is loaded with the lazy Login route and has a hard-coded `.login-panel { background: #fdfefe; }`. The global dark theme styled `.login-card` but did not explicitly override `.login-panel`, producing a split-theme screen.

## Fix
Updated `frontend/src/styles/dark-mode-contrast.css` with explicit theme-scoped login rules:
- dark `.login-page` / `.login-panel` use the dark app background;
- dark login card uses a lighter surface with stronger border/shadow;
- remembered account, input, helper text and focus states have clear contrast;
- explicit light-mode guards keep the login panel/card light.

No business logic, API, database or Excel logic changed.
