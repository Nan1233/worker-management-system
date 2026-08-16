'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MAX_BYTES = 50 * 1024 * 1024;
const ZERO_BYTE_ALLOWED = new Set([]);
const FORBIDDEN = [
  /(^|\/)node_modules(\/|$)/i,
  /(^|\/)release(\/|$)/i,
  /(^|\/)dist(\/|$)/i,
  /(^|\/)coverage(\/|$)/i,
  /(^|\/)electron\.exe$/i,
  /\.(exe|msi|msix|appx|dmg|appimage|deb|rpm|blockmap|zip|7z|rar)$/i
];

function git(args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function hasGitRepository() {
  return fs.existsSync(path.join(ROOT, '.git'));
}

function readIndexEntries() {
  const output = git(['ls-files', '-s', '-z']);
  if (!output) return [];

  return output.split('\0').filter(Boolean).map((line) => {
    const match = line.match(/^(\d+)\s+([0-9a-f]+)\s+(\d+)\t(.+)$/i);
    if (!match) throw new Error(`Không đọc được Git index: ${line}`);
    return { hash: match[2], stage: Number(match[3]), file: match[4] };
  }).filter((item) => item.stage === 0);
}

function objectSize(hash) {
  return Number(git(['cat-file', '-s', hash]).trim());
}

function main() {
  if (!hasGitRepository()) {
    console.log('[KTC] Repository guard skipped: chưa có thư mục .git.');
    return;
  }

  const entries = readIndexEntries();
  const forbidden = [];
  const oversized = [];
  const emptySourceFiles = [];

  for (const entry of entries) {
    const normalized = entry.file.replaceAll('\\', '/');
    if (FORBIDDEN.some((rule) => rule.test(normalized))) forbidden.push(normalized);

    const size = objectSize(entry.hash);
    if (size > MAX_BYTES) oversized.push({ file: normalized, size });

    // Empty source modules are almost always accidental artifacts. Keep an
    // explicit allow-list so intentional marker files remain possible.
    const sourceLike = /\.(js|cjs|mjs|ts|tsx|css|json)$/i.test(normalized);
    if (size === 0 && sourceLike && !ZERO_BYTE_ALLOWED.has(normalized)) {
      emptySourceFiles.push(normalized);
    }
  }

  if (forbidden.length) {
    console.error('\n[KTC] Commit bị chặn vì Git đang theo dõi file sinh tự động:');
    forbidden.forEach((file) => console.error(`  - ${file}`));
  }

  if (oversized.length) {
    console.error('\n[KTC] Commit bị chặn vì có file lớn hơn 50 MB:');
    oversized.forEach(({ file, size }) => {
      console.error(`  - ${file}: ${(size / 1024 / 1024).toFixed(2)} MB`);
    });
  }

  if (emptySourceFiles.length) {
    console.error('\n[KTC] Commit bị chặn vì có source file rỗng:');
    emptySourceFiles.forEach((file) => console.error(`  - ${file}`));
  }

  if (forbidden.length || oversized.length || emptySourceFiles.length) {
    console.error('\nChạy: git rm -r --cached . && git add .');
    process.exit(1);
  }

  console.log(`[KTC] Repository guard OK: ${entries.length} tracked files.`);
}

try {
  main();
} catch (error) {
  console.error('[KTC] Repository guard failed:', error.message || error);
  process.exit(1);
}
