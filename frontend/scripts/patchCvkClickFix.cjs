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

// BasicInfo has an independent CVK UI flag. The underlying operation remains LONG, so all existing
// Lồng/Tay product and time logic stays intact and Cắt/Lồng behavior is untouched.
if (!basic.includes('const [cvkMode, setCvkMode] = useState(false);')) {
  basic = basic.replace('const [cutExecutionMode, setCutExecutionMode] = useState<CutExecutionMode>("AUTO");', 'const [cutExecutionMode, setCutExecutionMode] = useState<CutExecutionMode>("AUTO");\n    const [cvkMode, setCvkMode] = useState(false);');
}
if (!basic.includes('isCvkMode: boolean;')) {
  basic = basic.replace('isCutLongProcess: boolean; isInspectionProcess: boolean;', 'isCutLongProcess: boolean; isInspectionProcess: boolean; isCvkMode?: boolean;');
}

const oldHandler = 'const handleOperationTypeChange = (nextType: OperationType) => { setOperationType(nextType); if (nextType === "CUT") { setOperationMode("MACHINE"); setCutExecutionMode("AUTO"); setLongExecutionMode("MACHINE"); return; } setOperationMode("MANUAL"); setCutExecutionMode("AUTO"); setLongExecutionMode("MANUAL"); };';
const newHandler = 'const handleOperationTypeChange = (nextType: OperationType) => { if (nextType === "CVK") { setCvkMode(true); setOperationType("LONG"); setOperationMode("MANUAL"); setLongExecutionMode("MANUAL"); return; } setCvkMode(false); setOperationType(nextType); if (nextType === "CUT") { setOperationMode("MACHINE"); setCutExecutionMode("AUTO"); setLongExecutionMode("MACHINE"); return; } setOperationMode("MANUAL"); setCutExecutionMode("AUTO"); setLongExecutionMode("MANUAL"); };';
if (basic.includes(oldHandler)) basic = basic.replace(oldHandler, newHandler);

const oldMode = '{isCutLongProcess && <div className="worker-mode-panel worker-field-full"><div className="worker-mode-group"><div className="worker-mode-label">Loại gia công</div><div className="worker-choice-row"><button type="button" className={operationType === "CUT" ? "active" : ""} onClick={() => handleOperationTypeChange("CUT")}>Cắt</button><button type="button" className={operationType === "LONG" ? "active" : ""} onClick={() => handleOperationTypeChange("LONG")}>Lồng</button></div></div><div className="worker-mode-group worker-execution-mode-group"><div className="worker-mode-label">Hình thức thực hiện</div>{operationType === "CUT" ? <div className="worker-choice-row"><button type="button" className={cutExecutionMode === "AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("AUTO"); setOperationMode("MACHINE"); }}>Tự động</button><button type="button" className={cutExecutionMode === "NON_AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("NON_AUTO"); setOperationMode("MACHINE"); }}>Không tự động</button></div> : <div className="worker-choice-row"><button type="button" className={longExecutionMode === "MANUAL" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MANUAL")}>Tay</button><button type="button" className={longExecutionMode === "MACHINE" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MACHINE")}>Máy</button></div>}</div></div>}';
const newMode = '{isCutLongProcess && <div className="worker-mode-panel worker-field-full"><div className="worker-mode-group"><div className="worker-mode-label">Loại gia công</div><div className="worker-choice-row"><button type="button" className={!cvkMode && operationType === "CUT" ? "active" : ""} onClick={() => handleOperationTypeChange("CUT")}>Cắt</button><button type="button" className={!cvkMode && operationType === "LONG" ? "active" : ""} onClick={() => handleOperationTypeChange("LONG")}>Lồng</button><button type="button" className={cvkMode ? "active" : ""} onClick={() => handleOperationTypeChange("CVK")}>CVK</button></div></div>{!cvkMode && <div className="worker-mode-group worker-execution-mode-group"><div className="worker-mode-label">Hình thức thực hiện</div>{operationType === "CUT" ? <div className="worker-choice-row"><button type="button" className={cutExecutionMode === "AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("AUTO"); setOperationMode("MACHINE"); }}>Tự động</button><button type="button" className={cutExecutionMode === "NON_AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("NON_AUTO"); setOperationMode("MACHINE"); }}>Không tự động</button></div> : <div className="worker-choice-row"><button type="button" className={longExecutionMode === "MANUAL" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MANUAL")}>Tay</button><button type="button" className={longExecutionMode === "MACHINE" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MACHINE")}>Máy</button></div>}</div>}</div>}';
if (basic.includes(oldMode)) basic = basic.replace(oldMode, newMode);

const oldProduct = '{!usesMultiMachineLines && !usesSingleMachine && <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Mã sản phẩm</strong><span className="worker-required">*</span><small>Danh sách theo đúng công đoạn đang nhập</small></div><span className="worker-selection-count">{productAutocompleteOptions.length} mã</span></div><AutocompleteInput id="productName" label="Mã sản phẩm" value={form.productName} options={productAutocompleteOptions} placeholder={loadingMasterData ? "Đang tải danh mục sản phẩm…" : "Nhập hoặc chọn mã sản phẩm"} required disabled={loadingMasterData} emptyMessage="Danh mục sản phẩm đang trống. Hệ thống sẽ tự tải lại dữ liệu danh mục." onChange={setProduct} onSelect={(option) => setProduct(option.value)} /></div>}';
const newProduct = '{cvkMode ? <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Công việc</strong><span className="worker-required">*</span><small>Danh sách công việc không có định mức</small></div><span className="worker-selection-count">3 công việc</span></div><AutocompleteInput id="workType" label="Công việc" value={form.workType || ""} options={[{value:"XUATNHAP",label:"XUATNHAP"},{value:"KTCD",label:"KTCD"},{value:"TAIPP",label:"TAIPP"}]} placeholder="Nhập hoặc chọn công việc" required onChange={(value) => setForm((prev) => ({ ...prev, workType: value }))} onSelect={(option) => setForm((prev) => ({ ...prev, workType: option.value }))} /></div> : !usesMultiMachineLines && !usesSingleMachine && <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Mã sản phẩm</strong><span className="worker-required">*</span><small>Danh sách theo đúng công đoạn đang nhập</small></div><span className="worker-selection-count">{productAutocompleteOptions.length} mã</span></div><AutocompleteInput id="productName" label="Mã sản phẩm" value={form.productName} options={productAutocompleteOptions} placeholder={loadingMasterData ? "Đang tải danh mục sản phẩm…" : "Nhập hoặc chọn mã sản phẩm"} required disabled={loadingMasterData} emptyMessage="Danh mục sản phẩm đang trống. Hệ thống sẽ tự tải lại dữ liệu danh mục." onChange={setProduct} onSelect={(option) => setProduct(option.value)} /></div>}';
if (basic.includes(oldProduct)) basic = basic.replace(oldProduct, newProduct);

basic = basic.replace('{usesMultiMachineLines ? <div className="worker-machine-workspace', '{!cvkMode && usesMultiMachineLines ? <div className="worker-machine-workspace');

fs.writeFileSync(configPath, config);
fs.writeFileSync(pagePath, page);
fs.writeFileSync(basicPath, basic);
console.log('[KTC] CVK fixed: 3 ngang hàng, CVK independent Long-Tay mode, Cắt/Lồng preserved.');
