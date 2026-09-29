const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '../src/pages/worker/components/ProcessBasicInfoSection.tsx');
let source = fs.readFileSync(file, 'utf8');

// All CVK patches touch the same JSX row. Normalize the final source AFTER
// every previous CVK patch has run, so an older patch cannot leave a second
// "Công việc khác" label/button behind.
const rowPattern = /<div className="worker-choice-row(?: worker-operation-type-row)?">[\s\S]*?(?:handleCvkSelect\(\)|handleOperationTypeChange\("CVK"\))[\s\S]*?<\/div>/;
const rowMatch = source.match(rowPattern);

if (rowMatch) {
  const row = rowMatch[0];
  const usesIsCvkMode = source.includes('isCvkMode') && source.includes('handleCvkSelect');

  const canonicalRow = usesIsCvkMode
    ? '<div className="worker-choice-row worker-operation-type-row"><button type="button" className={operationType === "CUT" && !isCvkMode ? "active" : ""} onClick={() => handleOperationTypeChange("CUT")}>Cắt</button><button type="button" className={operationType === "LONG" && !isCvkMode ? "active" : ""} onClick={() => handleOperationTypeChange("LONG")}>Lồng</button><button type="button" className={isCvkMode ? "active" : ""} onClick={handleCvkSelect}>Công việc khác</button></div>'
    : '<div className="worker-choice-row worker-operation-type-row"><button type="button" className={!cvkMode && operationType === "CUT" ? "active" : ""} onClick={() => handleOperationTypeChange("CUT")}>Cắt</button><button type="button" className={!cvkMode && operationType === "LONG" ? "active" : ""} onClick={() => handleOperationTypeChange("LONG")}>Lồng</button><button type="button" className={cvkMode ? "active" : ""} onClick={() => handleOperationTypeChange("CVK")}>Công việc khác</button></div>';

  source = source.replace(row, canonicalRow);
}

// Remove adjacent duplicate text left by legacy JSX patching, but do not
// rewrite unrelated labels elsewhere in the form.
source = source.replace(/Công việc khác(?:Công việc khác)+/g, 'Công việc khác');

fs.writeFileSync(file, source, 'utf8');
console.log('[KTC] CVK final cleanup: exactly one canonical "Công việc khác" button.');
