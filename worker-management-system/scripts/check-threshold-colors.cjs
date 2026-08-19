const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'frontend', 'src', 'pages', 'admin', 'FormulaSettings.css');
const css = fs.readFileSync(file, 'utf8');
const required = [
  '.threshold.red', '.threshold.orange', '.threshold.yellow', '.threshold.green', '.threshold.blue',
  '--threshold-input-bg', '.threshold input:focus', 'html[data-theme="dark"] .threshold.red'
];
for (const token of required) {
  if (!css.includes(token)) throw new Error(`[KTC] Threshold color contract missing: ${token}`);
}
const tail = css.slice(css.indexOf('/* KTC 2026-08-11: keep threshold colour visible'));
if (!/\.threshold input[\s\S]*background:\s*var\(--threshold-input-bg\)\s*!important/.test(tail)) {
  throw new Error('[KTC] Threshold inputs must keep semantic threshold background.');
}
console.log('[KTC] Threshold color contract OK');
