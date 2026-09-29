const fs = require('fs');
const path = require('path');

const basicPath = path.resolve(__dirname, '../src/pages/worker/components/ProcessBasicInfoSection.tsx');
let basic = fs.readFileSync(basicPath, 'utf8');

basic = basic.replace(
  'isCutLongProcess: boolean; isInspectionProcess: boolean;',
  'isCutLongProcess: boolean; isInspectionProcess: boolean; isCvkMode: boolean; setIsCvkMode: Dispatch<SetStateAction<boolean>>;'
);
basic = basic.replace(
  'isCutLongProcess, isInspectionProcess, operationType, setOperationType,',
  'isCutLongProcess, isInspectionProcess, isCvkMode, setIsCvkMode, operationType, setOperationType,'
);

if (!basic.includes('const CVK_WORK_TYPES')) {
  basic = basic.replace(
    'const GC_AUTOMATIC_MACHINE_CODES = new Set(["C5", "C6", "C7", "C11"]);',
    'const GC_AUTOMATIC_MACHINE_CODES = new Set(["C5", "C6", "C7", "C11"]);\nconst CVK_WORK_TYPES = ["XUATNHAP", "KTCD", "TAIPP"] as const;'
  );
}

if (!basic.includes('const handleCvkSelect = () =>')) {
  basic = basic.replace(
    'const handleOperationTypeChange = (nextType: OperationType) => {',
    'const handleCvkSelect = () => { setIsCvkMode(true); setForm((prev) => ({ ...prev, workType: "CVK", productName: "", standardOutput: "0", actualOutput: "0", ttOk: "0", ttNg: "0" })); setOperationType("LONG"); setOperationMode("MANUAL"); setLongExecutionMode("MANUAL"); };\n    const handleOperationTypeChange = (nextType: OperationType) => {'
  );
}
basic = basic.replace(
  'const handleOperationTypeChange = (nextType: OperationType) => { setOperationType(nextType);',
  'const handleOperationTypeChange = (nextType: OperationType) => { setIsCvkMode(false); setForm((prev) => ({ ...prev, workType: "", productName: "" })); setOperationType(nextType);'
);

const oldMode = '{isCutLongProcess && <div className="worker-mode-panel worker-field-full"><div className="worker-mode-group"><div className="worker-mode-label">Loại gia công</div><div className="worker-choice-row"><button type="button" className={operationType === "CUT" ? "active" : ""} onClick={() => handleOperationTypeChange("CUT")}>Cắt</button><button type="button" className={operationType === "LONG" ? "active" : ""} onClick={() => handleOperationTypeChange("LONG")}>Lồng</button></div></div><div className="worker-mode-group worker-execution-mode-group"><div className="worker-mode-label">Hình thức thực hiện</div>{operationType === "CUT" ? <div className="worker-choice-row"><button type="button" className={cutExecutionMode === "AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("AUTO"); setOperationMode("MACHINE"); }}>Tự động</button><button type="button" className={cutExecutionMode === "NON_AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("NON_AUTO"); setOperationMode("MACHINE"); }}>Không tự động</button></div> : <div className="worker-choice-row"><button type="button" className={longExecutionMode === "MANUAL" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MANUAL")}>Tay</button><button type="button" className={longExecutionMode === "MACHINE" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MACHINE")}>Máy</button></div>}</div></div>}';
const newMode = '{isCutLongProcess && <div className="worker-mode-panel worker-field-full"><div className="worker-mode-group"><div className="worker-mode-label">Loại gia công</div><div className="worker-choice-row worker-operation-type-row"><button type="button" className={operationType === "CUT" && !isCvkMode ? "active" : ""} onClick={() => handleOperationTypeChange("CUT")}>Cắt</button><button type="button" className={operationType === "LONG" && !isCvkMode ? "active" : ""} onClick={() => handleOperationTypeChange("LONG")}>Lồng</button><button type="button" className={isCvkMode ? "active" : ""} onClick={handleCvkSelect}>CVK</button></div></div>{!isCvkMode && <div className="worker-mode-group worker-execution-mode-group"><div className="worker-mode-label">Hình thức thực hiện</div>{operationType === "CUT" ? <div className="worker-choice-row"><button type="button" className={cutExecutionMode === "AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("AUTO"); setOperationMode("MACHINE"); }}>Tự động</button><button type="button" className={cutExecutionMode === "NON_AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("NON_AUTO"); setOperationMode("MACHINE"); }}>Không tự động</button></div> : <div className="worker-choice-row"><button type="button" className={longExecutionMode === "MANUAL" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MANUAL")}>Tay</button><button type="button" className={longExecutionMode === "MACHINE" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MACHINE")}>Máy</button></div>}</div>}</div>}';
if (basic.includes(oldMode)) basic = basic.replace(oldMode, newMode);

const oldProduct = '{!usesMultiMachineLines && !usesSingleMachine && <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Mã sản phẩm</strong><span className="worker-required">*</span><small>Danh sách theo đúng công đoạn đang nhập</small></div><span className="worker-selection-count">{productAutocompleteOptions.length} mã</span></div><AutocompleteInput id="productName" label="Mã sản phẩm" value={form.productName} options={productAutocompleteOptions} placeholder={loadingMasterData ? "Đang tải danh mục sản phẩm…" : "Nhập hoặc chọn mã sản phẩm"} required disabled={loadingMasterData} emptyMessage="Danh mục sản phẩm đang trống. Hệ thống sẽ tự tải lại dữ liệu danh mục." onChange={setProduct} onSelect={(option) => setProduct(option.value)} /></div>}';
const newProduct = '{isCvkMode ? <div className="worker-cvk-entry worker-field-full"><div className="worker-selection-card"><div className="worker-selection-heading"><div><strong>Công việc</strong><span className="worker-required">*</span><small>Danh sách công việc không có định mức</small></div><span className="worker-selection-count">{CVK_WORK_TYPES.length} công việc</span></div><AutocompleteInput id="cvkWorkType" label="Công việc" value={String(form.workType || "").toUpperCase() === "CVK" ? "" : String(form.workType || "")} options={CVK_WORK_TYPES.map((value) => ({ value, label: value }))} placeholder="Nhập hoặc chọn công việc" required disabled={loadingMasterData} emptyMessage="Chưa có danh sách công việc" onChange={(value) => setForm((prev) => ({ ...prev, workType: value, productName: "", standardOutput: "0", actualOutput: "0", ttOk: "0", ttNg: "0" }))} onSelect={(option) => setForm((prev) => ({ ...prev, workType: option.value, productName: "", standardOutput: "0", actualOutput: "0", ttOk: "0", ttNg: "0" }))} /></div><div className="worker-cvk-note"><label className="worker-field-label" htmlFor="cvkNote">Ghi chú</label><textarea id="cvkNote" name="note" rows={3} value={form.note || ""} onChange={onFormChange} placeholder="Nhập ghi chú cho công việc CVK (nếu có)" /></div></div> : !usesMultiMachineLines && !usesSingleMachine && <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Mã sản phẩm</strong><span className="worker-required">*</span><small>Danh sách theo đúng công đoạn đang nhập</small></div><span className="worker-selection-count">{productAutocompleteOptions.length} mã</span></div><AutocompleteInput id="productName" label="Mã sản phẩm" value={form.productName} options={productAutocompleteOptions} placeholder={loadingMasterData ? "Đang tải danh mục sản phẩm…" : "Nhập hoặc chọn mã sản phẩm"} required disabled={loadingMasterData} emptyMessage="Danh mục sản phẩm đang trống. Hệ thống sẽ tự tải lại dữ liệu danh mục." onChange={setProduct} onSelect={(option) => setProduct(option.value)} /></div>}';
if (basic.includes(oldProduct)) basic = basic.replace(oldProduct, newProduct);

if (!basic.includes('cvk-worker-inline-style')) {
  const marker = '    return <section className="worker-form-card worker-form-card-basic">';
  const style = '    const cvkWorkerInlineStyle = <style className="cvk-worker-inline-style">{`.worker-operation-type-row{grid-template-columns:repeat(3,minmax(0,1fr))}.worker-operation-type-row button{width:100%;min-width:0}.worker-cvk-entry{display:grid;gap:12px}.worker-cvk-note textarea{width:100%;min-height:84px;resize:vertical;box-sizing:border-box;border:1px solid #c9dbf2;border-radius:10px;padding:10px 12px;font:inherit;color:inherit;background:#fff;outline:none}.worker-cvk-note textarea:focus{border-color:#4f94e8;box-shadow:0 0 0 2px rgba(79,148,232,.12)}`}</style>;\n';
  basic = basic.replace(marker, style + marker + '\n        {cvkWorkerInlineStyle}');
}
fs.writeFileSync(basicPath, basic, 'utf8');

const pagePath = path.resolve(__dirname, '../src/pages/worker/ProcessPage.tsx');
let page = fs.readFileSync(pagePath, 'utf8');

if (!page.includes('const [isCvkMode, setIsCvkMode] = useState(false);')) {
  const stateMarker = '    const [operationType, setOperationType] = useState<OperationType>("CUT");';
  if (page.includes(stateMarker)) page = page.replace(stateMarker, stateMarker + '\n    const [isCvkMode, setIsCvkMode] = useState(false);');
}

if (!page.includes('isCvkMode={isCvkMode}')) {
  const propMarker = '                    isInspectionProcess={isInspectionProcess}\n                    operationType={operationType}';
  if (page.includes(propMarker)) page = page.replace(propMarker, '                    isInspectionProcess={isInspectionProcess}\n                    isCvkMode={isCvkMode}\n                    setIsCvkMode={setIsCvkMode}\n                    operationType={operationType}');
}

if (!page.includes('{!isCvkMode && (')) {
  const start = page.indexOf('                <ProcessQualitySection');
  if (start >= 0) {
    const end = page.indexOf('\n                />', start);
    if (end >= 0) {
      const qualityBlock = page.slice(start, end + '\n                />'.length);
      page = page.slice(0, start) + '                {!isCvkMode && (\n' + qualityBlock + '\n                )}' + page.slice(end + '\n                />'.length);
    }
  }
}

fs.writeFileSync(pagePath, page, 'utf8');
console.log('[KTC] CVK V3: immediate quality hide + CVK note field.');
