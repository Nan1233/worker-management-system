'use strict';

// Read-only repository audit. Run from the repository root:
//   node scripts/auditRepositoryFiles.cjs
//   node scripts/auditRepositoryFiles.cjs --json
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const excluded = new Set(['.git', 'node_modules', 'dist', 'build', '.gradle', '.wrangler', 'coverage', 'playwright-report', 'test-results']);
const sourceExt = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.json', '.css', '.scss']);
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!excluded.has(entry.name)) walk(path.join(dir, entry.name));
    } else if (entry.isFile()) files.push(path.join(dir, entry.name));
  }
}
walk(root);
const relative = file => path.relative(root, file).replace(/\\/g, '/');
const all = new Set(files.map(relative));
// Static import analysis is a review aid, not a deletion oracle.
const imports = new Map();
const inbound = new Map();
const unresolved = [];
const dynamic = [];
const extensions = ['', '.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.json', '.css', '/index.js', '/index.ts', '/index.tsx', '/index.cjs'];
const patterns = [
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s+(?:[^;\n]*?\s+from\s+)?['"]([^'"\n]+)['"]/g,
  /\bexport\s+(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];
for (const file of files) {
  if (!sourceExt.has(path.extname(file))) continue;
  const rel = relative(file);
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
  const dependencies = new Set();
  for (const re of patterns) {
    re.lastIndex = 0;
    for (const match of text.matchAll(re)) {
      const spec = match[1];
      if (!spec.startsWith('.')) continue;
      const base = relative(path.resolve(path.dirname(file), spec));
      const resolved = extensions.map(ext => base + ext).find(candidate => all.has(candidate));
      if (resolved) {
        dependencies.add(resolved);
        if (!inbound.has(resolved)) inbound.set(resolved, []);
        inbound.get(resolved).push(rel);
      } else unresolved.push({ file: rel, spec });
    }
  }
  if (/require\s*\(\s*(?!['"])/.test(text) || /import\s*\(\s*(?!['"])/.test(text)) dynamic.push(rel);
  imports.set(rel, [...dependencies].sort());
}
const hashes = new Map();
for (const file of files) {
  const stat = fs.statSync(file);
  if (stat.size < 1024) continue;
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (!hashes.has(hash)) hashes.set(hash, []);
  hashes.get(hash).push(relative(file));
}
const duplicates = [...hashes.values()].filter(group => group.length > 1).sort((a,b) => b.length-a.length);
// Separate same-folder copies (actionable) from independently packaged deployment assets.
const withinDirectoryDuplicates = duplicates.filter(group => {
  const dirs = group.map(file => path.posix.dirname(file));
  return new Set(dirs).size < dirs.length;
});
const crossDirectoryDuplicates = duplicates.filter(group => new Set(group.map(file => path.posix.dirname(file))).size > 1);
const versioned = files.map(relative).filter(f => /(?:^|[._-])v\d+(?:[._-]|$)/i.test(path.basename(f)));
const noStaticInbound = [...imports.keys()].filter(f => !(inbound.get(f) || []).length).sort();
const result = {
  note: 'Static analysis only. No-static-inbound does NOT imply unused: entrypoints, dynamic imports, scripts, package.json, native assets and runtime lookup are not resolved.',
  files: files.length, analyzedSourceFiles: imports.size,
  versioned, duplicates, withinDirectoryDuplicates, crossDirectoryDuplicates, unresolved, dynamic,
  noStaticInbound,
};
if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
else {
  console.log('Files:', result.files, 'Source files:', result.analyzedSourceFiles);
  console.log('Versioned filenames:', versioned.length, 'Exact duplicate groups:', duplicates.length);
  console.log('Same-directory duplicate groups:', withinDirectoryDuplicates.length,
    'Cross-directory duplicate groups:', crossDirectoryDuplicates.length, '(verify deployment ownership)');
  console.log('Unresolved relative imports:', unresolved.length, 'Dynamic import candidates:', dynamic.length);
  console.log('Files without static inbound references:', noStaticInbound.length, '(NOT safe-to-delete list)');
  console.log('Run with --json for details.');
}
