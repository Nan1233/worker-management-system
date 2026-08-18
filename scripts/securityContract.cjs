#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const ignored = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', 'validation-artifacts', '.gradle']);
const extensions = new Set(['.js','.cjs','.mjs','.ts','.tsx','.json','.yml','.yaml','.properties','.gradle','.xml','.md','.env','.example']);
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /AIza[0-9A-Za-z_-]{30,}/,
  /(?:DB_PASSWORD|JWT_SECRET|KTC_BACKUP_ENCRYPTION_KEY)\s*=\s*[^\s#"']{8,}/i,
  /private_key\s*[:=]\s*["']-----BEGIN PRIVATE KEY-----/i
];
function walk(dir, out=[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (extensions.has(path.extname(entry.name).toLowerCase()) || entry.name === '.env') out.push(full);
  }
  return out;
}
const files = walk(root);
const findings=[];
for (const file of files) {
  if (path.resolve(file) === path.resolve(__filename)) continue;
  const text=fs.readFileSync(file,'utf8');
  const lines=text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed=line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    for (const pattern of secretPatterns) {
      if (pattern.test(line) && !/process\.env\.[A-Z0-9_]+\s*\|\|/i.test(line)) {
        findings.push(path.relative(root,file));
        break;
      }
    }
  }
}
const trackedZip = (()=>{ try{return execFileSync('git',['ls-files'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).split(/\r?\n/).filter(x=>/\.(zip|7z|rar)$/i.test(x));}catch{return [];} })();
if (trackedZip.length) findings.push(...trackedZip.map(x=>`ARCHIVE_TRACKED:${x}`));

const serverPath = path.join(root, 'backend', 'server.js');
const serverSource = fs.readFileSync(serverPath, 'utf8');
if (/cors\(\{[\s\S]*origin:\s*['"]\*['"]/.test(serverSource)) findings.push('CORS_WILDCARD');
if (!/express\.json\(\{\s*limit:/.test(serverSource)) findings.push('JSON_BODY_LIMIT_MISSING');
if (!/parameterLimit:/.test(serverSource)) findings.push('URLENCODED_PARAMETER_LIMIT_MISSING');
if (!/QUERY_STRING_TOO_LONG/.test(serverSource)) findings.push('QUERY_LENGTH_GUARD_MISSING');
if (!/Permissions-Policy/.test(serverSource)) findings.push('PERMISSIONS_POLICY_MISSING');
if (!/disable\(['"]x-powered-by['"]\)/.test(serverSource)) findings.push('X_POWERED_BY_NOT_DISABLED');
if (!/Cache-Control.*private, no-store/.test(serverSource)) findings.push('API_CACHE_CONTROL_MISSING');

if (findings.length) { console.error('KTC_SECURITY_CONTRACT_FAIL'); for(const f of [...new Set(findings)]) console.error(f); process.exit(1); }
console.log(`KTC security contract OK (${files.length} source files scanned)`);
