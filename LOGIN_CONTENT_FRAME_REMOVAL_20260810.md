# Login content frame removal — 2026-08-10

Removed the visual card/frame around the whole login content area.

Changed behavior:
- `.login-card` is transparent.
- No outer border.
- No outer border radius.
- No outer box shadow.
- No clipping (`overflow: visible`).
- Inner controls keep their own borders/backgrounds for readability.

Files changed:
- `frontend/src/pages/Login.css`
- `frontend/src/styles/dark-mode-contrast.css`
