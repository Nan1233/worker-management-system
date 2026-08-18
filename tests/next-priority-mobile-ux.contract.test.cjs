const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'frontend/src/layouts/WorkerLayout.css'), 'utf8');

test('worker mobile navigation preserves 44px touch targets and safe-area support', () => {
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /touch-action:\s*manipulation/);
});

test('worker mobile UI supports keyboard/reduced-motion friendly interaction', () => {
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /overscroll-behavior-y/);
});
