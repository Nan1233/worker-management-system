# UI layout + contrast fix — 2026-08-11

- Fixed worker shift radio controls being stretched by the global 44px control min-height.
- Worker pages now occupy the full viewport width; only the inner form shell is constrained. This removes the white gutters on wide desktop screens.
- Increased light-mode workspace/card/input contrast on the worker production form.
- Fixed malformed CSS declarations such as `var(--ktc-surface)fff` that made some backgrounds silently invalid.
- Added explicit workspace tokens for light/dark themes.
- Frontend/cache version bumped to 1.8.16.
- No API, DB, validation, calculation, approval, Excel, or routing behavior changed.
