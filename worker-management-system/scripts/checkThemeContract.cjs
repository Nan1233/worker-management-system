const fs = require('fs');
const path = require('path');

const srcRoot = path.resolve(__dirname, '..', 'frontend', 'src');
const allowedDecorativeFiles = new Set([
  path.join(srcRoot, 'pages', 'Login.css'),
  path.join(srcRoot, 'styles', 'ktc-professional.css'),
  path.join(srcRoot, 'styles', 'dark-mode-contrast.css'),
]);

const violations = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith('.css')) check(full);
  }
}
function check(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (/min-height\s*:\s*100vh\b/i.test(line)) {
      violations.push(`${path.relative(srcRoot, file)}:${idx + 1} dùng 100vh; hãy dùng 100dvh.`);
    }
    if (!allowedDecorativeFiles.has(file) && /background(?:-color)?\s*:\s*(?:#fff\b|#ffffff\b|rgba\(255\s*,\s*255\s*,\s*255)/i.test(line)) {
      violations.push(`${path.relative(srcRoot, file)}:${idx + 1} hard-code nền trắng; hãy dùng semantic theme token.`);
    }
  });
}

walk(srcRoot);
if (violations.length) {
  console.error('[KTC] Theme contract FAILED');
  for (const item of violations) console.error(' - ' + item);
  process.exit(1);
}
console.log('[KTC] Theme contract OK: không có nền trắng hard-code ngoài vùng trang trí cho phép, không còn min-height:100vh.');
