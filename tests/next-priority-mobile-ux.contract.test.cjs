const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const readCss = (file) => fs.readFileSync(path.join(root, 'frontend/src', file), 'utf8');
const css = readCss('layouts/WorkerLayout.css');
// touch-action / overscroll / focus-visible / reduced-motion live in the global stylesheets since the UI
// simplification (a75ec154); they apply to the worker layout through body and the shared controls.
const globalCss = ['index.css', 'basic.css', 'reference-ui.css'].map(readCss).join('\n');

test('worker mobile navigation preserves 44px touch targets and safe-area support', () => {
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(globalCss, /body\s*\{[^}]*touch-action:\s*manipulation/);
});

test('worker mobile UI supports keyboard/reduced-motion friendly interaction', () => {
  assert.match(globalCss, /focus-visible/);
  assert.match(globalCss, /prefers-reduced-motion/);
  assert.match(globalCss, /overscroll-behavior-y/);
});


test('manager reports exposes keyboard shortcuts and dashboard summary cache', () => {
  const reports = fs.readFileSync(path.join(root, 'frontend/src/pages/manager/Reports.tsx'), 'utf8');
  const dashboard = fs.readFileSync(path.join(root, 'frontend/src/pages/manager/Dashboard.tsx'), 'utf8');
  assert.match(reports, /Ctrl\/⌘ \+ Enter/);
  assert.match(reports, /event\.key === "Escape"/);
  assert.match(dashboard, /CACHE_TTL_MS = 15_000/);
  assert.match(dashboard, /sessionStorage/);
});
