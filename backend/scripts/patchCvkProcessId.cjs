const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const replaceOnce = (file, replacements) => {
  const full = path.join(root, file);
  let text = fs.readFileSync(full, 'utf8');
  let changed = false;
  for (const [from, to] of replacements) {
    if (text.includes(from)) {
      const next = text.replace(from, to);
      changed = changed || next !== text;
      text = next;
    }
  }
  if (changed) fs.writeFileSync(full, text);
  return changed;
};

// TiDB's real CVK process row is id=30002. Keep legacy 60006 accepted at the
// API boundary, but never rewrite a valid CVK report back to the old id.
replaceOnce('models/productionTempModel.js', [
  [
    'if (Number(data.process_id) === 60006 || processCode === "CVK") {\n        data.process_id = 60006; data.process_code = "CVK";',
    'if (Number(data.process_id) === 60006 || Number(data.process_id) === 30002 || processCode === "CVK") {\n        data.process_id = 30002; data.process_code = "CVK";'
  ]
]);

// Treat the real DB CVK id as non-product work in the request validator.
replaceOnce('utils/reportValidation.js', [
  [
    'const isNonProductWork = Number(payload.process_id) === 60006 ||',
    'const isNonProductWork = Number(payload.process_id) === 60006 || Number(payload.process_id) === 30002 ||'
  ]
]);

// CVK deduction/quality endpoints must also recognize the real process id.
replaceOnce('controllers/deductionController.js', [
  ['const isCVK = processId === 60006;', 'const isCVK = processId === 60006 || processId === 30002;']
]);

// Manager/Lead temp-report visibility must include the real CVK process id.
replaceOnce('models/productionTempReadModel.js', [
  ['(pr.process_id = 60006 OR EXISTS (', '(pr.process_id IN (60006, 30002) OR EXISTS (']
]);

console.log('[KTC] CVK real process id patch applied: 30002 (legacy 60006 accepted).');
