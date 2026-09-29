const fs = require('fs');
const path = require('path');

const basicPath = path.resolve(__dirname, '../src/pages/worker/components/ProcessBasicInfoSection.tsx');
let source = fs.readFileSync(basicPath, 'utf8');
let changed = false;

if (!source.includes('useNavigate')) {
  source = source.replace('import { useEffect, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";', 'import { useEffect, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";\nimport { useNavigate } from "react-router-dom";');
  changed = true;
}
if (!source.includes('const navigate = useNavigate();')) {
  source = source.replace('export default function ProcessBasicInfoSection({', 'export default function ProcessBasicInfoSection({');
  const marker = '    const [longExecutionMode, setLongExecutionMode]';
  source = source.replace(marker, '    const navigate = useNavigate();\n    const [longExecutionMode, setLongExecutionMode]');
  changed = true;
}
const oldChoices = '<div className="worker-choice-row"><button type="button" className={operationType === "CUT" ? "active" : ""} onClick={() => handleOperationTypeChange("CUT")}>Cắt</button><button type="button" className={operationType === "LONG" ? "active" : ""} onClick={() => handleOperationTypeChange("LONG")}>Lồng</button></div>';
const newChoices = '<div className="worker-choice-row worker-operation-type-row"><button type="button" className={operationType === "CUT" ? "active" : ""} onClick={() => handleOperationTypeChange("CUT")}>Cắt</button><button type="button" className={operationType === "LONG" ? "active" : ""} onClick={() => handleOperationTypeChange("LONG")}>Lồng</button><button type="button" className="worker-cvk-button" onClick={() => navigate("/worker/process/non-product")}>CVK</button></div>';
if (source.includes(oldChoices) && !source.includes('worker-operation-type-row')) {
  source = source.replace(oldChoices, newChoices);
  changed = true;
}
if (changed) fs.writeFileSync(basicPath, source, 'utf8');

const cvkPath = path.resolve(__dirname, '../src/pages/worker/NonProductWorkPage.tsx');
let cvk = fs.readFileSync(cvkPath, 'utf8');
let cvkChanged = false;
cvk = cvk.replace('const WORK_TYPES = ["Xuất nhập", "Hỗ trợ", "Kho", "Vệ sinh", "Công việc khác"];', 'const WORK_TYPES = ["XUATNHAP", "KTCD", "TAIPP"];');
cvk = cvk.replace('const [workType, setWorkType] = useState("Hỗ trợ");', 'const [workType, setWorkType] = useState("XUATNHAP");');
if (!cvk.includes('cvk-work-types')) {
  const selectRegex = /<label className="cvk-label">Công việc[^]*?<\/select><\/label>/;
  const replacement = '<div className="cvk-work-types"><span className="cvk-label">Công việc <em>*</em></span><div className="cvk-work-type-buttons">{WORK_TYPES.map(item => <button key={item} type="button" className={`cvk-work-type-button ${workType === item ? "active" : ""}`} onClick={() => setWorkType(item)}>{item}</button>)}</div></div>';
  if (selectRegex.test(cvk)) {
    cvk = cvk.replace(selectRegex, replacement);
    cvkChanged = true;
  }
}
if (cvkChanged || !cvk.includes('.cvk-work-type-buttons')) {
  const styleMarker = '.cvk-shifts{display:grid;';
  const styles = '.cvk-work-type-buttons{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.cvk-work-type-button{min-height:40px;border:1px solid #cfddec;border-radius:9px;background:#fff;color:#49627d;font-size:12px;font-weight:800;cursor:pointer;box-sizing:border-box}.cvk-work-type-button.active{background:#eaf3ff;border-color:#1769e0;color:#1769e0;box-shadow:inset 0 0 0 1px #1769e0}.cvk-work-types .cvk-label{margin-bottom:6px}.cvk-work-types{min-width:0}';
  if (!cvk.includes('.cvk-work-type-buttons')) cvk = cvk.replace(styleMarker, styles + styleMarker);
  const mobileMarker = '@media(max-width:650px){';
  cvk = cvk.replace(mobileMarker, '@media(max-width:650px){.cvk-work-type-buttons{grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}.cvk-work-type-button{min-height:38px;font-size:11px}' + '\n');
  cvkChanged = true;
}
if (cvkChanged) fs.writeFileSync(cvkPath, cvk, 'utf8');

console.log('[KTC] CVK worker-entry patch applied.');
