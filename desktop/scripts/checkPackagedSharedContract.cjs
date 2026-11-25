const fs = require('node:fs');
const path = require('node:path');
const pkg = require('../package.json');

const sharedSource = path.resolve(__dirname, '../../shared/excelSyncContract.cjs');
if (!fs.existsSync(sharedSource)) {
  throw new Error(`[KTC] Thiếu shared Excel sync contract: ${sharedSource}`);
}
const outputCalculationSource = path.resolve(__dirname, '../../shared/productionOutput.cjs');
if (!fs.existsSync(outputCalculationSource)) {
  throw new Error('[KTC] Thiếu shared production output calculation contract.');
}

const entries = Array.isArray(pkg?.build?.extraResources) ? pkg.build.extraResources : [];
const hasSharedContract = entries.some((entry) => {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.from !== '../shared' || entry.to !== 'shared') return false;
  const filter = Array.isArray(entry.filter) ? entry.filter : [];
  return filter.includes('excelSyncContract.cjs') || filter.includes('**/*');
});

if (!hasSharedContract) {
  throw new Error('[KTC] electron-builder phải đóng gói ../shared/excelSyncContract.cjs vào resources/shared.');
}

const splitSource = path.resolve(__dirname, '../../shared/gcSplitReconciliation.cjs');
if (!fs.existsSync(splitSource) || !entries.some(entry => entry?.from === '../shared'
    && entry.to === 'shared' && (entry.filter?.includes('gcSplitReconciliation.cjs') || entry.filter?.includes('**/*')))) {
  throw new Error('[KTC] Thiếu shared GC split reconciliation trong resources/shared.');
}

for (const name of ['productionMetricPrimitives.cjs','monthlyExcelContract.cjs','excelStyleClone.cjs']) {
  if (!fs.existsSync(path.resolve(__dirname, '../../shared', name))
      || !entries.some(entry => entry?.from === '../shared' && entry.to === 'shared'
        && (entry.filter?.includes(name) || entry.filter?.includes('**/*')))) {
    throw new Error('[KTC] Thiếu module đóng gói: '+name);
  }
}
const runtimeConsumers = [
  path.resolve(__dirname, '../electron/monthlyWorkbookLocal.cjs'),
  path.resolve(__dirname, '../electron/excelDbSync.cjs')
];
for (const file of runtimeConsumers) {
  const source = fs.readFileSync(file, 'utf8');
  if (!/require\s*\(\s*(?:['"]\.\.\/\.\.\/shared\/excelSyncContract\.cjs['"]|[\s\S]*?['"]\.\.\/\.\.\/shared\/excelSyncContract\.cjs['"])\s*\)/.test(source)) {
    throw new Error(`[KTC] Runtime consumer không còn dùng shared contract chuẩn: ${file}`);
  }
}



console.log('[KTC] Packaged shared Excel contract check OK');
