'use strict';

// Read-only repository audit. Run from the repository root:
//   node scripts/auditRepositoryFiles.cjs
//   node scripts/auditRepositoryFiles.cjs --json
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync}=require('node:child_process');

const root = path.resolve(__dirname, '..');
const sourceExt = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.json', '.css', '.scss']);
const files = [];
// Prefer tracked files, including small compatibility shims and assets.
// Do not scan local secrets, caches, build products or untracked workbooks.
try {
  const tracked=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024}).split('\0').filter(Boolean);
  for(const name of tracked){const file=path.join(root,name);if(fs.existsSync(file)&&fs.lstatSync(file).isFile()&&!fs.lstatSync(file).isSymbolicLink())files.push(file);}
} catch {
  // A source archive cannot distinguish tracked files from local secrets.
  // Fail closed rather than scanning untracked credentials or workbooks.
  throw new Error('Repository audit requires git ls-files; use a Git checkout.');
}
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
      const candidates = extensions.map(ext => base + ext);
      // TypeScript ESM imports may spell the emitted JavaScript extension.
      if (base.endsWith('.js')) candidates.push(base.slice(0,-3)+'.ts',base.slice(0,-3)+'.tsx');
      if (base.endsWith('.mjs')) candidates.push(base.slice(0,-4)+'.mts');
      if (base.endsWith('.cjs')) candidates.push(base.slice(0,-4)+'.cts');
      const resolved = candidates.find(candidate => all.has(candidate));
      if (resolved) {
        dependencies.add(resolved);
        if (!inbound.has(resolved)) inbound.set(resolved, []);
        inbound.get(resolved).push(rel);
      } else unresolved.push({ file: rel, spec });
    }
  }
  if ([...text.matchAll(/\b(?:require|import)\s*\(([^\n]*)/g)].some(match=>!/^['"]/.test(match[1].trimStart()))) dynamic.push(rel);
  imports.set(rel, [...dependencies].sort());
}
const hashes = new Map();
for (const file of files) {
  const stat = fs.statSync(file);
  if (stat.size === 0) continue;
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
// Explicit runtime references from package scripts and workflows are separate
// from imports. A basename match is only an advisory candidate.
const manifestRefs=new Map();
const manifests=files.filter(file=>/(?:^|\/)(?:package\.json|wrangler\.(?:toml|jsonc?)|[^/]+\.ya?ml)$/.test(relative(file)));
for(const file of manifests){
  const contents=fs.readFileSync(file,'utf8');
  const rel=relative(file);
  for(const candidate of noStaticInbound){
    if(contents.includes(candidate)||contents.includes(path.posix.basename(candidate))){
      if(!manifestRefs.has(candidate))manifestRefs.set(candidate,[]);
      manifestRefs.get(candidate).push(rel);
    }
  }
}
const result = {
  note: 'Static analysis only. No-static-inbound does NOT imply unused: entrypoints, dynamic imports, scripts, package.json, native assets and runtime lookup are not resolved.',
  files: files.length, analyzedSourceFiles: imports.size,
  versioned, duplicates, withinDirectoryDuplicates, crossDirectoryDuplicates, unresolved, dynamic,
  noStaticInbound,
  manifestReferences:Object.fromEntries(manifestRefs),
  reviewCandidates:noStaticInbound.filter(file=>!manifestRefs.has(file)),
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
