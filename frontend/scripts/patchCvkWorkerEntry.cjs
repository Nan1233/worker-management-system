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

console.log('[KTC] CVK worker-entry patch applied.');
