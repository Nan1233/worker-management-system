const fs = require('fs');
const path = require('path');

const configPath = path.resolve(__dirname, '../src/pages/worker/processPageConfig.ts');
let config = fs.readFileSync(configPath, 'utf8');
config = config.replace('export type OperationType = "CUT" | "LONG";', 'export type OperationType = "CUT" | "LONG" | "CVK";');
fs.writeFileSync(configPath, config);

const pagePath = path.resolve(__dirname, '../src/pages/worker/ProcessPage.tsx');
let page = fs.readFileSync(pagePath, 'utf8');
if (!page.includes('useLocation')) {
  page = page.replace('    useNavigate,\n    useParams', '    useLocation,\n    useNavigate,\n    useParams');
}
if (!page.includes('const cvkMode = new URLSearchParams(location.search).get("cvk") === "1";')) {
  const needle = '    const navigate =\n        useNavigate();';
  if (page.includes(needle)) page = page.replace(needle, '    const location = useLocation();\n    const navigate =\n        useNavigate();\n    const cvkMode = new URLSearchParams(location.search).get("cvk") === "1";');
}
if (!page.includes('isCvkMode={cvkMode}')) {
  page = page.replace('                    isInspectionProcess={isInspectionProcess}\n                    operationType={operationType}', '                    isInspectionProcess={isInspectionProcess}\n                    isCvkMode={cvkMode}\n                    operationType={operationType}');
}
fs.writeFileSync(pagePath, page);

const basicPath = path.resolve(__dirname, '../src/pages/worker/components/ProcessBasicInfoSection.tsx');
let basic = fs.readFileSync(basicPath, 'utf8');
if (!basic.includes('import { useNavigate }')) {
  basic = basic.replace('import { useEffect, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";', 'import { useEffect, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";\nimport { useNavigate } from "react-router-dom";');
}
if (!basic.includes('isCvkMode: boolean;')) {
  basic = basic.replace('    isCutLongProcess: boolean; isInspectionProcess: boolean;', '    isCutLongProcess: boolean; isInspectionProcess: boolean; isCvkMode: boolean;');
}
basic = basic.replace('export default function ProcessBasicInfoSection({ form, setForm, onFormChange, isCutLongProcess, isInspectionProcess, operationType,', 'export default function ProcessBasicInfoSection({ form, setForm, onFormChange, isCutLongProcess, isInspectionProcess, isCvkMode, operationType,');
if (!basic.includes('const navigate = useNavigate();')) {
  basic = basic.replace('    const [longExecutionMode, setLongExecutionMode]', '    const navigate = useNavigate();\n    const [longExecutionMode, setLongExecutionMode]');
}
const buttons = '<button type="button" className={operationType === "CUT" ? "active" : ""} onClick={() => handleOperationTypeChange("CUT")}>Cắt</button><button type="button" className={operationType === "LONG" ? "active" : ""} onClick={() => handleOperationTypeChange("LONG")}>Lồng</button>';
if (basic.includes(buttons) && !basic.includes('navigate("/worker/process/cat-long?cvk=1")')) {
  basic = basic.replace(buttons, '<button type="button" className={operationType === "CUT" && !isCvkMode ? "active" : ""} onClick={() => { if (isCvkMode) navigate("/worker/process/cat-long"); handleOperationTypeChange("CUT"); }}>Cắt</button><button type="button" className={operationType === "LONG" && !isCvkMode ? "active" : ""} onClick={() => { if (isCvkMode) navigate("/worker/process/cat-long"); handleOperationTypeChange("LONG"); }}>Lồng</button><button type="button" className={isCvkMode ? "active" : ""} onClick={() => navigate("/worker/process/cat-long?cvk=1")}>CVK</button>');
}
fs.writeFileSync(basicPath, basic);
console.log('[KTC] CVK click binding fixed at ProcessBasicInfoSection');
