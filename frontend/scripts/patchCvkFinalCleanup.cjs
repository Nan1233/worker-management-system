const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '../src/pages/worker/components/ProcessBasicInfoSection.tsx');
let source = fs.readFileSync(file, 'utf8');

/* Normalize the final CVK operation row after all previous CVK patches. */
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

source = source.replace(/Công việc khác(?:Công việc khác)+/g, 'Công việc khác');

const readableCvkWorkTypes = 'const CVK_WORK_TYPES = [{ value: "XUATNHAP", label: "Xuất nhập" }, { value: "KTCD", label: "Kiểm tra công đoạn" }, { value: "TAIPP", label: "Tái phế phẩm" }] as const;';
source = source.replace(
  /const\s+CVK_WORK_TYPES\s*=\s*\[[\s\S]*?\]\s+as\s+const\s*;/,
  readableCvkWorkTypes
);

source = source.replace(
  /options\s*=\s*\{\s*CVK_WORK_TYPES\.map\(\(value\)\s*=>\s*\(\{\s*value,\s*label:\s*value\s*\}\)\)\s*\}/,
  'options={CVK_WORK_TYPES}'
);

if (!source.includes('id="cvkWorkType" label="Công việc" selectOnly')) {
  source = source.replace(
    'id="cvkWorkType" label="Công việc"',
    'id="cvkWorkType" label="Công việc" selectOnly'
  );
}

fs.writeFileSync(file, source, 'utf8');
console.log('[KTC] CVK final cleanup: canonical button + readable work labels + label-only input display.');

/* Repair the known malformed edit in processReportSubmission.ts before Vite runs. */
const submissionFile = path.resolve(__dirname, '../src/pages/worker/processReportSubmission.ts');
let submission = fs.readFileSync(submissionFile, 'utf8');
const malformed = 'String(o.label||o.defect_name||"))===identity';
const corrected = 'String(o.label||o.defect_name||""))===identity';
if (submission.includes(malformed)) {
  submission = submission.replaceAll(malformed, corrected);
  fs.writeFileSync(submissionFile, submission, 'utf8');
  console.log('[KTC] Build repair: fixed malformed normalizeDefectIdentity string in processReportSubmission.ts.');
} else {
  console.log('[KTC] Build repair: processReportSubmission.ts already valid.');
}
