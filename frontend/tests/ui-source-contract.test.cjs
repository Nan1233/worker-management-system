const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const srcRoot = path.join(__dirname, '..', 'src');

function walk(dir, extensions) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(full, extensions));
    else if (extensions.some((ext) => entry.name.endsWith(ext))) result.push(full);
  }
  return result;
}

test('frontend has no legacy stacked theme imports', () => {
  const files = walk(srcRoot, ['.ts', '.tsx', '.css']);
  const content = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(content, /ktc-unified-theme|worker-visual-refresh|ktc-balanced-blue/);
});

test('management button classes declared literally in JSX have CSS definitions', () => {
  const jsxFiles = walk(srcRoot, ['.tsx']);
  const css = walk(srcRoot, ['.css']).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const classNames = new Set();
  for (const file of jsxFiles) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/className=["']([^"']*(?:button|btn)[^"']*)["']/g)) {
      for (const name of match[1].split(/\s+/).filter(Boolean)) classNames.add(name);
    }
  }
  const missing = [...classNames].filter((name) => !css.includes(`.${name}`));
  assert.deepEqual(missing, []);
});

test('web API client keeps credentialed requests enabled for HttpOnly refresh cookie', () => {
  const api = fs.readFileSync(path.join(srcRoot, 'services', 'api.ts'), 'utf8');
  assert.match(api, /withCredentials:\s*true/);
});

test('feature pages do not bypass centralized auth storage', () => {
  const files = walk(srcRoot, ['.ts', '.tsx']).filter((file) => !file.endsWith(path.join('utils', 'authStorage.ts')));
  const offenders = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    if (/localStorage\.getItem\(["'](?:user|accessToken|token|refreshToken)["']\)/.test(text)) {
      offenders.push(path.relative(srcRoot, file));
    }
  }
  assert.deepEqual(offenders, []);
});

test('web auth uses HttpOnly-cookie compatible credentialed requests', () => {
  const authStorage = fs.readFileSync(path.join(srcRoot, 'utils', 'authStorage.ts'), 'utf8');
  const api = fs.readFileSync(path.join(srcRoot, 'services', 'api.ts'), 'utf8');
  assert.match(authStorage, /Normal web sessions never persist a JS-readable refresh token/);
  assert.match(api, /withCredentials:\s*true/);
});

test('global UI architecture uses one professional foundation plus a token-only dark theme', () => {
  const main = fs.readFileSync(path.join(srcRoot, 'main.tsx'), 'utf8');
  assert.match(main, /ktc-professional\.css";\nimport "\.\/styles\/dark-mode-contrast\.css"/);
  assert.doesNotMatch(main, /enterprise-responsive|release-polish|pilot-ui-polish|light-contrast-hardening/);
  const dark = fs.readFileSync(path.join(srcRoot, 'styles', 'dark-mode-contrast.css'), 'utf8');
  assert.match(dark, /:root\[data-theme="dark"\]/);
  assert.ok((dark.match(/\{/g) || []).length < 8, 'dark theme should remain token-driven, not selector override driven');
});
