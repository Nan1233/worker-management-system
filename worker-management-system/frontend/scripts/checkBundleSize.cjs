const fs = require('node:fs');
const path = require('node:path');

const distDir = path.join(__dirname, '..', 'dist');
const assetDir = path.join(distDir, 'assets');
const maxSingleJsBytes = Number(process.env.KTC_MAX_SINGLE_JS_KB || 1800) * 1024;
const maxTotalJsBytes = Number(process.env.KTC_MAX_TOTAL_JS_KB || 3500) * 1024;

if (!fs.existsSync(assetDir)) {
  console.error('Bundle size check failed: frontend/dist/assets does not exist.');
  process.exit(1);
}

const jsFiles = fs.readdirSync(assetDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => {
    const fullPath = path.join(assetDir, name);
    return { name, size: fs.statSync(fullPath).size };
  });

const total = jsFiles.reduce((sum, file) => sum + file.size, 0);
const oversized = jsFiles.filter((file) => file.size > maxSingleJsBytes);

console.log(`Frontend JS bundle: ${(total / 1024).toFixed(1)} KB across ${jsFiles.length} file(s).`);
for (const file of jsFiles.sort((a, b) => b.size - a.size).slice(0, 8)) {
  console.log(` - ${file.name}: ${(file.size / 1024).toFixed(1)} KB`);
}

if (oversized.length || total > maxTotalJsBytes) {
  if (oversized.length) {
    console.error(`Single JS chunk exceeds ${Math.round(maxSingleJsBytes / 1024)} KB: ${oversized.map((f) => f.name).join(', ')}`);
  }
  if (total > maxTotalJsBytes) {
    console.error(`Total JS exceeds ${Math.round(maxTotalJsBytes / 1024)} KB.`);
  }
  process.exit(1);
}
