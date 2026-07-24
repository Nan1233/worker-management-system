# KTC Frontend - Render Bandwidth Optimization

## Changes

- Service worker changed to true cache-first for JS, CSS, images and fonts.
- API requests are never cached by the service worker.
- Navigation remains network-first with offline fallback.
- Service-worker update checks reduced from every 1 hour to every 6 hours.
- Route-level lazy loading added for admin, lead, manager, worker and system pages.
- Render cache headers added through `render.yaml`.
- Old duplicate nested `frontend/` directory removed.
- Old `dist/` output removed. Render should build a fresh `dist` directory.

## Render settings

When using the Render dashboard manually:

- Build command: `npm ci && npm run build`
- Publish directory: `dist`

The included `render.yaml` applies equivalent settings and cache headers.

## Verify before deploy

```bash
npm ci
npm run lint
npm run build
```

## After first deploy

For devices that used the previous PWA version:

1. Open DevTools > Application > Service Workers.
2. Unregister the old worker once, or close and reopen the installed PWA.
3. Clear site data once if an old bundle remains.
4. Reload the application.

The new cache version is `ktc-pwa-v1.0.2`.
