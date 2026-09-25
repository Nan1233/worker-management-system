import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getReportById, updateTempReport } from "../../services/productionService";
import { resolveProductStandard } from "../../services/masterDataService";
import type { ProductionReport } from "../../types/production";
import { getProcessCapabilities, usesMultiMachineLines as resolveMultiMachine, usesSingleMachine as resolveSingleMachine } from "./processPageDomain";
import { useProcessMasterData } from "./useProcessMasterData";
import { createEmptyMachineLine, getWorkerAllowedWorkDates, initialDeduction, initialForm, type DeductionState, type FormState, type MachineLineState, type NgKey } from "./processPageConfig";
import { buildProductionReportPayload } from "./processReportSubmission";
import { filterProductsForSelection, toProductAutocompleteOptions } from "./productSuggestionRules";
import { getCachedResolvedProductStandard } from "../../services/productStandardRequestCache";
import { formatIntegerDisplay, MAX_TOTAL_WORK_MINUTES, parseFlexibleTime } from "./processFormUtils";
import { getMachineNgTotal, getMaxMachineCount, toggleMachineDefectLine, updateMachineDefectLine } from "./processMachineLines";
import { getProcessExtraFields } from "./processExtraFields";
import ProcessWorkerHeader from "./components/ProcessWorkerHeader";
import ProcessBasicInfoSection from "./components/ProcessBasicInfoSection";
import ProcessQualitySection from "./components/ProcessQualitySection";
import ProcessTimeDeductionSection from "./components/ProcessTimeDeductionSection";
import ProcessExtraFieldsSection from "./components/ProcessExtraFieldsSection";

const n = (v: unknown) => Number(v || 0);
const s = (v: unknown) => String(v ?? "");
const hm = (value: number) => {
  const minutes = Math.max(0, Math.round(n(value) * 60));
  return { hours: String(Math.floor(minutes / 60)), minutes: String(minutes % 60) };
};
const parseDbDateMs = (value?: string | null) => {
  if (!value) return NaN;
  const text = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text) ? text.replace(" ", "T") + "Z" : text;
  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? parsed : NaN;
};
const slug = (code?: string | null) => ({ GC: "cat-long", MAI: "mai", DO: "do", K1: "kiem-1", K2: "kiem-2", CAN: "can", EP: "ep", XLBV: "bavia", SX3: "sx3", CVK: "cvk" } as Record<string, string>)[s(code).trim().toUpperCase()] || "cat-long";
const machineCodes = new Set(["GC", "MAI", "DO", "EP", "CAN"]);

function WorkerReportEditV2() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState<any>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [deductions, setDeductions] = useState<DeductionState>(initialDeduction);
  const [selectedNg, setSelectedNg] = useState<NgKey[]>([]);
  const [selectedDeduction, setSelectedDeduction] = useState<string[]>([]);
  const [machineLines, setMachineLines] = useState<MachineLineState[]>([createEmptyMachineLine()]);
  const [extraData, setExtraData] = useState<Record<string, string>>({});
  const [operationType, setOperationType] = useState<"CUT" | "LONG">("CUT");
  const [operationMode, setOperationMode] = useState<"MANUAL" | "MACHINE">("MANUAL");
  const [loading, setLoading] = useState(true);
  const [loadingMasterData, setLoadingMasterData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [showNg, setShowNg] = useState(false);
  const [showDeduction, setShowDeduction] = useState(false);
  const [workType, setWorkType] = useState("Công việc khác");

  const process = slug(report?.process_code);
  const capabilities = useMemo(() => getProcessCapabilities(process), [process]);
  const processId = Number(report?.process_id) > 0 ? Number(report.process_id) : (capabilities.processCode === "CVK" ? 60006 : 0);
  const { machineOptions, productOptions, activeNgOptions, activeDeductionOptions, loadingMasterData: masterLoading } = useProcessMasterData(processId, capabilities.processCode);
  useEffect(() => setLoadingMasterData(masterLoading), [masterLoading]);

  const sourceDefects = useMemo(() => Array.isArray(report?.defects) ? report.defects : Array.isArray(report?.defect_items) ? report.defect_items : [], [report]);
  const sourceDeductions = useMemo(() => Array.isArray(report?.deductions) ? report.deductions : Array.isArray(report?.deduction_items) ? report.deduction_items : [], [report]);
  const sourceLines = useMemo(() => Array.isArray(report?.machine_lines) ? report.machine_lines : Array.isArray(report?.machineLines) ? report.machineLines : [], [report]);

  const editNgOptions = useMemo(() => {
    const result = [...activeNgOptions] as any[];
    const seen = new Set(result.map((x: any) => String(x.key || x.code || x.label).toUpperCase()));
    sourceDefects.forEach((d: any, index: number) => {
      const code = s(d.defect_code).trim();
      const label = s(d.defect_name || d.defect_label || code || `Lỗi ${index + 1}`).trim();
      const key = code ? `legacy_ng_${code.toUpperCase()}` : `legacy_ng_${label.toUpperCase().replace(/\W+/g, "_")}`;
      if (!seen.has(key.toUpperCase())) {
        result.push({ key, id: d.defect_type_id, code: code || key, label: code ? `${code} — ${label}` : label });
        seen.add(key.toUpperCase());
      }
    });
    return result;
  }, [activeNgOptions, sourceDefects]);

  const editDeductionOptions = useMemo(() => {
    const result = [...activeDeductionOptions] as any[];
    const seen = new Set(result.map((x: any) => String(x.key || x.code || x.label).toUpperCase()));
    sourceDeductions.forEach((d: any, index: number) => {
      const code = s(d.deduction_code).trim();
      const label = s(d.deduction_name || d.deduction_label || code || `Trừ giờ ${index + 1}`).trim();
      const key = code ? `legacy_deduction_${code.toUpperCase()}` : `legacy_deduction_${label.toUpperCase().replace(/\W+/g, "_")}`;
      if (!seen.has(key.toUpperCase())) result.push({ key, id: d.deduction_type_id, code: code || key, label });
    });
    return result;
  }, [activeDeductionOptions, sourceDeductions]);

  const editMachineOptions = useMemo(() => {
    const result = [...machineOptions] as any[];
    const seen = new Set(result.map((m: any) => s(m.machine_code).trim().toUpperCase()));
    const add = (code: unknown, machineId?: unknown) => {
      const value = s(code).trim();
      if (!value || seen.has(value.toUpperCase())) return;
      result.push({ id: Number(machineId) || -(result.length + 1), machine_code: value, machine_name: value });
      seen.add(value.toUpperCase());
    };
    sourceLines.forEach((line: any) => add(line.machine_code, line.machine_id));
    s(report?.machine_no).split(",").forEach((value) => add(value));
    return result;
  }, [machineOptions, sourceLines, report]);

  const editProductOptions = useMemo(() => {
    const result = [...productOptions] as any[];
    const seen = new Set(result.map((p: any) => s(p.product_code).trim().toUpperCase()));
    const add = (code: unknown) => {
      const value = s(code).trim();
      if (!value || seen.has(value.toUpperCase())) return;
      result.push({ id: -(result.length + 1), product_code: value, product_name: value, standard_output: Number(report?.standard_output || 0) });
      seen.add(value.toUpperCase());
    };
    sourceLines.forEach((line: any) => add(line.product_code));
    s(report?.product_name).split(",").forEach(add);
    return result;
  }, [productOptions, sourceLines, report]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const reportId = Number(id);
        if (!Number.isInteger(reportId) || reportId <= 0) throw new Error("ID báo cáo không hợp lệ.");
        const raw = await getReportById(reportId, "pending");
        const data: any = (raw as any)?.report || (raw as any)?.data || raw;
        if (!data) throw new Error("Không tìm thấy báo cáo.");
        if (!alive) return;
        setReport(data);
        const actual = hm(data.actual_time);
        const total = hm(data.total_time);
        const deduction = hm(data.deduction_time);
        const firstLine = (Array.isArray(data.machine_lines) ? data.machine_lines : Array.isArray(data.machineLines) ? data.machineLines : [])[0];
        const nextForm: FormState = {
          ...initialForm,
          workDate: s(data.work_date).slice(0, 10), shift: s(data.shift || "A"),
          workerCode: s(data.worker_code), workerName: s(data.full_name || data.worker_name),
          trainingPercent: s(data.training_percent_snapshot ?? data.training_percent ?? data.hv_percent ?? ""),
          machineNo: s(data.machine_no).split(",")[0].trim() || s(firstLine?.machine_code),
          productName: s(data.product_name).split(",")[0].trim() || s(firstLine?.product_code),
          standardOutput: s(data.standard_output), actualOutput: s(data.actual_output), ttOk: s(data.tt_ok), ttNg: s(data.tt_ng),
          totalTime: `${total.hours}:${total.minutes}`, actualTime: `${actual.hours}:${actual.minutes}`, actualHours: actual.hours, actualMinutes: actual.minutes,
          deductionTime: `${deduction.hours}:${deduction.minutes}`, adjustmentCount: s(data.extra_data?.adjustment_count ?? data.adjustment_count ?? ""), note: s(data.note || data.notes),
          kqdDapLai: s(data.kqd_dap_lai), kqdTuot: s(data.kqd_tuot), voDoLong: s(data.vo_do_long), xuocDoLong: s(data.xuoc_do_long), congGay: s(data.cong_gay), xoay: s(data.xoay), khongDut: s(data.khong_dut), baviaHut: s(data.bavia_hut), ppcm: s(data.ppcm), loiCaoSu: s(data.loi_cao_su), ngKichThuoc: s(data.ng_kich_thuoc), catLem: s(data.cat_lem), executionMethod: s(data.extra_data?.execution_method || data.execution_method || "AUTO")
        };
        setForm(nextForm);
        setOperationType(data.operation_type === "LONG" ? "LONG" : "CUT");
        setOperationMode(data.operation_mode === "MACHINE" || (Array.isArray(data.machine_lines) ? data.machine_lines.length : Array.isArray(data.machineLines) ? data.machineLines.length : 0) > 0 ? "MACHINE" : "MANUAL");
        setWorkType(s(data.extra_data?.work_type || data.work_type || "Công việc khác"));
        setExtraData(Object.fromEntries(Object.entries(data.extra_data || {}).filter(([key]) => key !== "adjustment_count" && key !== "work_type").map(([key, value]) => [key, value == null ? "" : String(value)])));
      } catch (e: any) {
        if (alive) setError(e?.response?.data?.message || e?.message || "Không tải được báo cáo.");
      } finally { if (alive) setLoading(false); }
    };
    void load();
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    if (!report?.created_at) return;
    const tick = () => { const created = parseDbDateMs(report.created_at); setRemaining(Number.isFinite(created) ? Math.max(0, created + 600000 - Date.now()) : 0); };
    tick(); const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer);
  }, [report?.created_at]);

  const findNgKey = (item: any) => editNgOptions.find((o: any) => Number(o.id) === Number(item.defect_type_id) || (s(o.code).trim() && s(o.code).toUpperCase() === s(item.defect_code).toUpperCase()) || s(o.label).trim() === s(item.defect_name).trim())?.key;
  const findDeductionKey = (item: any) => editDeductionOptions.find((o: any) => Number(o.id) === Number(item.deduction_type_id) || (s(o.code).trim() && s(o.code).toUpperCase() === s(item.deduction_code).toUpperCase()) || s(o.label).trim() === s(item.deduction_name).trim())?.key;

  useEffect(() => {
    if (!report) return;
    setForm((current) => {
      const next = { ...current };
      const selected: string[] = [];
      sourceDefects.forEach((d: any) => { const key = findNgKey(d); if (key) { next[key] = s(d.quantity ?? 0); selected.push(key); } });
      setSelectedNg(selected);
      return next;
    });
    setMachineLines(sourceLines.map((line: any) => {
      const lineDefects = Array.isArray(line.defects) ? line.defects : [];
      const defects: Record<string, string> = {};
      const selectedDefects: string[] = [];
      lineDefects.forEach((d: any) => { const key = findNgKey(d); if (key) { defects[key] = s(d.quantity ?? 0); selectedDefects.push(key); } });
      const time = hm(line.machine_time_hours);
      return { ...createEmptyMachineLine(), machineCode: s(line.machine_code), productCode: s(line.product_code), hours: time.hours, minutes: time.minutes, adjustmentMinutes: s(line.adjustment_minutes ?? ""), adjustmentCount: s(line.adjustment_count ?? ""), okQuantity: s(line.ok_quantity ?? ""), ngQuantity: s(line.ng_quantity ?? ""), standardOutputPerHour: n(line.standard_output), standardTimeSeconds: line.standard_time_seconds ?? null, standardSource: line.standard_source || null, selectedDefects, defects, machineEventId: line.machine_event_id ?? null } as any;
    }));
    setDeductions((current) => {
      const next: DeductionState = { ...current };
      const selected: string[] = [];
      sourceDeductions.forEach((d: any) => { const key = findDeductionKey(d); const minutes = d.minutes ?? d.deduction_minutes ?? n(d.hours) * 60; if (key) { next[key] = String(Math.round(n(minutes))); selected.push(key); } });
      setSelectedDeduction(selected);
      return next;
    });
  }, [report, sourceDefects, sourceDeductions, sourceLines, editNgOptions, editDeductionOptions]);

  const updateForm = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const onFormChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => updateForm(event.target.name || event.target.id, event.target.value);
  const updateLine = (index: number, patch: Partial<MachineLineState>) => setMachineLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  const toggleMachineDefect = (index: number, key: string) => setMachineLines((current) => current.map((line, i) => i === index ? toggleMachineDefectLine(line, key) : line));
  const updateMachineDefectValue = (index: number, key: string, value: string) => setMachineLines((current) => current.map((line, i) => i === index ? updateMachineDefectLine(line, key, value) : line));
  const machineCount = Math.max(1, machineLines.length);
  const maxMachineCount = getMaxMachineCount(capabilities.processCode, machineLines, editMachineOptions);
  const resizeMachineLines = (count: number) => setMachineLines((current) => Array.from({ length: Math.max(1, Math.min(maxMachineCount, count)) }, (_, i) => current[i] || createEmptyMachineLine()));
  const usesMultiMachineLines = resolveMultiMachine(capabilities, operationMode);
  const usesSingleMachine = resolveSingleMachine(capabilities, operationMode);
  const machineAutocompleteOptions = editMachineOptions.map((m: any) => ({ value: s(m.machine_code), label: s(m.machine_code) }));
  const getMachineProductOptions = (machineCode: string) => filterProductsForSelection({ products: editProductOptions, mode: "MACHINE", machineCode, machineOptions: editMachineOptions, useEncodedMachineSuffix: capabilities.processCode === "GC" });
  const getMachineProductAutocompleteOptions = (machineCode: string) => toProductAutocompleteOptions(getMachineProductOptions(machineCode));
  const refreshMachineLineStandard = async (index: number, machineCode: string, productCode: string) => {
    if (!machineCode.trim() || !productCode.trim()) { updateLine(index, { standardOutputPerHour: 0, standardTimeSeconds: null, standardSource: null, standardLoading: false, standardError: "" }); return; }
    updateLine(index, { standardLoading: true, standardError: "" });
    try {
      const resolved = await getCachedResolvedProductStandard(processId, machineCode.trim(), productCode.trim(), () => resolveProductStandard(processId, machineCode.trim(), productCode.trim(), form.workDate));
      const output = n(resolved.resolved_output_per_hour);
      updateLine(index, { standardOutputPerHour: output, standardTimeSeconds: resolved.standard_time_seconds, standardSource: resolved.standard_source, standardLoading: false, standardError: output > 0 ? "" : "Định mức bằng 0" });
    } catch (e: any) { updateLine(index, { standardLoading: false, standardError: e?.response?.data?.message || e?.message || "Không lấy được định mức" }); }
  };

  const syncDeductionTime = (next: DeductionState) => {
    const minutes = Object.values(next).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    setForm((current) => ({ ...current, deductionTime: `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}` }));
  };
  const toggleDeduction = (key: string, checked: boolean) => setSelectedDeduction((current) => checked ? Array.from(new Set([...current, key])) : current.filter((item) => item !== key));
  const updateDeduction = (key: string, value: string) => setDeductions((current) => { const next = { ...current, [key]: value.replace(/\D/g, "") }; syncDeductionTime(next); return next; });
  const normalizeDeduction = (key: string) => updateDeduction(key, String(Math.min(720, Math.max(0, Number(deductions[key] || 0)))));
  const warning = (message: string) => setError(message);

  const recalcQuality = (next: FormState) => {
    const ng = editNgOptions.reduce((sum: number, item: any) => sum + Math.max(0, Math.trunc(n(next[item.key]))), 0);
    return { ...next, ttNg: String(ng), actualOutput: String(Math.max(0, Math.trunc(n(next.ttOk))) + ng) };
  };
  const toggleNg = (key: NgKey, checked: boolean) => setSelectedNg((current) => checked ? Array.from(new Set([...current, key])) : current.filter((item) => item !== key));
  const updateNg = (key: NgKey, value: string) => setForm((current) => recalcQuality({ ...current, [key]: value.replace(/\D/g, "") }));
  const onTtOkChange = (event: ChangeEvent<HTMLInputElement>) => setForm((current) => recalcQuality({ ...current, ttOk: event.target.value.replace(/\D/g, "") }));
  const onNumberBlur = () => setForm((current) => recalcQuality(current));

  const save = async () => {
    if (!report || remaining <= 0) return;
    setError("");
    const actualHours = n(form.actualHours) + n(form.actualMinutes) / 60;
    const deductionHours = parseFlexibleTime(form.deductionTime);
    const totalHours = actualHours + (Number.isFinite(deductionHours) ? deductionHours : 0);
    if (totalHours * 60 > MAX_TOTAL_WORK_MINUTES + 0.001) { setError("Tổng thời gian không được vượt quá 12 giờ."); return; }
    const normalizedLines = operationMode === "MACHINE" ? machineLines.filter((line) => line.machineCode.trim() || line.productCode.trim()) : [];
    if (operationMode === "MACHINE" && (!normalizedLines.length || normalizedLines.some((line) => !line.machineCode.trim() || !line.productCode.trim()))) { setError("Vui lòng nhập đủ mã máy và mã sản phẩm cho từng máy."); return; }
    const payload = buildProductionReportPayload({
      clientRequestId: null, processId: report.process_id, form: { ...form, actualTime: `${form.actualHours}:${form.actualMinutes}`, deductionTime: form.deductionTime, totalTime: `${Math.floor(totalHours)}:${String(Math.round((totalHours % 1) * 60)).padStart(2, "0")}` },
      extraData, operationType, isCutLongProcess: capabilities.isCutLongProcess, usesAnyMachine: operationMode === "MACHINE", usesMultiMachineLines, usesSingleMachine,
      machineLines: normalizedLines, machineOptions: editMachineOptions, productOptions: editProductOptions, activeNgOptions: editNgOptions, deductions, activeDeductionOptions: editDeductionOptions,
      excludeKqdFromTt: Number(report.exclude_kqd_from_tt ?? report.exclude_kqd_from_tt_snapshot ?? 0) === 1,
    });
    payload.updated_at = report.updated_at;
    payload.expected_updated_at = report.updated_at;
    try { setSaving(true); await updateTempReport(Number(report.id), payload); navigate(`/worker/history/${report.id}`, { replace: true }); }
    catch (e: any) { setError(e?.response?.data?.message || e?.response?.data?.errors?.machine_lines || "Không thể lưu thay đổi."); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="detail-container"><div className="detail-state">Đang tải biểu mẫu sửa...</div></div>;
  if (!report) return <div className="detail-container"><div className="detail-state error">{error || "Không tìm thấy báo cáo."}</div></div>;
  const remainingSeconds = Math.ceil(remaining / 1000);
  const timeText = `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`;
  const processTitle = `Sửa báo cáo · ${report.process_name || capabilities.processCode}`;
  const extraFields = getProcessExtraFields(process);

  return <div className="ktc-page">
    <ProcessWorkerHeader processTitle={processTitle} workerName={form.workerName} workerCode={form.workerCode} trainingPercent={form.trainingPercent} workDate={form.workDate} dateOptions={getWorkerAllowedWorkDates()} onBack={() => navigate(-1)} onDateChange={(e) => updateForm("workDate", e.target.value)} />
    <main className="worker-form-container">
      <div className="worker-form-card" style={{ marginBottom: 12 }}><strong>Chỉnh sửa trong 10 phút · còn {timeText}</strong><span style={{ marginLeft: 10 }}>{loadingMasterData ? "Đang tải danh mục..." : "Đã tải dữ liệu báo cáo"}</span></div>
      {error && <div className="worker-form-card" style={{ color: "#b42318", marginBottom: 12 }}>{error}</div>}

      <ProcessBasicInfoSection
        form={form} setForm={setForm} onFormChange={onFormChange}
        isCutLongProcess={capabilities.isCutLongProcess} isInspectionProcess={capabilities.isInspectionProcess}
        operationType={operationType} setOperationType={setOperationType} operationMode={operationMode} setOperationMode={setOperationMode}
        usesMultiMachineLines={usesMultiMachineLines} usesSingleMachine={usesSingleMachine}
        productAutocompleteOptions={toProductAutocompleteOptions(editProductOptions)} getMachineProductAutocompleteOptions={getMachineProductAutocompleteOptions}
        productOptions={editProductOptions as any} machineAutocompleteOptions={machineAutocompleteOptions} machineOptions={editMachineOptions} loadingMasterData={loadingMasterData}
        machineCount={machineCount} maxMachineCount={maxMachineCount} machineLines={machineLines} resizeMachineLines={resizeMachineLines} updateMachineLine={updateLine}
        refreshMachineLineStandard={refreshMachineLineStandard} getMachineNgTotal={getMachineNgTotal} activeNgOptions={editNgOptions as any}
        toggleMachineDefect={toggleMachineDefect} updateMachineDefectValue={updateMachineDefectValue}
      />

      {report.process_code === "CVK" && <section className="worker-form-card"><h2 className="worker-card-title">Thông tin công việc</h2><div className="worker-basic-grid"><div className="worker-field-block"><label className="worker-field-label">Loại công việc</label><select className="worker-text-input" value={workType} onChange={(e) => setWorkType(e.target.value)}><option>Xuất nhập</option><option>Hỗ trợ</option><option>Kho</option><option>Vệ sinh</option><option>Công việc khác</option></select></div></div></section>}

      {!report.process_code || report.process_code !== "CVK" ? <ProcessQualitySection form={form} activeNgOptions={editNgOptions as any} selectedNg={selectedNg} showNg={showNg} setShowNg={setShowNg} usesMultiMachineLines={usesMultiMachineLines} formatIntegerDisplay={formatIntegerDisplay} onTtOkChange={onTtOkChange} onNumberBlur={onNumberBlur} onToggleNg={toggleNg} onNgValue={updateNg} /> : null}

      <ProcessTimeDeductionSection form={form} setForm={setForm} deductions={deductions} activeDeductionOptions={editDeductionOptions as any} selectedDeduction={selectedDeduction} showDeduction={showDeduction} setShowDeduction={setShowDeduction} onToggleDeduction={toggleDeduction} onUpdateDeduction={updateDeduction} onNormalizeDeduction={normalizeDeduction} onWarning={warning} />

      {extraFields.length > 0 && <ProcessExtraFieldsSection fields={extraFields} extraData={extraData} setExtraData={setExtraData} />}
      {Object.keys(extraData).some((key) => !extraFields.some((field) => field.key === key)) && <section className="worker-form-card"><h2 className="worker-card-title">Thông tin bổ sung</h2><div className="worker-basic-grid">{Object.entries(extraData).filter(([key]) => !extraFields.some((field) => field.key === key)).map(([key, value]) => <div className="worker-field-block" key={key}><label className="worker-field-label">{key}</label><input className="worker-text-input" value={value} onChange={(e) => setExtraData((current) => ({ ...current, [key]: e.target.value }))} /></div>)}</div></section>}

      <section className="worker-form-card"><h2 className="worker-card-title">Ghi chú</h2><textarea className="worker-text-input" rows={3} value={form.note} onChange={(e) => updateForm("note", e.target.value)} /></section>
      <div className="worker-action-group"><div className="worker-action-copy"><strong>{saving ? "Đang lưu thay đổi" : "Sẵn sàng lưu báo cáo"}</strong><span>{saving ? "Vui lòng chờ..." : `Còn ${timeText} để sửa báo cáo.`}</span></div><div className="worker-action-buttons"><button type="button" className="worker-reset-button" onClick={() => navigate(-1)} disabled={saving}>Hủy</button><button type="button" className="worker-floating-save" onClick={() => void save()} disabled={saving || remaining <= 0}>{saving ? "Đang lưu..." : remaining <= 0 ? "Hết thời gian sửa" : "Lưu thay đổi"}</button></div></div>
    </main>
  </div>;
}

export default WorkerReportEditV2;
