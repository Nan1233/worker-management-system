const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '../src/pages/worker/components/ProcessBasicInfoSection.tsx');
let source = fs.readFileSync(file, 'utf8');

// The previous CVK patches modify the same JSX block sequentially. Do not try
// to repair only the text node: replace the complete operation-type row so
// there can only be one CVK button in the final source.
const canonicalRow = '<div className="worker-choice-row worker-operation-type-row"><button type="button" className={!cvkMode && operationType === "CUT" ? "active" : ""} onClick={() => handleOperationTypeChange("CUT")}>Cắt</button><button type="button" className={!cvkMode && operationType === "LONG" ? "active" : ""} onClick={() => handleOperationTypeChange("LONG")}>Lồng</button><button type="button" className={cvkMode ? "active" : ""} onClick={() => handleOperationTypeChange("CVK")}>Công việc khác</button></div>';

const rowPattern = /<div className="worker-choice-row(?: worker-operation-type-row)?">(?=[\s\S]*?handleOperationTypeChange\("CVK"\))(?:(?!<\/div>)[\s\S])*<\/div>/;
if (rowPattern.test(source)) {
  source = source.replace(rowPattern, canonicalRow);
}

// Safety net for older/generated variants where the row class differs.
const cvkRowPattern = /<div className="worker-choice-row[^"]*">(?=[\s\S]*?handleOperationTypeChange\("CVK"\))(?:(?!<\/div>)[\s\S])*<\/div>/;
if (cvkRowPattern.test(source)) {
  source = source.replace(cvkRowPattern, canonicalRow);
}

// Never allow adjacent duplicate labels to survive.
source = source.replace(/Công việc khác(?:Công việc khác)+/g, 'Công việc khác');

fs.writeFileSync(file, source, 'utf8');
console.log('[KTC] CVK final label normalization applied: one canonical "Công việc khác" button.');
