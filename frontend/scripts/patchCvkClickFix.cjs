const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const pagePath = path.join(root, 'src/pages/worker/ProcessPage.tsx');
const basicPath = path.join(root, 'src/pages/worker/components/ProcessBasicInfoSection.tsx');
const configPath = path.join(root, 'src/pages/worker/processPageConfig.ts');
const qualityPath = path.join(root, 'src/pages/worker/components/ProcessQualitySection.tsx');
const submissionPath = path.join(root, 'src/pages/worker/processReportSubmission.ts');

let page = fs.readFileSync(pagePath, 'utf8');
let basic = fs.readFileSync(basicPath, 'utf8');
let config = fs.readFileSync(configPath, 'utf8');
let quality = fs.readFileSync(qualityPath, 'utf8');
let submission = fs.readFileSync(submissionPath, 'utf8');

// CVK is an inline UI mode. Never navigate to a separate route.
page = page.replace(/\n\s*const location = useLocation\(\);[\s\S]*?const activeCvkMode = cvkModeLocal \|\| cvkMode;\n?/m, '\n');
page = page.replace(/\n\s*const cvkMode = new URLSearchParams\(location\.search\)\.get\("cvk"\) === "1";\n?/g, '\n');
page = page.replace(/\n\s*const \[cvkModeLocal, setCvkModeLocal\] = useState\([^;]+;\n?/g, '\n');
page = page.replace(/\n\s*const activeCvkMode[^;]+;\n?/g, '\n');
page = page.replace(/\buseLocation,\n/g, '');
page = page.replace(/\bsetCvkModeLocal\(true\)/g, 'setOperationType("LONG")');
page = page.replace(/\bisCvkMode=\{activeCvkMode\}/g, 'isCvkMode={false}');
page = page.replace(/\bisCvkMode=\{cvkMode\}/g, 'isCvkMode={false}');
if (!page.includes('isCvkMode={false}')) {
  page = page.replace(/(<ProcessBasicInfoSection[\s\S]*?operationType=\{operationType\})/, '$1\n                    isCvkMode={false}');
}

// Keep domain product filtering on LONG while CVK is active.
page = page.replace(
  '            operationType === "CVK" ? "LONG" : operationType,',
  '            operationType: operationType === "CVK" ? "LONG" : operationType,'
);

// CVK uses a work type instead of a product. Do not run product-required
// validation for XUATNHAP / KTCD / TAIPP (including the CVK sentinel state).
page = page.replace(
  '        if (!usesMultiMachineLines) {\n            if (!form.productName.trim()) {\n                return "Vui lòng chọn sản phẩm";\n            }',
  '        if (!["CVK", "XUATNHAP", "KTCD", "TAIPP"].includes(String(form.workType || "").trim().toUpperCase()) && !usesMultiMachineLines) {\n            if (!form.productName.trim()) {\n                return "Vui lòng chọn sản phẩm";\n            }'
);
page = page.replace(
  'if (!usesMultiMachineLines) { if (!form.productName.trim()) { return "Vui lòng chọn sản phẩm"; }',
  'if (!["CVK", "XUATNHAP", "KTCD", "TAIPP"].includes(String(form.workType || "").trim().toUpperCase()) && !usesMultiMachineLines) { if (!form.productName.trim()) { return "Vui lòng chọn sản phẩm"; }'
);

// BasicInfo has an independent CVK UI flag. Underlying operation remains LONG,
// so the existing Lồng/Tay form is reused exactly.
if (!basic.includes('const [cvkMode, setCvkMode] = useState(false);')) {
  basic = basic.replace('const [cutExecutionMode, setCutExecutionMode] = useState<CutExecutionMode>("AUTO");', 'const [cutExecutionMode, setCutExecutionMode] = useState<CutExecutionMode>("AUTO");\n    const [cvkMode, setCvkMode] = useState(false);');
}
if (!basic.includes('isCvkMode: boolean;')) {
  basic = basic.replace('isCutLongProcess: boolean; isInspectionProcess: boolean;', 'isCutLongProcess: boolean; isInspectionProcess: boolean; isCvkMode?: boolean;');
}

const oldHandler = 'const handleOperationTypeChange = (nextType: OperationType) => { setOperationType(nextType); if (nextType === "CUT") { setOperationMode("MACHINE"); setCutExecutionMode("AUTO"); setLongExecutionMode("MACHINE"); return; } setOperationMode("MANUAL"); setCutExecutionMode("AUTO"); setLongExecutionMode("MANUAL"); };';
const newHandler = 'const handleOperationTypeChange = (nextType: OperationType) => { if (nextType === "CVK") { setCvkMode(true); setOperationType("LONG"); setOperationMode("MANUAL"); setLongExecutionMode("MANUAL"); setForm((prev) => ({ ...prev, workType: "CVK", productName: "", standardOutput: "0", actualOutput: "0", ttOk: "0", ttNg: "0" })); return; } setCvkMode(false); setOperationType(nextType); setForm((prev) => ({ ...prev, workType: "" })); if (nextType === "CUT") { setOperationMode("MACHINE"); setCutExecutionMode("AUTO"); setLongExecutionMode("MACHINE"); return; } setOperationMode("MANUAL"); setCutExecutionMode("AUTO"); setLongExecutionMode("MANUAL"); };';
if (basic.includes(oldHandler)) basic = basic.replace(oldHandler, newHandler);

const oldMode = '{isCutLongProcess && <div className="worker-mode-panel worker-field-full"><div className="worker-mode-group"><div className="worker-mode-label">Loại gia công</div><div className="worker-choice-row"><button type="button" className={operationType === "CUT" ? "active" : ""} onClick={() => handleOperationTypeChange("CUT")}>Cắt</button><button type="button" className={operationType === "LONG" ? "active" : ""} onClick={() => handleOperationTypeChange("LONG")}>Lồng</button></div></div><div className="worker-mode-group worker-execution-mode-group"><div className="worker-mode-label">Hình thức thực hiện</div>{operationType === "CUT" ? <div className="worker-choice-row"><button type="button" className={cutExecutionMode === "AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("AUTO"); setOperationMode("MACHINE"); }}>Tự động</button><button type="button" className={cutExecutionMode === "NON_AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("NON_AUTO"); setOperationMode("MACHINE"); }}>Không tự động</button></div> : <div className="worker-choice-row"><button type="button" className={longExecutionMode === "MANUAL" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MANUAL")}>Tay</button><button type="button" className={longExecutionMode === "MACHINE" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MACHINE")}>Máy</button></div>}</div></div>}';
const newMode = '{isCutLongProcess && <div className="worker-mode-panel worker-field-full"><div className="worker-mode-group"><div className="worker-mode-label">Loại gia công</div><div className="worker-choice-row"><button type="button" className={!cvkMode && operationType === "CUT" ? "active" : ""} onClick={() => handleOperationTypeChange("CUT")}>Cắt</button><button type="button" className={!cvkMode && operationType === "LONG" ? "active" : ""} onClick={() => handleOperationTypeChange("LONG")}>Lồng</button><button type="button" className={cvkMode ? "active" : ""} onClick={() => handleOperationTypeChange("CVK")}>CVK</button></div></div>{!cvkMode && <div className="worker-mode-group worker-execution-mode-group"><div className="worker-mode-label">Hình thức thực hiện</div>{operationType === "CUT" ? <div className="worker-choice-row"><button type="button" className={cutExecutionMode === "AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("AUTO"); setOperationMode("MACHINE"); }}>Tự động</button><button type="button" className={cutExecutionMode === "NON_AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("NON_AUTO"); setOperationMode("MACHINE"); }}>Không tự động</button></div> : <div className="worker-choice-row"><button type="button" className={longExecutionMode === "MANUAL" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MANUAL")}>Tay</button><button type="button" className={longExecutionMode === "MACHINE" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MACHINE")}>Máy</button></div>}</div>}</div>}';
if (basic.includes(oldMode)) basic = basic.replace(oldMode, newMode);

const oldProduct = '{!usesMultiMachineLines && !usesSingleMachine && <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Mã sản phẩm</strong><span className="worker-required">*</span><small>Danh sách theo đúng công đoạn đang nhập</small></div><span className="worker-selection-count">{productAutocompleteOptions.length} mã</span></div><AutocompleteInput id="productName" label="Mã sản phẩm" value={form.productName} options={productAutocompleteOptions} placeholder={loadingMasterData ? "Đang tải danh mục sản phẩm…" : "Nhập hoặc chọn mã sản phẩm"} required disabled={loadingMasterData} emptyMessage="Danh mục sản phẩm đang trống. Hệ thống sẽ tự tải lại dữ liệu danh mục." onChange={setProduct} onSelect={(option) => setProduct(option.value)} /></div>}';
const newProduct = '{cvkMode ? <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Công việc</strong><span className="worker-required">*</span><small>Danh sách công việc không có định mức</small></div><span className="worker-selection-count">3 công việc</span></div><AutocompleteInput id="workType" label="Công việc" value={form.workType === "CVK" ? "" : (form.workType || "")} options={[{value:"XUATNHAP",label:"XUATNHAP"},{value:"KTCD",label:"KTCD"},{value:"TAIPP",label:"TAIPP"}]} placeholder="Nhập hoặc chọn công việc" required onChange={(value) => setForm((prev) => ({ ...prev, workType: value }))} onSelect={(option) => setForm((prev) => ({ ...prev, workType: option.value }))} /></div> : !usesMultiMachineLines && !usesSingleMachine && <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Mã sản phẩm</strong><span className="worker-required">*</span><small>Danh sách theo đúng công đoạn đang nhập</small></div><span className="worker-selection-count">{productAutocompleteOptions.length} mã</span></div><AutocompleteInput id="productName" label="Mã sản phẩm" value={form.productName} options={productAutocompleteOptions} placeholder={loadingMasterData ? "Đang tải danh mục sản phẩm…" : "Nhập hoặc chọn mã sản phẩm"} required disabled={loadingMasterData} emptyMessage="Danh mục sản phẩm đang trống. Hệ thống sẽ tự tải lại dữ liệu danh mục." onChange={setProduct} onSelect={(option) => setProduct(option.value)} /></div>}';
if (basic.includes(oldProduct)) basic = basic.replace(oldProduct, newProduct);

basic = basic.replace('{usesMultiMachineLines ? <div className="worker-machine-workspace', '{!cvkMode && usesMultiMachineLines ? <div className="worker-machine-workspace');

// Hide quality as soon as CVK is selected. The sentinel is replaced by the
// actual CVK work type as soon as XUATNHAP/KTCD/TAIPP is chosen.
quality = quality.replace('new Set(["XUATNHAP", "KTCD", "TAIPP"])', 'new Set(["CVK", "XUATNHAP", "KTCD", "TAIPP"])');

// CVK is represented by the real DB process id 30002. The screen remains
// inside Cắt/Lồng, but the submitted report is stored under processes.CVK.
submission = submission.replace(
  'const isCvk = Number(args.processId) === 60006 || String(args.extraData?.process_code || "").trim().toUpperCase() === "CVK";',
  'const isCvk = Number(args.processId) === 60006 || String(args.extraData?.process_code || "").trim().toUpperCase() === "CVK" || ["CVK", "XUATNHAP", "KTCD", "TAIPP"].includes(cvkWorkType.toUpperCase());\n  const effectiveProcessId = isCvk ? 30002 : args.processId;'
);
submission = submission.replace('    process_id:args.processId, work_date:', '    process_id:effectiveProcessId, work_date:');

fs.writeFileSync(configPath, config);
fs.writeFileSync(pagePath, page);
fs.writeFileSync(basicPath, basic);
fs.writeFileSync(qualityPath, quality);
fs.writeFileSync(submissionPath, submission);
console.log('[KTC] CVK inline mode: skips product validation, stores CVK under process_id 30002, and preserves Cắt/Lồng.');
