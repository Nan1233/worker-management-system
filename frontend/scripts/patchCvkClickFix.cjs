const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pagePath = path.join(root, 'src/pages/worker/ProcessPage.tsx');
const basicPath = path.join(root, 'src/pages/worker/components/ProcessBasicInfoSection.tsx');
const configPath = path.join(root, 'src/pages/worker/processPageConfig.ts');

let page = fs.readFileSync(pagePath, 'utf8');
let basic = fs.readFileSync(basicPath, 'utf8');
let config = fs.readFileSync(configPath, 'utf8');

config = config.replace(/export type OperationType = "CUT" \| "LONG"(?: \| "CVK")?;/, 'export type OperationType = "CUT" | "LONG" | "CVK";');
if (!/\bworkType:\s*string;/.test(config)) config = config.replace('    productName: string;\n', '    productName: string;\n    workType: string;\n');

// CVK is a local UI mode. Never navigate and never make CUT/LONG state depend on CVK.
page = page.replace(/\n\s*const location = useLocation\(\);[\s\S]*?const activeCvkMode = cvkModeLocal \|\| cvkMode;\n?/m, '\n');
page = page.replace(/\n\s*const cvkMode = new URLSearchParams\(location\.search\)\.get\("cvk"\) === "1";\n?/g, '\n');
page = page.replace(/\n\s*const \[cvkModeLocal, setCvkModeLocal\] = useState\([^;]+;\n?/g, '\n');
page = page.replace(/\n\s*const activeCvkMode[^;]+;\n?/g, '\n');
page = page.replace(/\buseLocation,\n/g, '');
page = page.replace(/\bisCvkMode=\{activeCvkMode\}/g, 'isCvkMode={false}');
page = page.replace(/\bisCvkMode=\{cvkMode\}/g, 'isCvkMode={false}');
page = page.replace(/\bsetCvkModeLocal\(true\)/g, 'setOperationType("LONG")');

if (!page.includes('isCvkMode={false}')) {
  page = page.replace(/(<ProcessBasicInfoSection[\s\S]*?operationType=\{operationType\})/, '$1\n                    isCvkMode={false}');
}

// Keep normal product filtering on CUT/LONG even while CVK UI is active.
page = page.replace(
  'operationType,\n        }),\n        [productOptions, processCode, processInfo.id, operationType]',
  'operationType === "CVK" ? "LONG" : operationType,\n        }),\n        [productOptions, processCode, processInfo.id, operationType]'
);

// BasicInfo: keep the existing Cắt/Lồng operation type and use an independent CVK UI state.
if (!basic.includes('const [cvkMode, setCvkMode] = useState(false);')) {
  basic = basic.replace(
    'const [cutExecutionMode, setCutExecutionMode] = useState<CutExecutionMode>("AUTO");',
    'const [cutExecutionMode, setCutExecutionMode] = useState<CutExecutionMode>("AUTO");\n    const [cvkMode, setCvkMode] = useState(false);'
  );
}

// Ignore the old parent CVK prop; local state is authoritative and cannot be reset by product filtering.
basic = basic.replace(/isCutLongProcess: boolean; isInspectionProcess: boolean; isCvkMode: boolean;/, 'isCutLongProcess: boolean; isInspectionProcess: boolean; isCvkMode?: boolean;');
basic = basic.replace(/isCutLongProcess, isInspectionProcess, isCvkMode, operationType,/, 'isCutLongProcess, isInspectionProcess, operationType,');
basic = basic.replace(/\bisCvkMode\b/g, 'cvkMode');

// The replacement above can affect the optional prop name; normalize it back so the file type remains valid.
basic = basic.replace('isCutLongProcess: boolean; isInspectionProcess: boolean; cvkMode?: boolean;', 'isCutLongProcess: boolean; isInspectionProcess: boolean; isCvkMode?: boolean;');
basic = basic.replace('isCutLongProcess, isInspectionProcess, operationType,', 'isCutLongProcess, isInspectionProcess, operationType,');

// CVK must select CVK UI while keeping the underlying operation type LONG so existing domain logic stays stable.
basic = basic.replace(
  'if (nextType === "CVK") { setOperationMode("MANUAL"); setLongExecutionMode("MANUAL"); return; }',
  'if (nextType === "CVK") { setCvkMode(true); setOperationType("LONG"); setOperationMode("MANUAL"); setLongExecutionMode("MANUAL"); return; }'
);

// Make the three top buttons mutually selectable. Cắt/Lồng explicitly leave CVK mode.
basic = basic.replace(
  'onClick={() => handleOperationTypeChange("CUT")}',
  'onClick={() => { setCvkMode(false); handleOperationTypeChange("CUT"); }}'
);
basic = basic.replace(
  'onClick={() => handleOperationTypeChange("LONG")}',
  'onClick={() => { setCvkMode(false); handleOperationTypeChange("LONG"); }}'
);

// Replace the CVK button handler with an inline handler as a second safety net.
basic = basic.replace(
  'onClick={() => handleOperationTypeChange("CVK")}',
  'onClick={() => { setCvkMode(true); setOperationType("LONG"); setOperationMode("MANUAL"); setLongExecutionMode("MANUAL"); }}'
);

// CVK uses the Long-Tay form. Machine workspace is suppressed only while cvkMode is active.
basic = basic.replace('{usesMultiMachineLines ? <div className="worker-machine-workspace', '{!cvkMode && usesMultiMachineLines ? <div className="worker-machine-workspace');

fs.writeFileSync(configPath, config);
fs.writeFileSync(pagePath, page);
fs.writeFileSync(basicPath, basic);
console.log('[KTC] CVK selection fixed: Cắt/Lồng remain normal; CVK is independent Long-Tay UI mode.');
