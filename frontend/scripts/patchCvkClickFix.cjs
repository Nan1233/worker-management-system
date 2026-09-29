const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pagePath = path.join(root, 'src/pages/worker/ProcessPage.tsx');
const basicPath = path.join(root, 'src/pages/worker/components/ProcessBasicInfoSection.tsx');
const configPath = path.join(root, 'src/pages/worker/processPageConfig.ts');

let page = fs.readFileSync(pagePath, 'utf8');
let basic = fs.readFileSync(basicPath, 'utf8');
let config = fs.readFileSync(configPath, 'utf8');

// CVK is only an inline UI mode. It must never navigate to a different route.
config = config.replace(
  /export type OperationType = "CUT" \| "LONG"(?: \| "CVK")?;/,
  'export type OperationType = "CUT" | "LONG" | "CVK";'
);
if (!/\bworkType:\s*string;/.test(config)) {
  config = config.replace('    productName: string;\n', '    productName: string;\n    workType: string;\n');
}

// ProcessPage only needs to pass the existing operation state down. No URL/query state.
page = page.replace(/\n\s*const location = useLocation\(\);[\s\S]*?const activeCvkMode = cvkModeLocal \|\| cvkMode;\n?/m, '\n');
page = page.replace(/\n\s*const cvkMode = new URLSearchParams\(location\.search\)\.get\("cvk"\) === "1";\n?/g, '\n');
page = page.replace(/\n\s*const \[cvkModeLocal, setCvkModeLocal\] = useState\([^;]+;\n?/g, '\n');
page = page.replace(/\n\s*const activeCvkMode[^;]+;\n?/g, '\n');
page = page.replace(/\buseLocation,\n/g, '');
page = page.replace(/\bsetCvkModeLocal\(true\)/g, 'setOperationType("CVK")');
page = page.replace(/\bisCvkMode=\{activeCvkMode\}/g, 'isCvkMode={operationType === "CVK"}');
page = page.replace(/\bisCvkMode=\{cvkMode\}/g, 'isCvkMode={operationType === "CVK"}');

if (!page.includes('isCvkMode={operationType === "CVK"}')) {
  page = page.replace(/(<ProcessBasicInfoSection[\s\S]*?operationType=\{operationType\})/, '$1\n                    isCvkMode={operationType === "CVK"}');
}

// Never replace process capabilities with cat-long for CVK: that can change the existing
// Cut/Long data flow. CVK reuses the current page and only changes the BasicInfo rendering.
page = page.replace(/const processCapabilities = useMemo\(\(\) => getProcessCapabilities\(activeCvkMode \? "cat-long" : process\), \[process, activeCvkMode\]\);/, 'const processCapabilities = useMemo(() => getProcessCapabilities(process), [process]);');
page = page.replace(/\n\s*if \(process\.toLowerCase\(\) === "cat-long" && new URLSearchParams\(location\.search\).*?\n/g, '\n');

// BasicInfo props.
if (!basic.includes('isCvkMode: boolean;')) {
  basic = basic.replace('isCutLongProcess: boolean; isInspectionProcess: boolean;', 'isCutLongProcess: boolean; isInspectionProcess: boolean; isCvkMode: boolean;');
}
if (!basic.includes('isCvkMode, operationType')) {
  basic = basic.replace('isCutLongProcess, isInspectionProcess, operationType,', 'isCutLongProcess, isInspectionProcess, isCvkMode, operationType,');
}

// CVK has its own mode, but Cắt/Lồng handlers remain exactly as before.
if (!basic.includes('if (nextType === "CVK")')) {
  basic = basic.replace(
    'const handleOperationTypeChange = (nextType: OperationType) => { setOperationType(nextType); if (nextType === "CUT") {',
    'const handleOperationTypeChange = (nextType: OperationType) => { setOperationType(nextType); if (nextType === "CVK") { setOperationMode("MANUAL"); setLongExecutionMode("MANUAL"); return; } if (nextType === "CUT") {'
  );
}

const oldMode = '{isCutLongProcess && <div className="worker-mode-panel worker-field-full"><div className="worker-mode-group"><div className="worker-mode-label">Loại gia công</div><div className="worker-choice-row"><button type="button" className={operationType === "CUT" ? "active" : ""} onClick={() => handleOperationTypeChange("CUT")}>Cắt</button><button type="button" className={operationType === "LONG" ? "active" : ""} onClick={() => handleOperationTypeChange("LONG")}>Lồng</button></div></div><div className="worker-mode-group worker-execution-mode-group"><div className="worker-mode-label">Hình thức thực hiện</div>{operationType === "CUT" ? <div className="worker-choice-row"><button type="button" className={cutExecutionMode === "AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("AUTO"); setOperationMode("MACHINE"); }}>Tự động</button><button type="button" className={cutExecutionMode === "NON_AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("NON_AUTO"); setOperationMode("MACHINE"); }}>Không tự động</button></div> : <div className="worker-choice-row"><button type="button" className={longExecutionMode === "MANUAL" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MANUAL")}>Tay</button><button type="button" className={longExecutionMode === "MACHINE" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MACHINE")}>Máy</button></div>}</div></div>}';
const newMode = '{isCutLongProcess && <div className="worker-mode-panel worker-field-full"><div className="worker-mode-group"><div className="worker-mode-label">Loại gia công</div><div className="worker-choice-row"><button type="button" className={operationType === "CUT" ? "active" : ""} onClick={() => handleOperationTypeChange("CUT")}>Cắt</button><button type="button" className={operationType === "LONG" ? "active" : ""} onClick={() => handleOperationTypeChange("LONG")}>Lồng</button><button type="button" className={operationType === "CVK" ? "active" : ""} onClick={() => handleOperationTypeChange("CVK")}>CVK</button></div></div>{operationType !== "CVK" && <div className="worker-mode-group worker-execution-mode-group"><div className="worker-mode-label">Hình thức thực hiện</div>{operationType === "CUT" ? <div className="worker-choice-row"><button type="button" className={cutExecutionMode === "AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("AUTO"); setOperationMode("MACHINE"); }}>Tự động</button><button type="button" className={cutExecutionMode === "NON_AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("NON_AUTO"); setOperationMode("MACHINE"); }}>Không tự động</button></div> : <div className="worker-choice-row"><button type="button" className={longExecutionMode === "MANUAL" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MANUAL")}>Tay</button><button type="button" className={longExecutionMode === "MACHINE" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MACHINE")}>Máy</button></div>}</div>}</div>}';
if (basic.includes(oldMode)) basic = basic.replace(oldMode, newMode);

// CVK uses the exact existing Long-Tay product-card shell. Only the label and options change.
const oldProduct = '{!usesMultiMachineLines && !usesSingleMachine && <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Mã sản phẩm</strong><span className="worker-required">*</span><small>Danh sách theo đúng công đoạn đang nhập</small></div><span className="worker-selection-count">{productAutocompleteOptions.length} mã</span></div><AutocompleteInput id="productName" label="Mã sản phẩm" value={form.productName} options={productAutocompleteOptions} placeholder={loadingMasterData ? "Đang tải danh mục sản phẩm…" : "Nhập hoặc chọn mã sản phẩm"} required disabled={loadingMasterData} emptyMessage="Danh mục sản phẩm đang trống. Hệ thống sẽ tự tải lại dữ liệu danh mục." onChange={setProduct} onSelect={(option) => setProduct(option.value)} /></div>}';
const newProduct = '{isCvkMode ? <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Công việc</strong><span className="worker-required">*</span><small>Danh sách công việc không có định mức</small></div><span className="worker-selection-count">3 công việc</span></div><AutocompleteInput id="workType" label="Công việc" value={form.workType || ""} options={[{value:"XUATNHAP",label:"XUATNHAP"},{value:"KTCD",label:"KTCD"},{value:"TAIPP",label:"TAIPP"}]} placeholder="Nhập hoặc chọn công việc" required onChange={(value) => setForm((prev) => ({ ...prev, workType: value }))} onSelect={(option) => setForm((prev) => ({ ...prev, workType: option.value }))} /></div> : !usesMultiMachineLines && !usesSingleMachine && <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Mã sản phẩm</strong><span className="worker-required">*</span><small>Danh sách theo đúng công đoạn đang nhập</small></div><span className="worker-selection-count">{productAutocompleteOptions.length} mã</span></div><AutocompleteInput id="productName" label="Mã sản phẩm" value={form.productName} options={productAutocompleteOptions} placeholder={loadingMasterData ? "Đang tải danh mục sản phẩm…" : "Nhập hoặc chọn mã sản phẩm"} required disabled={loadingMasterData} emptyMessage="Danh mục sản phẩm đang trống. Hệ thống sẽ tự tải lại dữ liệu danh mục." onChange={setProduct} onSelect={(option) => setProduct(option.value)} /></div>}';
if (basic.includes(oldProduct)) basic = basic.replace(oldProduct, newProduct);

// CVK must look like Long-Tay: suppress only the machine workspace for CVK; Cắt/Lồng remain untouched.
basic = basic.replace('{usesMultiMachineLines ? <div className="worker-machine-workspace', '{!isCvkMode && usesMultiMachineLines ? <div className="worker-machine-workspace');

fs.writeFileSync(configPath, config);
fs.writeFileSync(pagePath, page);
fs.writeFileSync(basicPath, basic);
console.log('[KTC] CVK isolated mode: Cắt/Lồng unchanged; CVK reuses Long-Tay form.');
