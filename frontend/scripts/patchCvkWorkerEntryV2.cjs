const fs = require("fs");
const path = require("path");

const basicPath = path.resolve(__dirname, "../src/pages/worker/components/ProcessBasicInfoSection.tsx");
let source = fs.readFileSync(basicPath, "utf8");
let changed = false;

if (!source.includes("const CVK_WORK_TYPES")) {
  source = source.replace(
    'const GC_AUTOMATIC_MACHINE_CODES = new Set(["C5", "C6", "C7", "C11"]);',
    'const GC_AUTOMATIC_MACHINE_CODES = new Set(["C5", "C6", "C7", "C11"]);\nconst CVK_WORK_TYPES = ["XUATNHAP", "KTCD", "TAIPP"] as const;\nconst LONG_MANUAL_EXCLUDED_CODES = new Set(CVK_WORK_TYPES.map((value) => value.toUpperCase()));',
  );
  changed = true;
}

if (!source.includes("const [isCvkMode, setIsCvkMode] = useState(false);")) {
  source = source.replace(
    '    const [cutExecutionMode, setCutExecutionMode] = useState<CutExecutionMode>("AUTO");',
    '    const [cutExecutionMode, setCutExecutionMode] = useState<CutExecutionMode>("AUTO");\n    const [isCvkMode, setIsCvkMode] = useState(false);',
  );
  changed = true;
}

source = source.replace(
  'const handleOperationTypeChange = (nextType: OperationType) => { setOperationType(nextType);',
  'const handleOperationTypeChange = (nextType: OperationType) => { setIsCvkMode(false); setForm((prev) => ({ ...prev, workType: "", productName: "" })); setOperationType(nextType);',
);

if (!source.includes("const handleCvkSelect = () =>")) {
  source = source.replace(
    '    const handleLongExecutionModeChange = (mode: LongExecutionMode) => { setLongExecutionMode(mode); setOperationMode(mode === "MANUAL" ? "MANUAL" : "MACHINE"); };',
    '    const handleLongExecutionModeChange = (mode: LongExecutionMode) => { setLongExecutionMode(mode); setOperationMode(mode === "MANUAL" ? "MANUAL" : "MACHINE"); };\n    const handleCvkSelect = () => { setIsCvkMode(true); setForm((prev) => ({ ...prev, workType: "CVK", productName: "", standardOutput: "0", actualOutput: "0", ttOk: "0", ttNg: "0" })); setOperationType("LONG"); setLongExecutionMode("MANUAL"); setOperationMode("MANUAL"); };\n    const setCvkWork = (value: string) => setForm((prev) => ({ ...prev, workType: value, productName: value, standardOutput: "0", actualOutput: "0", ttOk: "0", ttNg: "0" }));\n    const cvkWorkOptions: AutocompleteOption[] = CVK_WORK_TYPES.map((value) => ({ value, label: value }));',
  );
  changed = true;
}

if (!source.includes("const longManualProductOptions")) {
  source = source.replace(
    '    const cvkWorkOptions: AutocompleteOption[] = CVK_WORK_TYPES.map((value) => ({ value, label: value }));',
    '    const cvkWorkOptions: AutocompleteOption[] = CVK_WORK_TYPES.map((value) => ({ value, label: value }));\n    const longManualProductOptions = productAutocompleteOptions.filter((option) => !LONG_MANUAL_EXCLUDED_CODES.has(String(option.value || "").trim().toUpperCase()));',
  );
  changed = true;
}

const oldMode = '{isCutLongProcess && <div className="worker-mode-panel worker-field-full"><div className="worker-mode-group"><div className="worker-mode-label">Loại gia công</div><div className="worker-choice-row"><button type="button" className={operationType === "CUT" ? "active" : ""} onClick={() => handleOperationTypeChange("CUT")}>Cắt</button><button type="button" className={operationType === "LONG" ? "active" : ""} onClick={() => handleOperationTypeChange("LONG")}>Lồng</button></div></div><div className="worker-mode-group worker-execution-mode-group"><div className="worker-mode-label">Hình thức thực hiện</div>{operationType === "CUT" ? <div className="worker-choice-row"><button type="button" className={cutExecutionMode === "AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("AUTO"); setOperationMode("MACHINE"); }}>Tự động</button><button type="button" className={cutExecutionMode === "NON_AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("NON_AUTO"); setOperationMode("MACHINE"); }}>Không tự động</button></div> : <div className="worker-choice-row"><button type="button" className={longExecutionMode === "MANUAL" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MANUAL")}>Tay</button><button type="button" className={longExecutionMode === "MACHINE" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MACHINE")}>Máy</button></div>}</div></div>}';
const newMode = '{isCutLongProcess && <div className="worker-mode-panel worker-field-full"><div className="worker-mode-group"><div className="worker-mode-label">Loại gia công</div><div className="worker-choice-row worker-operation-type-row"><button type="button" className={operationType === "CUT" && !isCvkMode ? "active" : ""} onClick={() => handleOperationTypeChange("CUT")}>Cắt</button><button type="button" className={operationType === "LONG" && !isCvkMode ? "active" : ""} onClick={() => handleOperationTypeChange("LONG")}>Lồng</button><button type="button" className={isCvkMode ? "active" : ""} onClick={handleCvkSelect}>CVK</button></div></div>{!isCvkMode && <div className="worker-mode-group worker-execution-mode-group"><div className="worker-mode-label">Hình thức thực hiện</div>{operationType === "CUT" ? <div className="worker-choice-row"><button type="button" className={cutExecutionMode === "AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("AUTO"); setOperationMode("MACHINE"); }}>Tự động</button><button type="button" className={cutExecutionMode === "NON_AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("NON_AUTO"); setOperationMode("MACHINE"); }}>Không tự động</button></div> : <div className="worker-choice-row"><button type="button" className={longExecutionMode === "MANUAL" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MANUAL")}>Tay</button><button type="button" className={longExecutionMode === "MACHINE" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MACHINE")}>Máy</button></div>}</div>}</div>}';
if (source.includes(oldMode)) {
  source = source.replace(oldMode, newMode);
  changed = true;
}

const oldProduct = '{!usesMultiMachineLines && !usesSingleMachine && <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Mã sản phẩm</strong><span className="worker-required">*</span><small>Danh sách theo đúng công đoạn đang nhập</small></div><span className="worker-selection-count">{productAutocompleteOptions.length} mã</span></div><AutocompleteInput id="productName" label="Mã sản phẩm" value={form.productName} options={productAutocompleteOptions} placeholder={loadingMasterData ? "Đang tải danh mục sản phẩm…" : "Nhập hoặc chọn mã sản phẩm"} required disabled={loadingMasterData} emptyMessage="Danh mục sản phẩm đang trống. Hệ thống sẽ tự tải lại dữ liệu danh mục." onChange={setProduct} onSelect={(option) => setProduct(option.value)} /></div>}';
const newProduct = '{isCvkMode ? <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Công việc</strong><span className="worker-required">*</span><small>Danh sách công việc không có định mức</small></div><span className="worker-selection-count">{cvkWorkOptions.length} công việc</span></div><AutocompleteInput id="cvkWorkType" label="Công việc" value={String(form.workType || "").toUpperCase() === "CVK" ? "" : String(form.workType || "")} options={cvkWorkOptions} placeholder="Nhập hoặc chọn công việc" required disabled={loadingMasterData} emptyMessage="Chưa có danh sách công việc" onChange={setCvkWork} onSelect={(option) => setCvkWork(option.value)} /></div> : !usesMultiMachineLines && !usesSingleMachine && <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Mã sản phẩm</strong><span className="worker-required">*</span><small>Danh sách theo đúng công đoạn đang nhập</small></div><span className="worker-selection-count">{longManualProductOptions.length} mã</span></div><AutocompleteInput id="productName" label="Mã sản phẩm" value={form.productName} options={longManualProductOptions} placeholder={loadingMasterData ? "Đang tải danh mục sản phẩm…" : "Nhập hoặc chọn mã sản phẩm"} required disabled={loadingMasterData} emptyMessage="Danh mục sản phẩm đang trống. Hệ thống sẽ tự tải lại dữ liệu danh mục." onChange={setProduct} onSelect={(option) => setProduct(option.value)} /></div>}';
if (source.includes(oldProduct)) {
  source = source.replace(oldProduct, newProduct);
  changed = true;
}

if (!source.includes("cvk-worker-inline-style")) {
  const marker = '    return <section className="worker-form-card worker-form-card-basic">';
  const styleDecl = '    const cvkWorkerInlineStyle = <style className="cvk-worker-inline-style">{`.worker-operation-type-row{grid-template-columns:repeat(3,minmax(0,1fr))}.worker-operation-type-row button{width:100%;min-width:0}`}</style>;\n';
  source = source.replace(marker, styleDecl + marker + "\n        {cvkWorkerInlineStyle}");
  changed = true;
}

if (changed) fs.writeFileSync(basicPath, source, "utf8");
