const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', 'cloudflare-worker.js');
let source = fs.readFileSync(file, 'utf8');

const broken = 'const deductionNames = [...new Set(normalizedDeductions.map((item) => String(item?.deduction_name || "").trim()).filter(Boolean)];';
const fixed = 'const deductionNames = [...new Set(normalizedDeductions.map((item) => String(item?.deduction_name || "").trim()).filter(Boolean))];';

if (source.includes(broken)) {
  source = source.replace(broken, fixed);
  fs.writeFileSync(file, source, 'utf8');
  console.log('[KTC] Fixed cloudflare-worker.js deductionNames syntax');
} else {
  console.log('[KTC] Cloudflare worker syntax patch not needed');
}
