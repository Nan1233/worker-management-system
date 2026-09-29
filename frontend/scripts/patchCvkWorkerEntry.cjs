const fs = require('fs');
const path = require('path');

const basicPath = path.resolve(__dirname, '../src/pages/worker/components/ProcessBasicInfoSection.tsx');
let basic = fs.readFileSync(basicPath, 'utf8');
let changed = false;

// CVK is an inline mode of the normal worker form. It must never open the old standalone CVK page.
if (!basic.includes('isCvkMode: boolean;')) {
  basic = basic.replace('    isCutLongProcess: boolean; isInspectionProcess: boolean;', '    isCutLongProcess: boolean; isInspectionProcess: boolean; isCvkMode: boolean;');
  basic = basic.replace('export default function ProcessBasicInfoSection({ form, setForm, onFormChange, isCutLongProcess, isInspectionProcess, operationType,', 'export default function ProcessBasicInfoSection({ form, setForm, onFormChange, isCutLongProcess, isInspectionProcess, isCvkMode, operationType,');
  changed = true;
}
if (!basic.includes('const CVK_WORK_TYPES')) {
  basic = basic.replace('const GC_AUTOMATIC_MACHINE_CODES = new Set(["C5", "C6", "C7", "C11"]);', 'const GC_AUTOMATIC_MACHINE_CODES = new Set(["C5", "C6", "C7", "C11"]);\nconst CVK_WORK_TYPES = ["XUATNHAP", "KTCD", "TAIPP"] as const;');
  changed = true;
}
// Keep the three top-level choices; CVK switches the rest of the mode panel off.
const oldModeBlock = '{isCutLongProcess && <div className="worker-mode-panel worker-field-full"><div className="worker-mode-group"><div className="worker-mode-label">Loại gia công</div><div className="worker-choice-row"><button type="button" className={operationType === "CUT" ? "active" : ""} onClick={() => handleOperationTypeChange("CUT")}>Cắt</button><button type="button" className={operationType === "LONG" ? "active" : ""} onClick={() => handleOperationTypeChange("LONG")}>Lồng</button></div></div><div className="worker-mode-group worker-execution-mode-group"><div className="worker-mode-label">Hình thức thực hiện</div>{operationType === "CUT" ? <div className="worker-choice-row"><button type="button" className={cutExecutionMode === "AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("AUTO"); setOperationMode("MACHINE"); }}>Tự động</button><button type="button" className={cutExecutionMode === "NON_AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("NON_AUTO"); setOperationMode("MACHINE"); }}>Không tự động</button></div> : <div className="worker-choice-row"><button type="button" className={longExecutionMode === "MANUAL" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MANUAL")}>Tay</button><button type="button" className={longExecutionMode === "MACHINE" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MACHINE")}>Máy</button></div>}</div></div>}';
const newModeBlock = '{isCutLongProcess && <div className="worker-mode-panel worker-field-full"><div className="worker-mode-group"><div className="worker-mode-label">Loại gia công</div><div className="worker-choice-row worker-operation-type-row"><button type="button" className={operationType === "CUT" ? "active" : ""} onClick={() => handleOperationTypeChange("CUT")}>Cắt</button><button type="button" className={operationType === "LONG" ? "active" : ""} onClick={() => handleOperationTypeChange("LONG")}>Lồng</button><button type="button" className={isCvkMode ? "active" : ""} onClick={() => window.history.pushState({}, "", "#/worker/process/cat-long?cvk=1")}>CVK</button></div></div>{!isCvkMode && <div className="worker-mode-group worker-execution-mode-group"><div className="worker-mode-label">Hình thức thực hiện</div>{operationType === "CUT" ? <div className="worker-choice-row"><button type="button" className={cutExecutionMode === "AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("AUTO"); setOperationMode("MACHINE"); }}>Tự động</button><button type="button" className={cutExecutionMode === "NON_AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("NON_AUTO"); setOperationMode("MACHINE"); }}>Không tự động</button></div> : <div className="worker-choice-row"><button type="button" className={longExecutionMode === "MANUAL" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MANUAL")}>Tay</button><button type="button" className={longExecutionMode === "MACHINE" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MACHINE")}>Máy</button></div>}</div>}</div>}';
if (basic.includes(oldModeBlock)) { basic = basic.replace(oldModeBlock, newModeBlock); changed = true; }
// Replace the normal product selector with the CVK work selector only in CVK mode.
const oldProduct = '{!usesMultiMachineLines && !usesSingleMachine && <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Mã sản phẩm</strong><span className="worker-required">*</span><small>Danh sách theo đúng công đoạn đang nhập</small></div><span className="worker-selection-count">{productAutocompleteOptions.length} mã</span></div><AutocompleteInput id="productName" label="Mã sản phẩm" value={form.productName} options={productAutocompleteOptions} placeholder={loadingMasterData ? "Đang tải danh mục sản phẩm…" : "Nhập hoặc chọn mã sản phẩm"} required disabled={loadingMasterData} emptyMessage="Danh mục sản phẩm đang trống. Hệ thống sẽ tự tải lại dữ liệu danh mục." onChange={setProduct} onSelect={(option) => setProduct(option.value)} /></div>}';
const newProduct = '{isCvkMode ? <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Công việc</strong><span className="worker-required">*</span><small>Công việc không có định mức</small></div></div><div className="worker-choice-row cvk-work-type-row">{CVK_WORK_TYPES.map((item) => <button key={item} type="button" className={form.workType === item ? "active" : ""} onClick={() => setForm((prev) => ({ ...prev, workType: item, productName: "", standardOutput: "0", actualOutput: "0", ttOk: "0", ttNg: "0" }))}>{item}</button>)}</div></div> : {!usesMultiMachineLines && !usesSingleMachineLines && <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Mã sản phẩm</strong><span className="worker-required">*</span><small>Danh sách theo đúng công đoạn đang nhập</small></div><span className="worker-selection-count">{productAutocompleteOptions.length} mã</span></div><AutocompleteInput id="productName" label="Mã sản phẩm" value={form.productName} options={productAutocompleteOptions} placeholder={loadingMasterData ? "Đang tải danh mục sản phẩm…" : "Nhập hoặc chọn mã sản phẩm"} required disabled={loadingMasterData} emptyMessage="Danh mục sản phẩm đang trống. Hệ thống sẽ tự tải lại dữ liệu danh mục." onChange={setProduct} onSelect={(option) => setProduct(option.value)} /></div>}}';
// Correct typo-free replacement if exact source has usesSingleMachine.
const newProduct2 = '{isCvkMode ? <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Công việc</strong><span className="worker-required">*</span><small>Công việc không có định mức</small></div></div><div className="worker-choice-row cvk-work-type-row">{CVK_WORK_TYPES.map((item) => <button key={item} type="button" className={form.workType === item ? "active" : ""} onClick={() => setForm((prev) => ({ ...prev, workType: item, productName: "", standardOutput: "0", actualOutput: "0", ttOk: "0", ttNg: "0" }))}>{item}</button>)}</div></div> : !usesMultiMachineLines && !usesSingleMachine && <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Mã sản phẩm</strong><span className="worker-required">*</span><small>Danh sách theo đúng công đoạn đang nhập</small></div><span className="worker-selection-count">{productAutocompleteOptions.length} mã</span></div><AutocompleteInput id="productName" label="Mã sản phẩm" value={form.productName} options={productAutocompleteOptions} placeholder={loadingMasterData ? "Đang tải danh mục sản phẩm…" : "Nhập hoặc chọn mã sản phẩm"} required disabled={loadingMasterData} emptyMessage="Danh mục sản phẩm đang trống. Hệ thống sẽ tự tải lại dữ liệu danh mục." onChange={setProduct} onSelect={(option) => setProduct(option.value)} /></div>}';
if (basic.includes(oldProduct)) { basic = basic.replace(oldProduct, newProduct2); changed = true; }
if (changed) fs.writeFileSync(basicPath, basic, 'utf8');

const pagePath = path.resolve(__dirname, '../src/pages/worker/ProcessPage.tsx');
let page = fs.readFileSync(pagePath, 'utf8');
let pageChanged = false;
if (!page.includes('useLocation')) { page = page.replace('useNavigate,\n    useParams', 'useLocation,\n    useNavigate,\n    useParams'); pageChanged = true; }
if (!page.includes('const cvkMode = new URLSearchParams(location.search).get("cvk") === "1";')) {
  page = page.replace('    const navigate =\n        useNavigate();', '    const location = useLocation();\n    const navigate =\n        useNavigate();\n    const cvkMode = new URLSearchParams(location.search).get("cvk") === "1";');
  pageChanged = true;
}
page = page.replace('processMap[process]\n                ??\n                processMap["cat-long"],', 'cvkMode\n                    ? processMap["cvk"]\n                    : processMap[process]\n                        ?? processMap["cat-long"],');
page = page.replace('[processInfo]', '[processInfo, cvkMode]');
page = page.replace('const processCapabilities = useMemo(() => getProcessCapabilities(process), [process]);', 'const processCapabilities = useMemo(() => getProcessCapabilities(cvkMode ? "cvk" : process), [process, cvkMode]);');
// Pass CVK mode into the shared basic form.
if (!page.includes('isCvkMode={cvkMode}')) {
  page = page.replace('isCutLongProcess={isCutLongProcess} isInspectionProcess={isInspectionProcess}', 'isCutLongProcess={isCutLongProcess} isInspectionProcess={isInspectionProcess} isCvkMode={cvkMode}');
  pageChanged = true;
}
// CVK has no OK/NG quality block; keep time/deduction and everything below it.
const qualityStart = '                <ProcessQualitySection';
const qualityEnd = '                <ProcessTimeDeductionSection';
const q1 = page.indexOf(qualityStart);
const q2 = page.indexOf(qualityEnd, q1);
if (q1 >= 0 && q2 > q1 && !page.slice(q1 - 30, q2).includes('cvkMode ?')) {
  const qualityBlock = page.slice(q1, q2);
  page = page.slice(0, q1) + '{!cvkMode && (\n' + qualityBlock + '                )}\n\n' + page.slice(q2);
  pageChanged = true;
}
if (pageChanged) fs.writeFileSync(pagePath, page, 'utf8');

console.log('[KTC] CVK inline worker-form patch applied.');
