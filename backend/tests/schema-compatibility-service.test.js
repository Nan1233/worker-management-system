const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const servicesDir = path.resolve(__dirname, '../services');
const processExportPath = path.join(servicesDir, 'processExcelExportService.js');
const compatibilityPath = path.join(servicesDir, 'schemaCompatibilityService.js');

test('schema compatibility service exists for process Excel export', () => {
  assert.equal(fs.existsSync(compatibilityPath), true, 'schemaCompatibilityService.js phải có trong source deploy');
  const exporter = fs.readFileSync(processExportPath, 'utf8');
  const compatibility = fs.readFileSync(compatibilityPath, 'utf8');
  assert.match(exporter, /require\(['"]\.\/schemaCompatibilityService['"]\)/);
  assert.match(compatibility, /async function hasColumn\(tableName, columnName\)/);
  assert.match(compatibility, /INFORMATION_SCHEMA\.COLUMNS/);
  assert.match(compatibility, /TABLE_SCHEMA = DATABASE\(\)/);
});

test('backend relative requires resolve to files in the deploy source', () => {
  const backendRoot = path.resolve(__dirname, '..');
  const missing = [];
  const extensions = new Set(['.js', '.cjs']);

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (extensions.has(path.extname(entry.name))) {
        const source = fs.readFileSync(full, 'utf8');
        for (const match of source.matchAll(/require\(['"](\.{1,2}\/[^'"]+)['"]\)/g)) {
          const requested = path.resolve(path.dirname(full), match[1]);
          const candidates = [
            requested,
            `${requested}.js`,
            `${requested}.cjs`,
            `${requested}.json`,
            path.join(requested, 'index.js'),
            path.join(requested, 'index.cjs')
          ];
          if (!candidates.some((candidate) => fs.existsSync(candidate))) {
            missing.push(`${path.relative(backendRoot, full)} -> ${match[1]}`);
          }
        }
      }
    }
  };

  walk(backendRoot);
  assert.deepEqual(missing, [], `Thiếu module nội bộ:\n${missing.join('\n')}`);
});
