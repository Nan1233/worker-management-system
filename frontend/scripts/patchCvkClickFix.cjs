const fs = require('fs');
const path = require('path');
const file = path.resolve(__dirname, '../src/pages/worker/ProcessPage.tsx');
if (!fs.existsSync(file)) process.exit(0);
let page = fs.readFileSync(file, 'utf8');
let changed = false;
if (!page.includes('const cvkMode = new URLSearchParams(location.search).get("cvk") === "1";')) {
  const needle = '    const navigate =\n        useNavigate();';
  if (page.includes(needle)) {
    page = page.replace(needle, '    const location = useLocation();\n    const navigate =\n        useNavigate();\n    const cvkMode = new URLSearchParams(location.search).get("cvk") === "1";');
    changed = true;
  }
}
// Make the CVK button actually toggle the existing ProcessPage mode.
const patterns = [
  [/onClick=\{\(\) => navigate\(([^)]*process[^)]*)\)\}/g, 'onClick={() => navigate(`/worker/process/${process}?cvk=1`)}'],
  [/onClick=\{\(\) => \{\s*navigate\(([^;]+);?\s*\}\}/g, 'onClick={() => navigate(`/worker/process/${process}?cvk=1`)}']
];
// Prefer a targeted replacement for a CVK-labelled button.
page = page.replace(/(<button[^>]*)(>\s*CVK\s*<\/button>)/g, (m, start, end) => {
  if (start.includes('onClick=')) return m.replace(/onClick=\{[^}]*\}/, 'onClick={() => navigate(`/worker/process/${process}?cvk=1`)}');
  changed = true;
  return `${start} onClick={() => navigate(\`/worker/process/${process}?cvk=1\`)}${end}`;
});
// If CVK mode is active, preserve the current page and expose it to the basic-info section.
if (!page.includes('isCvkMode={cvkMode}')) {
  page = page.replace(/<ProcessBasicInfoSection([^>]*?)(\/>|>)/, '<ProcessBasicInfoSection$1 isCvkMode={cvkMode}$2');
  changed = true;
}
if (changed) fs.writeFileSync(file, page);
console.log('[KTC] CVK click/mode patch applied.');
