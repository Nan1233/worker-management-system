const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pagePath = path.join(root, 'src/pages/worker/ProcessPage.tsx');
const basicPath = path.join(root, 'src/pages/worker/components/ProcessBasicInfoSection.tsx');
const configPath = path.join(root, 'src/pages/worker/processPageConfig.ts');

let page = fs.readFileSync(pagePath, 'utf8');
let basic = fs.readFileSync(basicPath, 'utf8');
let config = fs.readFileSync(configPath, 'utf8');

// CVK is an inline mode of the existing cat-long page; never navigate to a separate CVK form.
if (!config.includes('export type OperationType = "CUT" | "LONG" | "CVK"')) {
  config = config.replace('export type OperationType = "CUT" | "LONG";', 'export type OperationType = "CUT" | "LONG" | "CVK";');
}

// ProcessPage reads ?cvk=1 only as local UI state.
if (!page.includes('const cvkMode = new URLSearchParams(location.search).get("cvk") === "1";')) {
  page = page.replace(
    '    const navigate =\n        useNavigate();',
    '    const location = useLocation();\n    const navigate =\n        useNavigate();\n    const cvkMode = new URLSearchParams(location.search).get("cvk") === "1";'
  );
}
if (!page.includes('useLocation')) {
  page = page.replace('    useNavigate,\n', '    useLocation,\n    useNavigate,\n');
}

// Do not change the route when CVK is clicked. The existing page remains mounted.
page = page.replace(/navigate\(`\/worker\/process\/\$\{process\}\?cvk=1`\)/g, 'setCvkMode(true)');
page = page.replace(/navigate\("\/worker\/process\/cat-long\?cvk=1"\)/g, 'setCvkMode(true)');

// Add a local setter only once; it mirrors the query state and is used by the button.
if (!page.includes('const [cvkModeLocal, setCvkModeLocal]')) {
  page = page.replace(
    '    const cvkMode = new URLSearchParams(location.search).get("cvk") === "1";',
    '    const cvkMode = new URLSearchParams(location.search).get("cvk") === "1";\n    const [cvkModeLocal, setCvkModeLocal] = useState(cvkMode);\n    const activeCvkMode = cvkModeLocal || cvkMode;'
  );
  page = page.replace(/\bsetCvkMode\(true\)/g, 'setCvkModeLocal(true)');
  page = page.replace(/\bisCvkMode=\{cvkMode\}/g, 'isCvkMode={activeCvkMode}');
}

// Pass the mode into the basic-info section.
if (!page.includes('isCvkMode={activeCvkMode}')) {
  page = page.replace(/(<ProcessBasicInfoSection[^>]*)(\/>|>)/, '$1 isCvkMode={activeCvkMode}$2');
}

// Keep the canonical process as cat-long while CVK is active; only the form mode changes.
if (page.includes('const processCapabilities = useMemo(() => getProcessCapabilities(process), [process]);')) {
  page = page.replace(
    'const processCapabilities = useMemo(() => getProcessCapabilities(process), [process]);',
    'const processCapabilities = useMemo(() => getProcessCapabilities(activeCvkMode ? "cat-long" : process), [process, activeCvkMode]);'
  );
}

// BasicInfo: add CVK prop.
if (!basic.includes('isCvkMode: boolean;')) {
  basic = basic.replace(
    'isCutLongProcess: boolean; isInspectionProcess: boolean;',
    'isCutLongProcess: boolean; isInspectionProcess: boolean; isCvkMode: boolean;'
  );
}
if (!basic.includes('isCvkMode, operationType')) {
  basic = basic.replace(
    'isCutLongProcess, isInspectionProcess, operationType,',
    'isCutLongProcess, isInspectionProcess, isCvkMode, operationType,'
  );
}

// Three top process buttons stay in the same block. Only the two execution buttons disappear in CVK mode.
const oldMode = '{isCutLongProcess && <div className="worker-mode-panel worker-field-full"><div className="worker-mode-group"><div className="worker-mode-label">Loại gia công</div><div className="worker-choice-row"><button type="button" className={operationType === "CUT" ? "active" : ""} onClick={() => handleOperationTypeChange("CUT")}>Cắt</button><button type="button" className={operationType === "LONG" ? "active" : ""} onClick={() => handleOperationTypeChange("LONG")}>Lồng</button></div></div><div className="worker-mode-group worker-execution-mode-group"><div className="worker-mode-label">Hình thức thực hiện</div>{operationType === "CUT" ? <div className="worker-choice-row"><button type="button" className={cutExecutionMode === "AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("AUTO"); setOperationMode("MACHINE"); }}>Tự động</button><button type="button" className={cutExecutionMode === "NON_AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("NON_AUTO"); setOperationMode("MACHINE"); }}>Không tự động</button></div> : <div className="worker-choice-row"><button type="button" className={longExecutionMode === "MANUAL" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MANUAL")}>Tay</button><button type="button" className={longExecutionMode === "MACHINE" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MACHINE")}>Máy</button></div>}</div></div>}';
const newMode = '{isCutLongProcess && <div className="worker-mode-panel worker-field-full"><div className="worker-mode-group"><div className="worker-mode-label">Loại gia công</div><div className="worker-choice-row"><button type="button" className={operationType === "CUT" && !isCvkMode ? "active" : ""} onClick={() => handleOperationTypeChange("CUT")}>Cắt</button><button type="button" className={operationType === "LONG" && !isCvkMode ? "active" : ""} onClick={() => handleOperationTypeChange("LONG")}>Lồng</button><button type="button" className={isCvkMode ? "active" : ""} onClick={() => { setOperationType("CVK"); setOperationMode("MANUAL"); setLongExecutionMode("MANUAL"); setForm((prev) => ({ ...prev, productName: "", standardOutput: "0", actualOutput: "0", ttOk: "0", ttNg: "0" })); }}>CVK</button></div></div>{!isCvkMode && <div className="worker-mode-group worker-execution-mode-group"><div className="worker-mode-label">Hình thức thực hiện</div>{operationType === "CUT" ? <div className="worker-choice-row"><button type="button" className={cutExecutionMode === "AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("AUTO"); setOperationMode("MACHINE"); }}>Tự động</button><button type="button" className={cutExecutionMode === "NON_AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("NON_AUTO"); setOperationMode("MACHINE"); }}>Không tự động</button></div> : <div className="worker-choice-row"><button type="button" className={longExecutionMode === "MANUAL" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MANUAL")}>Tay</button><button type="button" className={longExecutionMode === "MACHINE" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MACHINE")}>Máy</button></div>}</div>}</div>}';
if (basic.includes(oldMode)) basic = basic.replace(oldMode, newMode);

// CVK uses the exact same product-card shell as Long-Tay; only the label/options change.
const oldProduct = '{!usesMultiMachineLines && !usesSingleMachine && <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Mã sản phẩm</strong><span className="worker-required">*</span><small>Danh sách theo đúng công đoạn đang nhập</small></div><span className="worker-selection-count">{productAutocompleteOptions.length} mã</span></div><AutocompleteInput id="productName" label="Mã sản phẩm" value={form.productName} options={productAutocompleteOptions} placeholder={loadingMasterData ? "Đang tải danh mục sản phẩm…" : "Nhập hoặc chọn mã sản phẩm"} required disabled={loadingMasterData} emptyMessage="Danh mục sản phẩm đang trống. Hệ thống sẽ tự tải lại dữ liệu danh mục." onChange={setProduct} onSelect={(option) => setProduct(option.value)} /></div>}';
const newProduct = '{isCvkMode ? <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Công việc</strong><span className="worker-required">*</span><small>Chọn công việc không có định mức</small></div></div><AutocompleteInput id="workType" label="Công việc" value={form.workType || ""} options={[{value:"XUATNHAP",label:"XUATNHAP"},{value:"KTCD",label:"KTCD"},{value:"TAIPP",label:"TAIPP"}]} placeholder="Nhập hoặc chọn công việc" required onChange={(value) => setForm((prev) => ({ ...prev, workType: value }))} onSelect={(option) => setForm((prev) => ({ ...prev, workType: option.value }))} /></div> : !usesMultiMachineLines && !usesSingleMachine && <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Mã sản phẩm</strong><span className="worker-required">*</span><small>Danh sách theo đúng công đoạn đang nhập</small></div><span className="worker-selection-count">{productAutocompleteOptions.length} mã</span></div><AutocompleteInput id="productName" label="Mã sản phẩm" value={form.productName} options={productAutocompleteOptions} placeholder={loadingMasterData ? "Đang tải danh mục sản phẩm…" : "Nhập hoặc chọn mã sản phẩm"} required disabled={loadingMasterData} emptyMessage="Danh mục sản phẩm đang trống. Hệ thống sẽ tự tải lại dữ liệu danh mục." onChange={setProduct} onSelect={(option) => setProduct(option.value)} /></div>}';
if (basic.includes(oldProduct)) basic = basic.replace(oldProduct, newProduct);

// Do not render machine workspace or inspection mode for CVK; keep Long-Tay's remaining form sections unchanged.
basic = basic.replace('{usesMultiMachineLines ? <div className="worker-machine-workspace', '{!isCvkMode && usesMultiMachineLines ? <div className="worker-machine-workspace');
basic = basic.replace('{isInspectionProcess && <div className="worker-mode-panel', '{!isCvkMode && isInspectionProcess && <div className="worker-mode-panel');

fs.writeFileSync(configPath, config);
fs.writeFileSync(pagePath, page);
fs.writeFileSync(basicPath, basic);
console.log('[KTC] CVK inline Long-Tay mode applied.');
