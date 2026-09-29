const fs = require('fs');
const path = require('path');

const basicPath = path.resolve(__dirname, '../src/pages/worker/components/ProcessBasicInfoSection.tsx');
let basic = fs.readFileSync(basicPath, 'utf8');
let changed = false;

if (!basic.includes('isCvkMode: boolean;')) {
  basic = basic.replace('    isCutLongProcess: boolean; isInspectionProcess: boolean;', '    isCutLongProcess: boolean; isInspectionProcess: boolean; isCvkMode: boolean;');
  basic = basic.replace('export default function ProcessBasicInfoSection({ form, setForm, onFormChange, isCutLongProcess, isInspectionProcess, operationType,', 'export default function ProcessBasicInfoSection({ form, setForm, onFormChange, isCutLongProcess, isInspectionProcess, isCvkMode, operationType,');
  changed = true;
}
if (!basic.includes('const CVK_WORK_TYPES')) {
  basic = basic.replace('const GC_AUTOMATIC_MACHINE_CODES = new Set(["C5", "C6", "C7", "C11"]);', 'const GC_AUTOMATIC_MACHINE_CODES = new Set(["C5", "C6", "C7", "C11"]);\nconst CVK_WORK_TYPES = ["XUATNHAP", "KTCD", "TAIPP"] as const;');
  changed = true;
}
if (!basic.includes('const navigate = useNavigate();') && basic.includes('useNavigate')) {
  basic = basic.replace('    const [longExecutionMode, setLongExecutionMode]', '    const navigate = useNavigate();\n    const [longExecutionMode, setLongExecutionMode]');
  changed = true;
}
const oldModeBlock = '{isCutLongProcess && <div className="worker-mode-panel worker-field-full"><div className="worker-mode-group"><div className="worker-mode-label">Loại gia công</div><div className="worker-choice-row"><button type="button" className={operationType === "CUT" ? "active" : ""} onClick={() => handleOperationTypeChange("CUT")}>Cắt</button><button type="button" className={operationType === "LONG" ? "active" : ""} onClick={() => handleOperationTypeChange("LONG")}>Lồng</button></div></div><div className="worker-mode-group worker-execution-mode-group"><div className="worker-mode-label">Hình thức thực hiện</div>{operationType === "CUT" ? <div className="worker-choice-row"><button type="button" className={cutExecutionMode === "AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("AUTO"); setOperationMode("MACHINE"); }}>Tự động</button><button type="button" className={cutExecutionMode === "NON_AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("NON_AUTO"); setOperationMode("MACHINE"); }}>Không tự động</button></div> : <div className="worker-choice-row"><button type="button" className={longExecutionMode === "MANUAL" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MANUAL")}>Tay</button><button type="button" className={longExecutionMode === "MACHINE" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MACHINE")}>Máy</button></div>}</div></div>}';
const newModeBlock = '{isCutLongProcess && <div className="worker-mode-panel worker-field-full"><div className="worker-mode-group"><div className="worker-mode-label">Loại gia công</div><div className="worker-choice-row worker-operation-type-row"><button type="button" className={operationType === "CUT" && !isCvkMode ? "active" : ""} onClick={() => { if (isCvkMode) navigate("/worker/process/cat-long"); handleOperationTypeChange("CUT"); }}>Cắt</button><button type="button" className={operationType === "LONG" && !isCvkMode ? "active" : ""} onClick={() => { if (isCvkMode) navigate("/worker/process/cat-long"); handleOperationTypeChange("LONG"); }}>Lồng</button><button type="button" className={isCvkMode ? "active" : ""} onClick={() => navigate("/worker/process/cat-long?cvk=1")}>CVK</button></div></div>{!isCvkMode && <div className="worker-mode-group worker-execution-mode-group"><div className="worker-mode-label">Hình thức thực hiện</div>{operationType === "CUT" ? <div className="worker-choice-row"><button type="button" className={cutExecutionMode === "AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("AUTO"); setOperationMode("MACHINE"); }}>Tự động</button><button type="button" className={cutExecutionMode === "NON_AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("NON_AUTO"); setOperationMode("MACHINE"); }}>Không tự động</button></div> : <div className="worker-choice-row"><button type="button" className={longExecutionMode === "MANUAL" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MANUAL")}>Tay</button><button type="button" className={longExecutionMode === "MACHINE" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MACHINE")}>Máy</button></div>}</div>}</div>}';
if (basic.includes(oldModeBlock)) { basic = basic.replace(oldModeBlock, newModeBlock); changed = true; }
const oldProduct = '{!usesMultiMachineLines && !usesSingleMachine && <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Mã sản phẩm</strong><span className="worker-required">*</span><small>Danh sách theo đúng công đoạn đang nhập</small></div><span className="worker-selection-count">{productAutocompleteOptions.length} mã</span></div><AutocompleteInput id="productName" label="Mã sản phẩm" value={form.productName} options={productAutocompleteOptions} placeholder={loadingMasterData ? "Đang tải danh mục sản phẩm…" : "Nhập hoặc chọn mã sản phẩm"} required disabled={loadingMasterData} emptyMessage="Danh mục sản phẩm đang trống. Hệ thống sẽ tự tải lại dữ liệu danh mục." onChange={setProduct} onSelect={(option) => setProduct(option.value)} /></div>}';
const newProduct = '{isCvkMode ? <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Công việc</strong><span className="worker-required">*</span><small>Chọn công việc không có định mức</small></div></div><div className="worker-choice-row cvk-work-type-row">{CVK_WORK_TYPES.map((item) => <button key={item} type="button" className={form.workType === item ? "active" : ""} onClick={() => setForm((prev) => ({ ...prev, workType: item, productName: "", standardOutput: "0", actualOutput: "0", ttOk: "0", ttNg: "0" }))}>{item}</button>)}</div></div> : !usesMultiMachineLines && !usesSingleMachine && <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Mã sản phẩm</strong><span className="worker-required">*</span><small>Danh sách theo đúng công đoạn đang nhập</small></div><span className="worker-selection-count">{productAutocompleteOptions.length} mã</span></div><AutocompleteInput id="productName" label="Mã sản phẩm" value={form.productName} options={productAutocompleteOptions} placeholder={loadingMasterData ? "Đang tải danh mục sản phẩm…" : "Nhập hoặc chọn mã sản phẩm"} required disabled={loadingMasterData} emptyMessage="Danh mục sản phẩm đang trống. Hệ thống sẽ tự tải lại dữ liệu danh mục." onChange={setProduct} onSelect={(option) => setProduct(option.value)} /></div>}';
if (basic.includes(oldProduct)) { basic = basic.replace(oldProduct, newProduct); changed = true; }
if (basic.includes('worker-operation-type-row') && !basic.includes('.cvk-work-type-row')) {
  // CSS is injected once into the component so the three CVK work buttons follow the same sizing as the Worker choices.
  const marker = '    return <section className="worker-form-card worker-form-card-basic">';
  const css = '    const cvkStyle = <style>{`.worker-operation-type-row,.cvk-work-type-row{grid-template-columns:repeat(3,minmax(0,1fr))}.worker-operation-type-row button,.cvk-work-type-row button{width:100%;min-width:0}.cvk-work-type-row{margin-top:8px}`}</style>;\n';
  if (!basic.includes('const cvkStyle =')) basic = basic.replace(marker, css + marker);
  basic = basic.replace(marker, marker);
  basic = basic.replace('    return <section className="worker-form-card worker-form-card-basic">', '    return <section className="worker-form-card worker-form-card-basic">{cvkStyle}');
  changed = true;
}
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
if (!page.includes('isCvkMode={cvkMode}')) { page = page.replace('isCutLongProcess={isCutLongProcess} isInspectionProcess={isInspectionProcess}', 'isCutLongProcess={isCutLongProcess} isInspectionProcess={isInspectionProcess} isCvkMode={cvkMode}'); pageChanged = true; }
// CVK: keep the same page and all lower sections, but remove the OK/NG quality block.
const qualityStart = '                <ProcessQualitySection';
const qualityEnd = '                <ProcessTimeDeductionSection';
const q1 = page.indexOf(qualityStart); const q2 = page.indexOf(qualityEnd, q1);
if (q1 >= 0 && q2 > q1 && !page.slice(q1 - 40, q2).includes('{!cvkMode &&')) {
  const qualityBlock = page.slice(q1, q2);
  page = page.slice(0, q1) + '                {!cvkMode && (\n' + qualityBlock + '                )}\n\n' + page.slice(q2);
  pageChanged = true;
}
// CVK validation: work type is required; no product, machine, standard or OK/NG checks.
const oldValidation = '        if (!usesMultiMachineLines) {\n            if (!form.productName.trim()) {\n                return "Vui lòng chọn sản phẩm";\n            }';
if (page.includes(oldValidation) && !page.includes('if (cvkMode && !String(form.workType || "").trim())')) {
  page = page.replace(oldValidation, '        if (cvkMode && !String(form.workType || "").trim()) {\n            return "Vui lòng chọn công việc";\n        }\n\n        if (!cvkMode && !usesMultiMachineLines) {\n            if (!form.productName.trim()) {\n                return "Vui lòng chọn sản phẩm";\n            }');
  page = page.replace('        if (usesMultiMachineLines) {', '        if (!cvkMode && usesMultiMachineLines) {');
  page = page.replace('        } else if (usesSingleMachine) {', '        } else if (!cvkMode && usesSingleMachine) {');
  page = page.replace('        if (isManualOnlyProcess && (form.machineNo.trim() || machineLines.some((line) => line.machineCode.trim()))) {', '        if (!cvkMode && isManualOnlyProcess && (form.machineNo.trim() || machineLines.some((line) => line.machineCode.trim()))) {');
  page = page.replace('        if (\n            Number(\n                form.standardOutput', '        if (!cvkMode &&\n            Number(\n                form.standardOutput');
  page = page.replace('        const totalDefects = calculateNgTotal(form, activeNgOptions);', '        const totalDefects = cvkMode ? 0 : calculateNgTotal(form, activeNgOptions);');
  page = page.replace('        if (\n            totalDefects', '        if (!cvkMode &&\n            totalDefects');
  page = page.replace('        if (Number(form.actualOutput || 0) !== calculateActualOutput(form)) {', '        if (!cvkMode && Number(form.actualOutput || 0) !== calculateActualOutput(form)) {');
  pageChanged = true;
}
if (pageChanged) fs.writeFileSync(pagePath, page, 'utf8');

// Make the shared payload produce the existing CVK server contract: no product/standard/OK/NG, work type in extra_data.
const submitPath = path.resolve(__dirname, '../src/pages/worker/processReportSubmission.ts');
let submit = fs.readFileSync(submitPath, 'utf8');
let submitChanged = false;
if (!submit.includes('const isCvkReport = args.processId === 60006;')) {
  submit = submit.replace('  const num=(v:unknown)=>Number(v)||0;', '  const isCvkReport = args.processId === 60006;\n  const num=(v:unknown)=>Number(v)||0;');
  submit = submit.replace('    process_id:args.processId, work_date:args.form.workDate, shift:args.form.shift,', '    process_id:args.processId, work_date:args.form.workDate, shift:args.form.shift,');
  submit = submit.replace('    machine_no:useMachineLinesPayload?lines.map(l=>l.machine_code).join(", "):args.form.machineNo,', '    machine_no:isCvkReport ? "" : (useMachineLinesPayload?lines.map(l=>l.machine_code).join(", "):args.form.machineNo),');
  submit = submit.replace('    product_name:useMachineLinesPayload?[...new Set(lines.map(l=>l.product_code).filter(Boolean))].join(", "):resolveSubmittedProductCode(args.form.productName, args.form.machineNo, args.operationType, args.productOptions),', '    product_name:isCvkReport ? "" : (useMachineLinesPayload?[...new Set(lines.map(l=>l.product_code).filter(Boolean))].join(", "):resolveSubmittedProductCode(args.form.productName, args.form.machineNo, args.operationType, args.productOptions)),');
  submit = submit.replace('    standard_output:noStandardLongWork ? 0 : (useMachineLinesPayload?lines.reduce((sum,l)=>sum+num(l.standard_output),0):resolvePositiveStandardOutput(args.form.productName,args.form.standardOutput)),', '    standard_output:isCvkReport ? 0 : (noStandardLongWork ? 0 : (useMachineLinesPayload?lines.reduce((sum,l)=>sum+num(l.standard_output),0):resolvePositiveStandardOutput(args.form.productName,args.form.standardOutput))),');
  submit = submit.replace('    actual_output:actualOutput, tt_ok:noStandardLongWork ? 0 : num(args.form.ttOk), tt_ng:noStandardLongWork ? 0 : num(args.form.ttNg),', '    actual_output:isCvkReport ? 0 : actualOutput, tt_ok:isCvkReport ? 0 : (noStandardLongWork ? 0 : num(args.form.ttOk)), tt_ng:isCvkReport ? 0 : (noStandardLongWork ? 0 : num(args.form.ttNg)),');
  submit = submit.replace('    note:args.form.note||"", extra_data:{...args.extraData, adjustment_count:num(args.form.adjustmentCount), execution_method:executionMethod}, defects:noStandardLongWork ? [] : defects, deductions, machine_lines:useMachineLinesPayload?lines:[],', '    note:args.form.note||"", extra_data:{...args.extraData, process_code:isCvkReport ? "CVK" : args.extraData?.process_code, non_product_work:isCvkReport ? true : args.extraData?.non_product_work, work_type:isCvkReport ? String((args.form as any).workType || "").trim() : args.extraData?.work_type, adjustment_count:num(args.form.adjustmentCount), execution_method:executionMethod}, defects:isCvkReport ? [] : (noStandardLongWork ? [] : defects), deductions, machine_lines:isCvkReport ? [] : (useMachineLinesPayload?lines:[]),');
  submitChanged = true;
}
if (submitChanged) fs.writeFileSync(submitPath, submit, 'utf8');

console.log('[KTC] CVK inline worker-form patch applied.');
