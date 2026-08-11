const fs = require('node:fs');
const path = require('node:path');
const pkg = require('../package.json');

const sharedSource = path.resolve(__dirname, '../../shared/excelSyncContract.cjs');
if (!fs.existsSync(sharedSource)) {
  throw new Error(`[KTC] Thiếu shared Excel sync contract: ${sharedSource}`);
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

const runtimeConsumers = [
  path.resolve(__dirname, '../electron/monthlyWorkbookLocal.cjs'),
  path.resolve(__dirname, '../electron/excelDbSync.cjs')
];
for (const file of runtimeConsumers) {
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes("require('../../shared/excelSyncContract.cjs')")) {
    throw new Error(`[KTC] Runtime consumer không còn dùng shared contract chuẩn: ${file}`);
  }
}

console.log('[KTC] Packaged shared Excel contract check OK');
