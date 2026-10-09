import { useEffect, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import AutocompleteInput from "../../../components/common/AutocompleteInput";
import type { AutocompleteOption } from "../../../components/common/AutocompleteInput";
import type { ProductStandardOption } from "../../../services/masterDataService";
import AppIcon from "../../../components/common/AppIcon";
import type { DeductionKey, DeductionState, FormState, MachineLineState, NgKey, OperationMode, OperationType } from "../processPageConfig";
import { MAX_TOTAL_WORK_MINUTES } from "../processFormUtils";

interface NgOption { key: NgKey; code: string; label: string; }
interface DeductionOption { key: DeductionKey; label: string; id?: number; code?: string; deduction_type_id?: number; deduction_name?: string; }
interface Props {
    form: FormState; setForm: Dispatch<SetStateAction<FormState>>; onFormChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
    isCutLongProcess: boolean; isInspectionProcess: boolean; isCvkMode: boolean; setIsCvkMode: Dispatch<SetStateAction<boolean>>; operationType: OperationType; setOperationType: Dispatch<SetStateAction<OperationType>>; operationMode: OperationMode; setOperationMode: Dispatch<SetStateAction<OperationMode>>;
    usesMultiMachineLines: boolean; usesSingleMachine: boolean; productAutocompleteOptions: AutocompleteOption[]; getMachineProductAutocompleteOptions: (machineCode: string) => AutocompleteOption[]; productOptions: ProductStandardOption[]; machineAutocompleteOptions: AutocompleteOption[]; machineOptions?: unknown[]; loadingMasterData: boolean; machineCount: number; maxMachineCount: number; machineLines: MachineLineState[]; resizeMachineLines: (count: number) => void; updateMachineLine: (index: number, patch: Partial<MachineLineState>) => void; refreshMachineLineStandard: (index: number, machineCode: string, productCode: string) => Promise<void>; getMachineNgTotal: (line: MachineLineState) => number; activeNgOptions: NgOption[]; activeDeductionOptions: DeductionOption[]; toggleMachineDefect: (lineIndex: number, key: string) => void; updateMachineDefectValue: (lineIndex: number, key: string, value: string) => void;
}
const GC_AUTOMATIC_MACHINE_CODES = new Set(["C5", "C6", "C7", "C11"]);
const CVK_WORK_TYPES = [{ value: "XUATNHAP", label: "Xuất nhập" }, { value: "KTCD", label: "Kiểm tra công đoạn" }, { value: "TAIPP", label: "Tái phế phẩm" }] as const;
const getMachineCode = (option: AutocompleteOption): string => option.value.trim().toUpperCase().replace(/^MÁY\s*/i, "");
const normalizeDefectCode = (value: unknown): string => String(value ?? "").trim().toUpperCase();
type CutExecutionMode = "AUTO" | "NON_AUTO";
type LongExecutionMode = "MANUAL" | "MACHINE";

export default function ProcessBasicInfoSection({ form, setForm, onFormChange, isCutLongProcess, isInspectionProcess, isCvkMode, setIsCvkMode, operationType, setOperationType, operationMode, setOperationMode, usesMultiMachineLines, usesSingleMachine, productAutocompleteOptions, getMachineProductAutocompleteOptions, productOptions, machineAutocompleteOptions, loadingMasterData, machineCount, maxMachineCount, machineLines, resizeMachineLines, updateMachineLine, refreshMachineLineStandard, getMachineNgTotal, activeNgOptions, activeDeductionOptions, toggleMachineDefect, updateMachineDefectValue }: Props) {
    const [longExecutionMode, setLongExecutionMode] = useState<LongExecutionMode>(operationMode === "MACHINE" ? "MACHINE" : "MANUAL");
    const [cutExecutionMode, setCutExecutionMode] = useState<CutExecutionMode>("AUTO");
    const [openMachineDeductionIndex, setOpenMachineDeductionIndex] = useState<number | null>(null);
    const [openMachineNgIndex, setOpenMachineNgIndex] = useState<number | null>(null);
    useEffect(() => { if (!isCutLongProcess || operationType !== "CUT") return; if (operationMode !== "MACHINE") setOperationMode("MACHINE"); }, [isCutLongProcess, operationType, operationMode, setOperationMode]);
    useEffect(() => { if (operationType !== "LONG") return; setLongExecutionMode(operationMode === "MACHINE" ? "MACHINE" : "MANUAL"); }, [operationMode, operationType]);

    // Cắt/Lồng + Máy: OK/NG của người luôn là tổng OK/NG của toàn bộ máy.
    // Đồng thời chạy khi mở form sửa để không giữ lại số tổng cũ/hard-code từ báo cáo.
    useEffect(() => {
        if (!isCutLongProcess || operationMode !== "MACHINE") return;
        const totalOk = machineLines.reduce((sum, line) => sum + Math.max(0, Number(line.okQuantity) || 0), 0);
        const totalNg = machineLines.reduce((sum, line) => sum + Math.max(0, Number(line.ngQuantity) || 0), 0);
        const totalOutput = totalOk + totalNg;
        setForm((prev) => {
            const nextOk = String(Math.trunc(totalOk));
            const nextNg = String(Math.trunc(totalNg));
            const nextOutput = String(Math.trunc(totalOutput));
            if (prev.ttOk === nextOk && prev.ttNg === nextNg && prev.actualOutput === nextOutput) return prev;
            return { ...prev, ttOk: nextOk, ttNg: nextNg, actualOutput: nextOutput };
        });
    }, [isCutLongProcess, operationMode, machineLines, setForm]);

    const setProduct = (value: string) => { const selectedProduct = productOptions.find((item) => item.product_code.trim().toLowerCase() === value.trim().toLowerCase()); setForm((prev) => ({ ...prev, productName: value, standardOutput: selectedProduct ? String(Number(selectedProduct.standard_output)) : "" })); };
    const handleCvkSelect = () => { setIsCvkMode(true); setForm((prev) => ({ ...prev, workType: "CVK", productName: "", standardOutput: "0", actualOutput: "0", ttOk: "0", ttNg: "0" })); setOperationType("LONG"); setOperationMode("MANUAL"); setLongExecutionMode("MANUAL"); };
    const handleOperationTypeChange = (nextType: OperationType) => { setIsCvkMode(false); setForm((prev) => ({ ...prev, workType: "", productName: "" })); setOperationType(nextType); if (nextType === "CUT") { setOperationMode("MACHINE"); setCutExecutionMode("AUTO"); setLongExecutionMode("MACHINE"); return; } setOperationMode("MANUAL"); setCutExecutionMode("AUTO"); setLongExecutionMode("MANUAL"); };
    const handleLongExecutionModeChange = (mode: LongExecutionMode) => { setLongExecutionMode(mode); setOperationMode(mode === "MANUAL" ? "MANUAL" : "MACHINE"); };
    const visibleGcMachineOptions = operationType === "CUT" ? cutExecutionMode === "AUTO" ? machineAutocompleteOptions.filter((option) => GC_AUTOMATIC_MACHINE_CODES.has(getMachineCode(option))) : machineAutocompleteOptions.filter((option) => !GC_AUTOMATIC_MACHINE_CODES.has(getMachineCode(option))) : machineAutocompleteOptions;
    const visibleMachineOptions = isCutLongProcess ? visibleGcMachineOptions : machineAutocompleteOptions;
    const visibleNgOptions = isCutLongProcess ? activeNgOptions.filter((item) => { const code = normalizeDefectCode(item.code); return operationType === "CUT" ? code.startsWith("CAT") : code.startsWith("LONG"); }) : activeNgOptions;
    const getDefectDisplayLabel = (item: NgOption): string => { const code = normalizeDefectCode(item.code); const label = String(item.label ?? "").trim(); if (!code) return label; if (label.toUpperCase().startsWith(`${code} `) || label.toUpperCase().startsWith(`${code} —`)) return label; return `${code} — ${label}`; };
    // Worker chỉ nhập "Thời gian chạy thực tế" (line.hours/line.minutes) và "Thời gian trừ"
    // (line.deductions, qua danh sách loại trừ giờ). "Tổng thời gian" không còn là input
    // trực tiếp: hệ thống luôn tự tính = thực tế + trừ, giống logic đã dùng ở
    // ProcessTimeDeductionSection.tsx cho báo cáo không có máy.
    const getMachineActualMinutes = (line: MachineLineState): number => (Number(line.hours) || 0) * 60 + (Number(line.minutes) || 0);
    const getMachineDeductionMinutes = (line: MachineLineState): number => Object.values(line.deductions || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    const getMachineGrossMinutes = (line: MachineLineState): number => getMachineActualMinutes(line) + getMachineDeductionMinutes(line);
    const updateMachineActualHours = (lineIndex: number, rawValue: string) => {
        const line = machineLines[lineIndex];
        if (!line) return;
        const value = rawValue.replace(/\D/g, "");
        if (value !== "" && Number(value) > 12) return;
        const hours = Number(value) || 0;
        const deductionMinutes = getMachineDeductionMinutes(line);
        const currentMinutes = hours === 12 ? 0 : Math.min(59, Number(line.minutes) || 0);
        if (hours * 60 + currentMinutes + deductionMinutes > MAX_TOTAL_WORK_MINUTES) return;
        updateMachineLine(lineIndex, { hours: value, minutes: hours === 12 ? "0" : line.minutes });
    };
    const updateMachineActualMinutes = (lineIndex: number, rawValue: string) => {
        const line = machineLines[lineIndex];
        if (!line) return;
        const value = rawValue.replace(/\D/g, "");
        if (value !== "" && Number(value) > 59) return;
        const hours = Number(line.hours) || 0;
        const minutes = Number(value) || 0;
        const deductionMinutes = getMachineDeductionMinutes(line);
        if (hours === 12 && minutes > 0) return;
        if (hours * 60 + minutes + deductionMinutes > MAX_TOTAL_WORK_MINUTES) return;
        updateMachineLine(lineIndex, { minutes: value });
    };
    const toggleMachineDeduction = (lineIndex: number, key: DeductionKey, checked: boolean) => {
        const line = machineLines[lineIndex];
        if (!line) return;
        const selected = checked
            ? Array.from(new Set([...(line.selectedDeductions || []), key]))
            : (line.selectedDeductions || []).filter((item) => item !== key);
        const deductions = { ...(line.deductions || {}) };
        if (checked) deductions[key] = deductions[key] || "";
        else delete deductions[key];
        const totalMinutes = Object.values(deductions).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
        updateMachineLine(lineIndex, {
            selectedDeductions: selected,
            deductions,
            adjustmentMinutes: String(totalMinutes),
        });
    };
    const updateMachineDeduction = (lineIndex: number, key: DeductionKey, rawValue: string) => {
        const line = machineLines[lineIndex];
        if (!line) return;
        const value = rawValue.replace(/\D/g, "");
        const actualMinutes = getMachineActualMinutes(line);
        const otherMinutes = Object.entries(line.deductions || {})
            .filter(([itemKey]) => itemKey !== key)
            .reduce((sum, [, raw]) => sum + Math.max(0, Number(raw) || 0), 0);
        if (value !== "" && actualMinutes + otherMinutes + Number(value) > MAX_TOTAL_WORK_MINUTES) return;
        const deductions = { ...(line.deductions || {}), [key]: value };
        const totalMinutes = Object.values(deductions).reduce((sum, item) => sum + Math.max(0, Number(item) || 0), 0);
        updateMachineLine(lineIndex, {
            deductions,
            adjustmentMinutes: String(totalMinutes),
        });
    };

    const cvkWorkerInlineStyle = <style className="cvk-worker-inline-style">{`.worker-operation-type-row{grid-template-columns:repeat(3,minmax(0,1fr))}.worker-operation-type-row button{width:100%;min-width:0}.worker-operation-type-row button::before,.worker-operation-type-row button::after{content:none!important;display:none!important}.worker-cvk-entry{display:grid;gap:12px}.worker-cvk-note textarea{width:100%;min-height:84px;resize:vertical;box-sizing:border-box;border:1px solid #c9dbf2;border-radius:10px;padding:10px 12px;font:inherit;color:inherit;background:#fff;outline:none}.worker-cvk-note textarea:focus{border-color:#4f94e8;box-shadow:0 0 0 2px rgba(79,148,232,.12)}`}</style>;
    return <section className="worker-form-card worker-form-card-basic">
        {cvkWorkerInlineStyle}
        <div className="worker-card-heading"><div className="worker-card-step">02</div><div><h2 className="worker-card-title"><span><AppIcon name="checklist" size={15} /></span> Sản phẩm &amp; máy</h2><p className="worker-card-subtitle">Chọn đúng dữ liệu trong danh mục. Không nhập mã tự do ngoài danh sách.</p></div></div>
        <div className="worker-basic-grid">
            <div className="worker-field-block worker-field-full worker-shift-block"><label className="worker-field-label">Ca làm việc <em>*</em></label><div className="worker-shift-list">{["A", "B", "C", "D"].map((shift) => <label key={shift} className="worker-shift-item"><input type="radio" name="shift" value={shift} checked={form.shift === shift} onChange={onFormChange} /><span>{shift}</span></label>)}</div></div>
            {isCutLongProcess && <div className="worker-mode-panel worker-field-full"><div className="worker-mode-group"><div className="worker-mode-label">Loại gia công</div><div className="worker-choice-row worker-operation-type-row"><button type="button" className={operationType === "CUT" && !isCvkMode ? "active" : ""} onClick={() => handleOperationTypeChange("CUT")}>Cắt</button><button type="button" className={operationType === "LONG" && !isCvkMode ? "active" : ""} onClick={() => handleOperationTypeChange("LONG")}>Lồng</button><button type="button" className={isCvkMode ? "active" : ""} onClick={handleCvkSelect}>Công việc khác</button></div></div>{!isCvkMode && <div className="worker-mode-group worker-execution-mode-group"><div className="worker-mode-label">Hình thức thực hiện</div>{operationType === "CUT" ? <div className="worker-choice-row"><button type="button" className={cutExecutionMode === "AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("AUTO"); setOperationMode("MACHINE"); }}>Tự động</button><button type="button" className={cutExecutionMode === "NON_AUTO" ? "active" : ""} onClick={() => { setCutExecutionMode("NON_AUTO"); setOperationMode("MACHINE"); }}>Không tự động</button></div> : <div className="worker-choice-row"><button type="button" className={longExecutionMode === "MANUAL" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MANUAL")}>Tay</button><button type="button" className={longExecutionMode === "MACHINE" ? "active" : ""} onClick={() => handleLongExecutionModeChange("MACHINE")}>Máy</button></div>}</div>}</div>}
            {isInspectionProcess && <div className="worker-mode-panel worker-field-full"><div className="worker-mode-group"><div className="worker-mode-label">Hình thức kiểm tra</div><div className="worker-choice-row"><button type="button" className={operationMode === "MANUAL" ? "active" : ""} onClick={() => setOperationMode("MANUAL")}>Tay</button><button type="button" className={operationMode === "MACHINE" ? "active" : ""} onClick={() => setOperationMode("MACHINE")}>Máy</button></div></div><div className="worker-mode-hint">Làm tay: chỉ chọn mã sản phẩm. Làm máy: chọn máy trước, sau đó chọn mã sản phẩm thuộc máy.</div></div>}
            {isCvkMode ? <div className="worker-cvk-entry worker-field-full"><div className="worker-selection-card"><div className="worker-selection-heading"><div><strong>Công việc</strong><span className="worker-required">*</span><small>Danh sách công việc không có định mức</small></div><span className="worker-selection-count">{CVK_WORK_TYPES.length} công việc</span></div><AutocompleteInput id="cvkWorkType" label="Công việc" selectOnly value={String(form.workType || "").toUpperCase() === "CVK" ? "" : String(form.workType || "")} options={CVK_WORK_TYPES} placeholder="Nhập hoặc chọn công việc" required disabled={loadingMasterData} emptyMessage="Chưa có danh sách công việc" onChange={(value) => setForm((prev) => ({ ...prev, workType: value, productName: "", standardOutput: "0", actualOutput: "0", ttOk: "0", ttNg: "0" }))} onSelect={(option) => setForm((prev) => ({ ...prev, workType: option.value, productName: "", standardOutput: "0", actualOutput: "0", ttOk: "0", ttNg: "0" }))} /></div><div className="worker-cvk-note"><label className="worker-field-label" htmlFor="cvkNote">Ghi chú</label><textarea id="cvkNote" name="note" rows={3} value={form.note || ""} onChange={onFormChange} placeholder="Nhập ghi chú cho công việc CVK (nếu có)" /></div></div> : !usesMultiMachineLines && !usesSingleMachine && <div className="worker-selection-card worker-field-full"><div className="worker-selection-heading"><div><strong>Mã sản phẩm</strong><span className="worker-required">*</span><small>Danh sách theo đúng công đoạn đang nhập</small></div><span className="worker-selection-count">{productAutocompleteOptions.length} mã</span></div><AutocompleteInput id="productName" label="Mã sản phẩm" value={form.productName} options={productAutocompleteOptions} placeholder={loadingMasterData ? "Đang tải danh mục sản phẩm…" : "Nhập hoặc chọn mã sản phẩm"} required disabled={loadingMasterData} emptyMessage="Danh mục sản phẩm đang trống. Hệ thống sẽ tự tải lại dữ liệu danh mục." onChange={setProduct} onSelect={(option) => setProduct(option.value)} /></div>}
            {usesMultiMachineLines ? <div className="worker-machine-workspace worker-field-full"><div className="worker-selection-heading"><div><strong>{isCutLongProcess ? "Danh sách máy & sản phẩm" : "Danh sách máy mài & sản phẩm"}</strong><small>Mỗi dòng = 1 máy + 1 mã sản phẩm + thời gian + sản lượng</small>{isCutLongProcess && <small>Shared machine: sản lượng được credit theo báo cáo; physical truth nằm ở production event riêng.</small>}</div><label className="worker-machine-count"><span>Số máy</span><select value={machineCount} onChange={(event) => resizeMachineLines(Number(event.target.value))}>{Array.from({ length: maxMachineCount }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}</option>)}</select></label></div>{isCutLongProcess && <div className="worker-machine-policy-note">Máy tự động: C5, C6, C7, C11. Các máy C còn lại: cắt không tự động.</div>}<div className="machine-lines-list">{machineLines.map((line, index) => <article className="machine-line" key={index}><div className="machine-card-header"><div className="machine-card-title-wrap"><span className="machine-card-number">{index + 1}</span><div><strong>Máy {index + 1}</strong><span>{line.machineCode || "Chưa chọn máy"}</span></div></div><span className="machine-card-badge">{line.productCode || "Chưa chọn SP"}</span></div><div className="machine-selection-grid"><AutocompleteInput id={`machineNo-${index}`} label="Mã máy" value={line.machineCode} options={visibleMachineOptions} placeholder="Chọn mã máy" required disabled={loadingMasterData} emptyMessage="Không tìm thấy máy trong chế độ đang chọn" onChange={(value) => updateMachineLine(index, { machineCode: value, productCode: "", standardOutputPerHour: 0, standardTimeSeconds: null, standardSource: null, standardError: "" })} onSelect={(option) => updateMachineLine(index, { machineCode: option.value, productCode: "", standardOutputPerHour: 0, standardTimeSeconds: null, standardSource: null, standardError: "" })} /><AutocompleteInput id={`machineProduct-${index}`} label="Mã sản phẩm" value={line.productCode} options={getMachineProductAutocompleteOptions(line.machineCode)} placeholder={line.machineCode.trim() ? "Chọn mã sản phẩm theo máy" : "Chọn máy trước"} required disabled={loadingMasterData || !line.machineCode.trim()} emptyMessage={line.machineCode.trim() ? "Không có mã sản phẩm phù hợp với máy này" : "Chọn máy trước để xem mã sản phẩm"} onChange={(value) => { updateMachineLine(index, { productCode: value }); void refreshMachineLineStandard(index, line.machineCode, value); }} onSelect={(option) => { updateMachineLine(index, { productCode: option.value }); void refreshMachineLineStandard(index, line.machineCode, option.value); }} /></div><div className="machine-data-grid"><div>
<div className="machine-section-title">Thời gian &amp; thời gian trừ</div>
<div className="worker-time-grid machine-worker-time-grid">
<div className="worker-time-item" data-worker-time="machine-actual">
<label>Thời gian chạy thực tế <span className="worker-time-required">*</span></label>
<div className="worker-time-split worker-time-parts">
<div className="worker-time-part"><span>Giờ</span><input data-machine-time-part="hours" type="number" min="0" max="12" step="1" inputMode="numeric" value={line.hours} onChange={(event) => updateMachineActualHours(index, event.target.value)} placeholder="0" /></div>
<div className="worker-time-part"><span>Phút</span><input data-machine-time-part="minutes" type="number" min="0" max="59" step="1" inputMode="numeric" value={line.minutes} disabled={Number(line.hours) >= 12 || getMachineActualMinutes(line) + getMachineDeductionMinutes(line) >= MAX_TOTAL_WORK_MINUTES} onChange={(event) => updateMachineActualMinutes(index, event.target.value)} placeholder="0" /></div>
</div>
<small>Nhập thời gian thực tế. Thời gian trừ cộng thêm để tính tổng, tổng không quá 12 giờ.</small>
</div>
<div className="worker-time-item worker-time-computed" data-worker-time="machine-deduction">
<label>Thời gian trừ</label>
<input data-worker-time-value="machine-deduction" value={String(getMachineDeductionMinutes(line))} readOnly aria-readonly="true" />
<small>{Math.floor(getMachineDeductionMinutes(line) / 60)} giờ {getMachineDeductionMinutes(line) % 60} phút</small>
</div>
<div className="worker-time-item worker-time-computed" data-worker-time="machine-total">
<label>Tổng thời gian</label>
<input data-worker-time-value="machine-total" value={`${Math.floor(getMachineGrossMinutes(line) / 60)}h ${getMachineGrossMinutes(line) % 60}p`} readOnly aria-readonly="true" />
<small>Thực tế + thời gian trừ · tối đa 12 giờ</small>
</div>
</div>
<div className="machine-quantity-section">
<div className="machine-section-title">Sản lượng máy</div>
<div className="machine-quantity-row machine-worker-quantity-row">
<label className="machine-quantity-item machine-quantity-ok"><span>OK</span><input type="number" min="0" inputMode="numeric" value={line.okQuantity} onChange={(event) => updateMachineLine(index, { okQuantity: event.target.value.replace(/\D/g, "") })} placeholder="0" /></label>
<label className="machine-quantity-item machine-quantity-ng"><span>NG</span><input type="number" min="0" inputMode="numeric" value={line.ngQuantity} readOnly aria-readonly="true" title="Tự động tính từ chi tiết lỗi NG" placeholder="0" /></label>
</div>
</div>
<div className="machine-detail-dropdown-row"><div className="machine-detail-dropdown-item"><div className="worker-dropdown-box machine-worker-deduction-box">
<button type="button" className="worker-dropdown-title" onClick={() => setOpenMachineDeductionIndex((current) => current === index ? null : index)} aria-expanded={openMachineDeductionIndex === index}>
<span className="worker-dropdown-title-main"><span>⏱ Thời gian trừ</span><small>{line.selectedDeductions?.length ? `${line.selectedDeductions.length} loại · ${getMachineDeductionMinutes(line)} phút` : "Không có thời gian trừ"}</small></span>
<span aria-hidden="true">▼</span>
</button>
{openMachineDeductionIndex === index && <div className="worker-dropdown-options">
{activeDeductionOptions.length === 0 ? <div className="worker-dropdown-empty" role="status">Chưa có loại thời gian trừ được cấu hình cho công đoạn này.</div> : activeDeductionOptions.map((item) => (
<label key={item.key} className="worker-dropdown-option">
<input type="checkbox" checked={line.selectedDeductions?.includes(item.key) || false} onChange={(event) => toggleMachineDeduction(index, item.key, event.target.checked)} />
<span>{item.label}</span>
</label>
))}
</div>}
</div>
</div><div className="machine-detail-dropdown-item"><div className="worker-dropdown-box machine-worker-ng-box">
<button type="button" className="worker-dropdown-title" onClick={() => setOpenMachineNgIndex((current) => current === index ? null : index)} aria-expanded={openMachineNgIndex === index}>
<span className="worker-dropdown-title-main"><span>Chi tiết lỗi NG</span><small>{getMachineNgTotal(line) > 0 ? `${line.selectedDefects.length} loại · ${getMachineNgTotal(line)} NG` : "Không có NG"}</small></span>
<span aria-hidden="true">{openMachineNgIndex === index ? "▲" : "▼"}</span>
</button>
{openMachineNgIndex === index && <div className="worker-dropdown-options">
{visibleNgOptions.length === 0 ? <div className="worker-dropdown-empty" role="status">Chưa có loại lỗi NG được cấu hình cho công đoạn này.</div> : visibleNgOptions.map((item) => (
<label key={item.key} className="worker-dropdown-option">
<input type="checkbox" className="worker-ng-checkbox" checked={line.selectedDefects.includes(item.key)} onChange={() => toggleMachineDefect(index, item.key)} />
<span>{getDefectDisplayLabel(item)}</span>
</label>
))}
</div>}
</div>
</div></div>
{line.selectedDeductions?.length > 0 && <div className="worker-dynamic-grid worker-deduction-detail-grid machine-worker-deduction-detail-grid">
{activeDeductionOptions.filter((item) => line.selectedDeductions.includes(item.key)).map((item) => (
<div key={item.key} className="worker-field-block">
<label className="worker-field-label" htmlFor={`machine-${index}-${String(item.key)}`}>{item.label}</label>
<div className="worker-deduction-input-row">
<input id={`machine-${index}-${String(item.key)}`} className="worker-text-input worker-deduction-input" type="number" min="0" inputMode="numeric" value={line.deductions?.[item.key] || ""} onChange={(event) => updateMachineDeduction(index, item.key, event.target.value)} placeholder="Phút" autoComplete="off" />
<span className="worker-time-unit" aria-hidden="true">phút</span>
</div>
{item.key === "chinhMay" && <div className="worker-field-block worker-adjustment-count-inline">
<label className="worker-field-label" htmlFor={`machine-${index}-adjustmentCount`}>Số lần chỉnh máy</label>
<div className="worker-deduction-input-row">
<input id={`machine-${index}-adjustmentCount`} className="worker-text-input worker-deduction-input" type="number" min="0" inputMode="numeric" value={line.adjustmentCount || ""} onChange={(event) => updateMachineLine(index, { adjustmentCount: event.target.value.replace(/\D/g, "") })} placeholder="0" autoComplete="off" />
<span className="worker-time-unit" aria-hidden="true">lần</span>
</div>
</div>}
</div>
))}
</div>}
{line.selectedDefects.length > 0 && <div className="worker-dynamic-grid worker-ng-grid machine-worker-ng-detail-grid">
{visibleNgOptions.filter((item) => line.selectedDefects.includes(item.key)).map((item) => (
<div key={item.key} className="worker-field-block">
<label className="worker-field-label" htmlFor={`machine-ng-${index}-${item.key}`}>{getDefectDisplayLabel(item)}</label>
<input id={`machine-ng-${index}-${item.key}`} className="worker-text-input" name={item.key} value={line.defects[item.key] || ""} onChange={(event) => updateMachineDefectValue(index, item.key, event.target.value.replace(/\D/g, ""))} inputMode="numeric" autoComplete="off" placeholder="Số lượng" />
</div>
))}
</div>}</div></div></article>)}</div></div> : usesSingleMachine ? <div className="worker-machine-single worker-field-full"><div className="worker-selection-heading"><div><strong>Máy &amp; sản phẩm</strong><small>Chọn máy trước → hệ thống chỉ hiển thị mã sản phẩm hợp lệ của máy</small></div></div><div className="worker-single-machine-grid"><AutocompleteInput id="machineNo" label="Mã máy" value={form.machineNo} options={visibleMachineOptions} placeholder="Chọn mã máy" required disabled={loadingMasterData} emptyMessage="Không tìm thấy máy trong công đoạn" onChange={(value) => setForm((prev) => ({ ...prev, machineNo: value, productName: "", standardOutput: "" }))} onSelect={(option) => setForm((prev) => ({ ...prev, machineNo: option.value, productName: "", standardOutput: "" }))} /><AutocompleteInput id="productName" label="Mã sản phẩm" value={form.productName} options={getMachineProductAutocompleteOptions(form.machineNo)} placeholder={form.machineNo.trim() ? "Nhập hoặc chọn mã sản phẩm" : "Chọn máy trước"} required disabled={loadingMasterData || !form.machineNo.trim()} emptyMessage={form.machineNo.trim() ? "Không có mã sản phẩm phù hợp với máy này" : "Chọn máy trước để xem mã sản phẩm"} onChange={setProduct} onSelect={(option) => setProduct(option.value)} /></div></div> : null}
        </div>
    </section>;
}
