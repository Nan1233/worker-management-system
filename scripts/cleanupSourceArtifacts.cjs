const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const forbiddenExtensions = new Set([
  '.zip', '.apk', '.aab', '.ipa', '.dmg',
  '.bak', '.old', '.orig', '.disabled'
]);

const ignoredDirs = new Set([
  '.git', 'node_modules', 'dist', 'release', 'coverage',
  '.vite', '.cache', '.turbo', 'test-results', 'playwright-report'
]);

const exactFiles = new Set([
  'backend/README.md',
  'backend/build-release.bat',
  'BUILD_AND_COMMIT_STATUS.txt',
  'CLEAN_SOURCE_NOTICE.txt',
  '{',
  '[KTC]',
  'checksum',
  'curl',
  'ervability#Uf022',
  'h origin main',
  'ktc-production-control-desktop@1.5.2',
  'node',
  'set.has(code)',
  'sheet.name)',
  'sheet.state'
]);

const removableNamePatterns = [
  /_CHANGED_FILES.*\.txt$/i
];

const removed = [];

function normalizedRel(abs) {
  return path.relative(root, abs).replaceAll('\\', '/');
}

function removeFile(abs) {
  if (!fs.existsSync(abs)) return;
  const stat = fs.statSync(abs);
  if (!stat.isFile()) return;
  fs.unlinkSync(abs);
  removed.push(normalizedRel(abs));
}

function shouldRemove(abs, entryName) {
  const rel = normalizedRel(abs);
  if (exactFiles.has(rel)) return true;
  if (removableNamePatterns.some((pattern) => pattern.test(entryName))) return true;
  const lowerName = entryName.toLowerCase();
  return lowerName.includes('.bak') || forbiddenExtensions.has(path.extname(lowerName));
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs);
      continue;
    }
    if (entry.isFile() && shouldRemove(abs, entry.name)) removeFile(abs);
  }
}

walk(root);

if (!removed.length) {
  console.log('[KTC] source cleanup: nothing to remove');
} else {
  console.log('[KTC] source cleanup removed:');
  removed.sort().forEach((item) => console.log(` - ${item}`));
}

console.log('[KTC] review with: git status --short');
