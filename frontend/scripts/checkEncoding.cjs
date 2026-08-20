const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'src');
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.scss', '.html', '.md']);

// These patterns are intentionally specific to common UTF-8 -> Latin-1/Windows-1252
// mojibake. Do not flag legitimate Vietnamese characters such as "ĐÃ".
const MOJIBAKE_PATTERNS = [
  /Ã[\u0080-\u00BF]/g,
  /Â[\u0080-\u00BF]/g,
  /Ä[\u0080-\u00BF]/g,
  /Æ[\u0080-\u00BF]/g,
  /á»/g,
  /áº/g,
  /á¸/g,
  /â€./g,
  /â€™/g,
  /â€œ/g,
  /â€�/g,
  /�/g,
];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'android' || entry.name === 'ios') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(full);
  }
  return files;
}

if (!fs.existsSync(ROOT)) {
  console.error(`[KTC] Encoding guard FAILED: source directory not found: ${ROOT}`);
  process.exit(1);
}

const findings = [];
for (const file of walk(ROOT)) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    findings.push({ file, line: 0, text: `Unable to read as UTF-8: ${error.message}` });
    continue;
  }

  const lines = text.split(/\r?\n/);
  lines.forEach((lineText, index) => {
    for (const pattern of MOJIBAKE_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(lineText)) {
        findings.push({ file, line: index + 1, text: lineText.trim() });
        break;
      }
    }
  });
}

if (findings.length) {
  console.error(`[KTC] Encoding guard FAILED — ${findings.length} possible mojibake occurrence(s):`);
  for (const finding of findings.slice(0, 100)) {
    console.error(` - ${path.relative(path.resolve(__dirname, '..'), finding.file)}:${finding.line} ${finding.text}`);
  }
  if (findings.length > 100) console.error(` - ... and ${findings.length - 100} more`);
  process.exit(1);
}

console.log('[KTC] Encoding guard PASS — no UTF-8 mojibake markers found in frontend/src.');
