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

// CVK stores stable work-type codes, but the worker must see the Vietnamese
// label both in the suggestion list AND after selecting an item. The shared
// AutocompleteInput already supports this: for selectOnly inputs it renders
// option.label while onSelect still receives option.value.
const readableCvkWorkTypes = 'const CVK_WORK_TYPES = [{ value: "XUATNHAP", label: "Xuất nhập" }, { value: "KTCD", label: "Kiểm tra công đoạn" }, { value: "TAIPP", label: "Tái phế phẩm" }] as const;';
source = source.replace(
  /const\s+CVK_WORK_TYPES\s*=\s*\[[\s\S]*?\]\s+as\s+const\s*;/,
  readableCvkWorkTypes
);

// Ensure the AutocompleteInput receives objects with value + label rather
// than mapping the stable code back to itself as the visible text.
source = source.replace(
  /options\s*=\s*\{\s*CVK_WORK_TYPES\.map\(\(value\)\s*=>\s*\(\{\s*value,\s*label:\s*value\s*\}\)\)\s*\}/,
  'options={CVK_WORK_TYPES}'
);

// IMPORTANT: cvkWorkType was previously left with AutocompleteInput's default
// selectOnly=false. That made the dropdown show the Vietnamese label but the
// input itself show the stored code (XUATNHAP/KTCD/TAIPP). Explicitly enable
// selectOnly so the input displays option.label while the selected value sent
// to the form remains option.value.
source = source.replace(
  'id="cvkWorkType" label="Công việc"',
  'id="cvkWorkType" label="Công việc" selectOnly'
);

fs.writeFileSync(file, source, 'utf8');
console.log('[KTC] CVK final cleanup: canonical button + readable work labels + label-only input display.');