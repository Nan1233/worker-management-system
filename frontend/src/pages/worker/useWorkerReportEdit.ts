import { resolveCutExecutionMode } from "./cutExecutionMode.js";
import { getWorkerEditWindow, WORKER_EDIT_TIME_LIMIT_ENABLED, formatRemaining } from "./reportEditWindow";
import { validateMachineLines } from "./processPageValidation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getReportById, updateReport, updateTempReport } from "../../services/productionService";
import { resolveProductStandard } from "../../services/masterDataService";
import type { ProductionReport } from "../../types/production";
import { getApiError } from "../../utils/apiError";
import type { MachineOption, ProductStandardOption } from "../../services/masterDataService";
import type { WorkerMasterOption } from "./processMasterDataNormalization";
import type { ReportEditDefect, ReportEditDeduction, ReportEditMachineLine, ReportEditRecord } from "./reportEditTypes";
import { getReportEditLineDeductions, getReportEditMachineDeductionIssue, unwrapReportEditResponse } from "./reportEditTypes";
import { getStoredUser } from "../../utils/authStorage";
import { getCanonicalProcessId } from "../../utils/processAccess";
import { getProcessCapabilities, usesMultiMachineLines as resolveMultiMachine, usesSingleMachine as resolveSingleMachine } from "./processPageDomain";
import { getWorkerDeclaredDefects } from "../../utils/workerDeclaredDefects";
import { detectIncompleteMachineData } from "../../utils/machineLinesIntegrity";
import { buildApprovedMachineNotePatch, isApprovedMachineReport } from "../../utils/approvedMachineEditPatch";
import { useProcessMasterData } from "./useProcessMasterData";
import { createEmptyMachineLine, getWorkerAllowedWorkDates, initialDeduction, initialForm, type DeductionState, type FormState, type MachineLineState, type NgKey } from "./processPageConfig";
import { buildProductionReportPayload } from "./processReportSubmission";
import { filterProductsForSelection, toProductAutocompleteOptions } from "./productSuggestionRules";
import { getCachedResolvedProductStandard } from "../../services/productStandardRequestCache";
import { formatIntegerDisplay, MAX_TOTAL_WORK_MINUTES, parseFlexibleTime } from "./processFormUtils";
import { getMachineNgTotal, getMaxMachineCount, toggleMachineDefectLine, updateMachineDefectLine } from "./processMachineLines";

const n = (v: unknown) => Number(v || 0);
const s = (v: unknown) => String(v ?? "");
const hm = (value: number) => {
  const minutes = Math.max(0, Math.round(n(value) * 60));
  return { hours: String(Math.floor(minutes / 60)), minutes: String(minutes % 60) };
};
const dataFromReportGrindingMachine = (report: Pick<ProductionReport, "extra_data"> | null): string => s(report?.extra_data?.grinding_machine_no);
const slug = (code?: string | null) => ({ GC: "cat-long", MAI: "mai", DO: "do", K1: "kiem-1", K2: "kiem-2", CAN: "can", EP: "ep", XLBV: "bavia", SX3: "sx3", CVK: "cvk" } as Record<string, string>)[s(code).trim().toUpperCase()] || "cat-long";

export function useWorkerReportEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // The app uses HashRouter: window.location.pathname is always "/", so the route must come from the router.
  const { pathname } = useLocation();
  const storedRole = s(getStoredUser()?.role).trim().toLowerCase();
  // Manager/Lead/Admin edits are never subject to the worker's 10-minute edit window.
  // Detect by route AND by the authenticated role so nested/legacy manager routes cannot fall back to worker rules.
  const managerRole = ["admin_ops", "manager", "lead", "admin", "manager1", "manager_1", "to_truong", "truong_nhom"].includes(storedRole);
  const managerRoute = managerRole || /^\/(manager|lead|admin)(?:\/|$)/i.test(pathname);
  const readOnly = managerRoute && !pathname.endsWith("/edit");
  const source = searchParams.get("source") === "approved" ? "approved" : "pending";
  const [report, setReport] = useState<ReportEditRecord | null>(null);
  const originalUpdatedAtRef = useRef<string | null>(null);
  const saveInFlightRef = useRef(false);
  const [changeReason, setChangeReason] = useState("");
  const [form, setForm] = useState<FormState>(initialForm);
  const [deductions, setDeductions] = useState<DeductionState>(initialDeduction);
  const [selectedNg, setSelectedNg] = useState<NgKey[]>([]);
  const [selectedDeduction, setSelectedDeduction] = useState<string[]>([]);
  const [machineLines, setMachineLines] = useState<MachineLineState[]>([createEmptyMachineLine()]);
  const [extraData, setExtraData] = useState<Record<string, string>>({});
  const [operationType, setOperationType] = useState<"CUT" | "LONG">("CUT");
  const [cutExecutionMode, setCutExecutionMode] = useState<"AUTO" | "NON_AUTO">("AUTO");
  const [operationMode, setOperationMode] = useState<"MANUAL" | "MACHINE">("MANUAL");
  const [loading, setLoading] = useState(true);
  // Prevent editing a form while master options and saved data are being restored.
  const [formReady, setFormReady] = useState(false);
  const [loadingMasterData, setLoadingMasterData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [showNg, setShowNg] = useState(false);
  const [showDeduction, setShowDeduction] = useState(false);
  const [workType, setWorkType] = useState("Công việc khác");
  // ProcessBasicInfoSection toggles this from its operation-type / CVK buttons; without a real setter those handlers threw.
  const [isCvkMode, setIsCvkMode] = useState(false);

  // Do not request GC master data before the actual report process is known.
  const process = report ? slug(report?.process_code) : "";
  const capabilities = useMemo(() => getProcessCapabilities(process), [process]);
  const processId = report ? getCanonicalProcessId(Number(report?.process_id) || 0, capabilities.processCode) : 0;
  const { machineOptions, productOptions, activeNgOptions, activeDeductionOptions, loadingMasterData: masterLoading, masterDetailsReady } = useProcessMasterData(processId, capabilities.processCode);
  useEffect(() => setLoadingMasterData(masterLoading), [masterLoading]);

  const sourceDefects = useMemo(() => getWorkerDeclaredDefects<ReportEditDefect>(report), [report]);
  const sourceDeductions = useMemo<ReportEditDeduction[]>(() => {
    const parent = Array.isArray(report?.deductions) ? report.deductions : Array.isArray(report?.deduction_items) ? report.deduction_items : [];
    if (parent.length) return parent;
    // Older machine reports may store the original deductions only on machine lines.
    const lines = Array.isArray(report?.machine_lines) ? report.machine_lines : Array.isArray(report?.machineLines) ? report.machineLines : [];
    if (lines.length !== 1) return parent;
    const line = lines[0];
    return getReportEditLineDeductions(line);
  }, [report]);
  const sourceLines = useMemo<ReportEditMachineLine[]>(() => Array.isArray(report?.machine_lines) ? report.machine_lines : Array.isArray(report?.machineLines) ? report.machineLines : [], [report]);

  const editNgOptions = useMemo(() => {
    const result: WorkerMasterOption[] = [...activeNgOptions];
    const seen = new Set(result.map((x) => String(x.key || x.code || x.label).toUpperCase()));
    sourceDefects.forEach((d, index: number) => {
      if (/^CUSTOM_NG_/i.test(s(d.defect_code))) return;
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
    const result: WorkerMasterOption[] = [...activeDeductionOptions];
    const normalizeLabel = (value: unknown) => s(value).trim().normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "").replace(/đ/gi, "d")
      .toLowerCase().replace(/[^a-z0-9]/g, "");
    const seenLabels = new Set(result.map((option) => normalizeLabel(option.label)));
    sourceDeductions.forEach((d, index: number) => {
      if (/^CUSTOM_DED_/i.test(s(d.deduction_code))) return;
      const code = s(d.deduction_code).trim();
      const label = s(d.deduction_name || d.deduction_label || code || `Trừ giờ ${index + 1}`).trim();
      const normalized = normalizeLabel(label);
      if (seenLabels.has(normalized)) return;
      const key = code ? `legacy_deduction_${code.toUpperCase()}` : `legacy_deduction_${normalized || index}`;
      result.push({ key, id: d.deduction_type_id, code: code || key, label });
      seenLabels.add(normalized);
    });
    return result;
  }, [activeDeductionOptions, sourceDeductions]);

  const editMachineOptions = useMemo(() => {
    const result: MachineOption[] = [...machineOptions];
    const seen = new Set(result.map((m) => s(m.machine_code).trim().toUpperCase()));
    const add = (code: unknown, machineId?: unknown) => {
      const value = s(code).trim();
      if (!value || seen.has(value.toUpperCase())) return;
      result.push({ id: Number(machineId) || -(result.length + 1), process_id: processId, machine_code: value, machine_name: value });
      seen.add(value.toUpperCase());
    };
    sourceLines.forEach((line) => add(line.machine_code, line.machine_id));
    s(report?.machine_no).split(",").forEach((value) => add(value));
    return result;
  }, [machineOptions, sourceLines, report]);

  const editProductOptions = useMemo(() => {
    const result: ProductStandardOption[] = [...productOptions];
    const seen = new Set(result.map((p) => s(p.product_code).trim().toUpperCase()));
    const add = (code: unknown) => {
      const value = s(code).trim();
      if (!value || seen.has(value.toUpperCase())) return;
      result.push({ id: -(result.length + 1), process_id: processId, work_type: s(report?.work_type), product_code: value, standard_output: Number(report?.standard_output || 0) });
      seen.add(value.toUpperCase());
    };
    sourceLines.forEach((line) => add(line.product_code));
    s(report?.product_name).split(",").forEach(add);
    return result;
  }, [productOptions, sourceLines, report]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setFormReady(false);
      hydratedReportRef.current = null;
      try {
        const reportId = Number(id);
        if (!Number.isInteger(reportId) || reportId <= 0) throw new Error("ID báo cáo không hợp lệ.");
        const raw = await getReportById(reportId, managerRoute ? source : "pending");
        const data = unwrapReportEditResponse(raw);
        if (!data) throw new Error("Không tải được báo cáo hợp lệ (thiếu ID, công đoạn, ngày/ca hoặc dữ liệu máy). Vui lòng tải lại.");
        if (!alive) return;
        originalUpdatedAtRef.current = source === "approved" ? (data.updated_at || null) : null;
        // Commit only the fully prepared report once. Intermediate report identities
        // could trigger a second hydration after an operator starts editing.
        const rawMachineLines = Array.isArray(data.machine_lines) ? data.machine_lines : Array.isArray(data.machineLines) ? data.machineLines : [];
        const isMachineReport = String(data.operation_mode || "").toUpperCase() === "MACHINE" || rawMachineLines.length > 0;
        const legacyMachine = s(data.machine_no).split(",").map((v) => v.trim()).filter(Boolean)[0] || "";
        const legacyProduct = s(data.product_name).split(",").map((v) => v.trim()).filter(Boolean)[0] || "";
        const editMachineLines = rawMachineLines.length ? rawMachineLines : (legacyMachine || legacyProduct ? [{ machine_code: legacyMachine, product_code: legacyProduct, machine_time_hours: data.actual_time, ok_quantity: data.tt_ok, ng_quantity: data.tt_ng, standard_output: data.standard_output }] : []);
        // Với báo cáo theo máy, machine_time_hours là tổng thời gian (thực tế + trừ giờ).
        // Các cột tổng hợp phải được tính lại từ từng dòng máy, không lấy các trường legacy
        // ở cấp báo cáo vì các trường đó có thể bằng 0 hoặc mang ý nghĩa gross khác nhau.
        const lineTimeTotals = rawMachineLines.reduce((totals: { gross: number; deduction: number }, line) => {
          const gross = Math.max(0, n(line.machine_time_hours));
          let deduction = Number(line.deduction_time_hours);
          if (!Number.isFinite(deduction) || deduction < 0) {
            const rawDeductions = getReportEditLineDeductions(line);
            deduction = rawDeductions.reduce((sum: number, item) => sum + Math.max(0, n(item.minutes ?? item.deduction_minutes ?? n(item.hours) * 60)) / 60, 0);
          }
          totals.gross += gross;
          totals.deduction += Math.min(gross, Math.max(0, deduction));
          return totals;
        }, { gross: 0, deduction: 0 });
        const actual = hm(isMachineReport && rawMachineLines.length ? lineTimeTotals.gross - lineTimeTotals.deduction : data.actual_time);
        const total = hm(isMachineReport && rawMachineLines.length ? lineTimeTotals.gross : data.total_time);
        const deduction = hm(isMachineReport && rawMachineLines.length ? lineTimeTotals.deduction : data.deduction_time);
        const firstLine = editMachineLines[0];
        const nextForm: FormState = {
          ...initialForm,
          workDate: s(data.work_date).slice(0, 10), shift: s(data.shift || "A"), workerCode: s(data.worker_code), workerName: s(data.full_name || data.worker_name),
          trainingPercent: s(data.training_percent_snapshot ?? data.training_percent ?? data.hv_percent ?? ""), machineNo: s(data.machine_no).split(",")[0].trim() || s(firstLine?.machine_code), productName: s(data.product_name).split(",")[0].trim() || s(firstLine?.product_code), standardOutput: s(data.standard_output), actualOutput: s(data.actual_output), ttOk: s(data.tt_ok), ttNg: s(data.tt_ng), totalTime: `${total.hours}:${total.minutes}`, actualTime: `${actual.hours}:${actual.minutes}`, actualHours: actual.hours, actualMinutes: actual.minutes, deductionTime: `${deduction.hours}:${deduction.minutes}`, adjustmentCount: s(data.extra_data?.adjustment_count ?? data.adjustment_count ?? ""), note: s(data.note || data.notes), k1DeductionWork: s(data.extra_data?.k1_deduction_work || ""), kqdDapLai: s(data.kqd_dap_lai), kqdTuot: s(data.kqd_tuot), voDoLong: s(data.vo_do_long), xuocDoLong: s(data.xuoc_do_long), congGay: s(data.cong_gay), xoay: s(data.xoay), khongDut: s(data.khong_dut), baviaHut: s(data.bavia_hut), ppcm: s(data.ppcm), loiCaoSu: s(data.loi_cao_su), ngKichThuoc: s(data.ng_kich_thuoc), catLem: s(data.cat_lem), executionMethod: s(data.extra_data?.execution_method || data.execution_method || "AUTO")
        };
        setForm(nextForm);
        const normalizedOperation = s(data.operation_type || data.operation || "").trim().toUpperCase();
        setOperationType(normalizedOperation === "LONG" || normalizedOperation === "NEST" || normalizedOperation === "LÔNG" || normalizedOperation === "LỒNG" ? "LONG" : "CUT");
        const loadedMachineCode = s(firstLine?.machine_code || data.machine_no).trim().toUpperCase().replace(/^MÁY\s*/i, "");
        setCutExecutionMode(resolveCutExecutionMode(loadedMachineCode));
        setOperationMode(data.operation_mode === "MACHINE" || (Array.isArray(data.machine_lines) ? data.machine_lines.length : Array.isArray(data.machineLines) ? data.machineLines.length : 0) > 0 ? "MACHINE" : "MANUAL");
        const loadedWorkType = s(data.extra_data?.work_type || data.work_type || "");
         const resolvedWorkType = String(data.process_code || "").trim().toUpperCase() === "CVK" ? (loadedWorkType || "XUATNHAP") : loadedWorkType;
         setWorkType(resolvedWorkType);
         setForm((current) => ({ ...current, workType: resolvedWorkType }));
        setExtraData(Object.fromEntries(Object.entries(data.extra_data || {}).filter(([key]) => key !== "adjustment_count" && key !== "work_type").map(([key, value]) => [key, value == null ? "" : String(value)])));
        setReport({ ...data, __edit_machine_lines: editMachineLines });
      } catch (error: unknown) {
        if (alive) setError(getApiError(error, "Không tải được báo cáo.").message);
      } finally { if (alive) setLoading(false); }
    };
    void load();
    return () => { alive = false; };
  }, [id, managerRoute, source]);

  useEffect(() => {
    if (managerRoute) {
      setRemaining(Number.POSITIVE_INFINITY);
      return;
    }
    if (!report) return;
    const tick = () => setRemaining(getWorkerEditWindow(report).remainingMs);
    tick();
    if (!WORKER_EDIT_TIME_LIMIT_ENABLED) return;
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [report, managerRoute]);

  const hydratedReportRef = useRef<ReportEditRecord | null>(null);

  useEffect(() => {
    // Hydrate each loaded report once, after its master options are ready.
    // Later option refreshes must never overwrite unsaved edits.
    if (!report || loading || loadingMasterData || !masterDetailsReady || hydratedReportRef.current === report) return;
    hydratedReportRef.current = report;
    const findNgKey = (item: ReportEditDefect) => /^CUSTOM_NG_/i.test(s(item.defect_code)) ? "__otherNg" : editNgOptions.find((o) => Number(o.id) === Number(item.defect_type_id) || (s(o.code).trim() && s(o.code).toUpperCase() === s(item.defect_code).toUpperCase()) || s(o.label).trim() === s(item.defect_name).trim())?.key;
    const findDeductionKey = (item: ReportEditDeduction) => /^CUSTOM_DED_/i.test(s(item.deduction_code)) ? "__otherDeduction" : editDeductionOptions.find((o) => Number(o.id) === Number(item.deduction_type_id) || (s(o.code).trim() && s(o.code).toUpperCase() === s(item.deduction_code).toUpperCase()) || s(o.label).trim() === s(item.deduction_name).trim())?.key;
    // Resolve both slices before queuing updates. Do not enqueue one React
    // state update inside another updater (which React can replay/defer).
    const hydratedNg: Array<{ key: string; quantity: string; name: string }> = [];
    sourceDefects.forEach((d) => {
      const key = findNgKey(d);
      if (key) hydratedNg.push({ key, quantity: s(d.quantity ?? 0), name: s(d.defect_name) });
    });
    setSelectedNg(hydratedNg.map(({ key }) => key));
    setForm((current) => {
      const next = { ...current };
      hydratedNg.forEach(({ key, quantity, name }) => {
        next[key] = quantity;
        if (key === "__otherNg") next.otherNgName = name;
      });
      return next;
    });
    setMachineLines((Array.isArray(report?.__edit_machine_lines) ? report.__edit_machine_lines : sourceLines).map((line) => {
      const lineDefects = Array.isArray(line.defects) ? line.defects : [];
      const defects: Record<string, string> = {};
      const selectedDefects: string[] = [];
      lineDefects.forEach((d) => { const key = findNgKey(d); if (key) { defects[key] = s(d.quantity ?? 0); selectedDefects.push(key); } });
      // machine_time_hours lưu trong DB là "Tổng thời gian" (gross = thực tế + trừ).
      // Form chỉnh sửa hiển thị lại "Thời gian chạy thực tế" cho Worker, nên phải trừ
      // ngược deduction_time_hours ra trước khi đổ vào ô giờ/phút có thể chỉnh sửa.
      const rawLineDeductions = getReportEditLineDeductions(line);
      const lineDeductions: DeductionState = { ...initialDeduction };
      const customNg = lineDefects.find((item) => /^CUSTOM_NG_/i.test(s(item.defect_code)));
      const customDeduction = rawLineDeductions.find((item) => /^CUSTOM_DED_/i.test(s(item.deduction_code)));
      const selectedLineDeductions: string[] = [];
      rawLineDeductions.forEach((d) => { const key = findDeductionKey(d); const minutes = d.minutes ?? d.deduction_minutes ?? n(d.hours) * 60; if (key) { lineDeductions[key] = String(Math.round(n(minutes))); selectedLineDeductions.push(key); } });
      const deductionTimeHours = n(line.deduction_time_hours);
      const actualTimeHours = Math.max(0, n(line.machine_time_hours) - deductionTimeHours);
      const time = hm(actualTimeHours);
      return { ...createEmptyMachineLine(), otherNgName: s(customNg?.defect_name), otherDeductionName: s(customDeduction?.deduction_name), machineCode: s(line.machine_code), productCode: s(line.product_code), grindingMachineNo: s(line.grinding_machine_no ?? dataFromReportGrindingMachine(report)), hours: time.hours, minutes: time.minutes, deductions: lineDeductions, selectedDeductions: selectedLineDeductions, adjustmentMinutes: s(line.adjustment_minutes ?? ""), adjustmentCount: s(line.adjustment_count ?? ""), okQuantity: s(line.ok_quantity ?? ""), ngQuantity: s(line.ng_quantity ?? ""), standardOutputPerHour: n(line.standard_output), standardTimeSeconds: line.standard_time_seconds ?? null, standardSource: line.standard_source || null, selectedDefects, defects, machineEventId: line.machine_event_id ?? null };
    }));
    const existingOtherDeduction = sourceDeductions.find((item) => /^CUSTOM_DED_/i.test(s(item.deduction_code)));
    if (existingOtherDeduction) setForm((current) => ({ ...current, otherDeductionName: s(existingOtherDeduction.deduction_name) }));
    const hydratedDeductions: Array<{ key: string; minutes: string }> = [];
    sourceDeductions.forEach((d) => {
      const key = findDeductionKey(d);
      const minutes = d.minutes ?? d.deduction_minutes ?? n(d.hours) * 60;
      if (key) hydratedDeductions.push({ key, minutes: String(Math.round(n(minutes))) });
    });
    setSelectedDeduction(hydratedDeductions.map(({ key }) => key));
    setDeductions((current) => {
      const next: DeductionState = { ...current };
      hydratedDeductions.forEach(({ key, minutes }) => { next[key] = minutes; });
      return next;
    });
    // Restored defect/deduction values and the ready flag are batched together.
    setFormReady(true);
  }, [report, loading, loadingMasterData, masterDetailsReady, sourceDefects, sourceDeductions, sourceLines, editNgOptions, editDeductionOptions]);

  // Preserve the persisted per-line standard snapshot on initial edit load.
  // Standard lookup is triggered by explicit machine/product changes in the form,
  // never by master-data loading or an unrelated re-render.

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
  const machineAutocompleteOptions = editMachineOptions.map((m) => ({ value: s(m.machine_code), label: s(m.machine_code), workType: m.gc_work_type }));
  const getMachineProductOptions = (machineCode: string) => filterProductsForSelection({ products: editProductOptions, mode: "MACHINE", machineCode, machineOptions: editMachineOptions, useEncodedMachineSuffix: capabilities.processCode === "GC" });
  const getMachineProductAutocompleteOptions = (machineCode: string) => toProductAutocompleteOptions(getMachineProductOptions(machineCode));
  const refreshMachineLineStandard = async (index: number, machineCode: string, productCode: string) => {
    if (!machineCode.trim() || !productCode.trim()) { updateLine(index, { standardOutputPerHour: 0, standardTimeSeconds: null, standardSource: null, standardLoading: false, standardError: "" }); return; }
    updateLine(index, { standardLoading: true, standardError: "" });
    try {
      const resolved = await getCachedResolvedProductStandard(processId, machineCode.trim(), productCode.trim(), () => resolveProductStandard(processId, machineCode.trim(), productCode.trim(), form.workDate));
      const output = n(resolved.resolved_output_per_hour);
      updateLine(index, { standardOutputPerHour: output, standardTimeSeconds: resolved.standard_time_seconds, standardSource: resolved.standard_source, standardLoading: false, standardError: output > 0 ? "" : "Định mức bằng 0" });
    } catch (error: unknown) { updateLine(index, { standardLoading: false, standardError: getApiError(error, "Không lấy được định mức").message }); }
  };

  const syncDeductionTime = (next: DeductionState) => {
    const minutes = Object.values(next).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    setForm((current) => ({ ...current, deductionTime: `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}` }));
  };
  const toggleDeduction = (key: string, checked: boolean) => setSelectedDeduction((current) => checked ? Array.from(new Set([...current, key])) : current.filter((item) => item !== key));
  const updateDeduction = (key: string, value: string) => setDeductions((current) => { const next = { ...current, [key]: value.replace(/\D/g, "") }; syncDeductionTime(next); return next; });
  const normalizeDeduction = (key: string) => updateDeduction(key, String(Math.min(720, Math.max(0, Number(deductions[key] || 0)))));
  const warning = (message: string) => setError(message);

  // KQD is ordinary NG: actual output = TT OK + every NG (no KQD exclusion flag).
  const recalcQuality = (next: FormState) => {
    const totalNg = editNgOptions.reduce((sum: number, item) => sum + Math.max(0, Math.trunc(n(next[item.key]))), 0);
    return { ...next, ttNg: String(totalNg), actualOutput: String(Math.max(0, Math.trunc(n(next.ttOk))) + totalNg) };
  };
  const toggleNg = (key: NgKey, checked: boolean) => setSelectedNg((current) => checked ? Array.from(new Set([...current, key])) : current.filter((item) => item !== key));
  const updateNg = (key: NgKey, value: string) => setForm((current) => recalcQuality({ ...current, [key]: value.replace(/\D/g, "") }));
  const applyTtOkInput = (raw: string) => {
    // Both a native input event (paste/mobile) and React's change event must
    // preserve the entered value, without retaining a pooled DOM event.
    const typedOk = raw.replace(/\D/g, "");
    setForm((current) => {
      const next = recalcQuality({ ...current, ttOk: typedOk });
      return next.ttOk === current.ttOk && next.ttNg === current.ttNg
        && next.actualOutput === current.actualOutput ? current : next;
    });
  };
  const onTtOkChange = (event: ChangeEvent<HTMLInputElement>) => {
    const typedOk = event.currentTarget.value;
    applyTtOkInput(typedOk);
  };
  const onNumberBlur = () => setForm((current) => recalcQuality(current));

  const approvedMachineNoteOnly = isApprovedMachineReport(source, operationMode) && managerRoute;
  const save = async () => {
    if (!report || readOnly || !formReady) return;
    if (!managerRoute && !getWorkerEditWindow(report).editable) { setError("Báo cáo không còn ở trạng thái được phép sửa."); return; }
    if (!managerRoute && !report.updated_at) { setError("Thiếu phiên bản báo cáo. Vui lòng tải lại trước khi sửa."); return; }
    setError("");
    const incompleteMessage = detectIncompleteMachineData(report);
    if (incompleteMessage) { setError(incompleteMessage); return; }
    if (managerRoute && source === "approved" && !changeReason.trim()) {
      setError("Vui lòng nhập lý do chỉnh sửa báo cáo đã duyệt.");
      return;
    }
    if (source === "approved" && !originalUpdatedAtRef.current && managerRoute) {
      setError("Không thể lưu vì thiếu thông tin phiên bản cập nhật của báo cáo đã duyệt. Vui lòng tải lại dữ liệu.");
      return;
    }
    if (!approvedMachineNoteOnly) {
      const machineDeductionIssue = getReportEditMachineDeductionIssue(sourceLines);
      if (machineDeductionIssue) { setError(machineDeductionIssue); return; }
    }
    let payload: ProductionReport | ReturnType<typeof buildApprovedMachineNotePatch>;
    if (approvedMachineNoteOnly) {
      payload = buildApprovedMachineNotePatch({ note: form.note, reason: changeReason, updatedAt: report.updated_at });
    } else {
    const actualHours = n(form.actualHours) + n(form.actualMinutes) / 60;
    const deductionHours = parseFlexibleTime(form.deductionTime);
    const totalHours = actualHours + (Number.isFinite(deductionHours) ? deductionHours : 0);
    if (totalHours * 60 > MAX_TOTAL_WORK_MINUTES + 0.001) { setError("Tổng thời gian không được vượt quá 12 giờ."); return; }
    const normalizedLines = operationMode === "MACHINE" ? machineLines.filter((line) => line.machineCode.trim() || line.productCode.trim()) : [];
    if (operationMode === "MACHINE" && (!normalizedLines.length || normalizedLines.some((line) => !line.machineCode.trim() || !line.productCode.trim()))) { setError("Vui lòng nhập đủ mã máy và mã sản phẩm cho từng máy."); return; }
    if (operationMode === "MACHINE" && normalizedLines.length) {
      const validationError = validateMachineLines({
        processCode: capabilities.processCode,
        machineLines: normalizedLines,
        maxMachines: maxMachineCount,
        isMachineValid: (code) => editMachineOptions.some((item) => s(item.machine_code).trim().toUpperCase() === code.trim().toUpperCase()),
        isProductValid: (machineCode, productCode) => getMachineProductOptions(machineCode).some((item) => s(item.product_code).trim().toUpperCase() === productCode.trim().toUpperCase()),
      });
      if (validationError) { setError(validationError); return; }
    }
    payload = buildProductionReportPayload({
      clientRequestId: null, processId: report.process_id, form: { ...form, actualTime: `${form.actualHours}:${form.actualMinutes}`, deductionTime: form.deductionTime, totalTime: `${Math.floor(totalHours)}:${String(Math.round((totalHours % 1) * 60)).padStart(2, "0")}` },
      extraData: capabilities.processCode === "DO" ? { ...extraData, grinding_machine_no: String(normalizedLines[0]?.grindingMachineNo ?? extraData.grinding_machine_no ?? "").trim() } : extraData, operationType, isCutLongProcess: capabilities.isCutLongProcess, processCode: capabilities.processCode, isCvkMode, usesAnyMachine: operationMode === "MACHINE", usesMultiMachineLines, usesSingleMachine,
      machineLines: normalizedLines, machineOptions: editMachineOptions, productOptions: editProductOptions, activeNgOptions: editNgOptions, deductions, activeDeductionOptions: editDeductionOptions,
    });
    }
    if (!approvedMachineNoteOnly && "deduction_time" in payload) {
      // Never silently erase historical deductions when the edit screen cannot
      // reconstruct their detail rows (e.g. a failed master-data request).
      const originalDeductionMinutes = Math.round(n(report.deduction_time) * 60);
      const submittedDeductionMinutes = Math.round(n(payload.deduction_time) * 60);
      let detailMinutes = (Array.isArray(payload.deductions) ? payload.deductions : [])
        .reduce((sum: number, item) => sum + Math.round(n(item.hours) * 60), 0);
      // Some historical reports retain valid deduction details in the API but
      // the editor's master-data mapping may not serialize them back to payload.
      // Preserve those exact persisted entries only when the deduction total
      // has not changed. Never invent a deduction category or overwrite edits.
      if (detailMinutes === 0 && submittedDeductionMinutes > 0 && sourceDeductions.length > 0) {
        const originalDetails = sourceDeductions.map((item) => ({
          deduction_type_id: Number(item.deduction_type_id) || undefined,
          deduction_code: s(item.deduction_code || item.code),
          deduction_name: s(item.deduction_name || item.name || item.label),
          hours: n(item.hours ?? item.deduction_hours ?? item.duration_hours),
        })).filter((item) => item.hours > 0);
        const originalDetailMinutes = originalDetails.reduce((sum: number, item) => sum + Math.round(item.hours * 60), 0);
        if (originalDetailMinutes > 0
          && Math.abs(originalDetailMinutes - submittedDeductionMinutes) <= 1
          && Math.abs(originalDetailMinutes - originalDeductionMinutes) <= 1) {
          payload.deductions = originalDetails;
          detailMinutes = originalDetailMinutes;
        }
      }
      if (originalDeductionMinutes > 0 && sourceDeductions.length === 0 && detailMinutes === 0) {
        setError("Không tải đủ chi tiết khấu trừ của báo cáo cũ. Để bảo toàn thời gian trừ đã lưu, vui lòng tải lại báo cáo hoặc liên hệ quản lý trước khi chỉnh sửa.");
        return;
      }
      if (Math.abs(submittedDeductionMinutes - detailMinutes) > 1) {
        setError("Chi tiết khấu trừ chưa khớp tổng thời gian trừ. Vui lòng kiểm tra các mục khấu trừ trước khi lưu.");
        return;
      }
      payload.updated_at = report.updated_at; payload.expected_updated_at = report.updated_at;
    }
    const approvedEditAudit = { reason: source === "approved" ? changeReason.trim() : undefined };
    Object.assign(payload, approvedEditAudit);
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    try {
      setSaving(true);
      if (managerRoute) {
        const result = await updateReport(Number(report.id), payload, source, originalUpdatedAtRef.current);
        originalUpdatedAtRef.current = result?.data?.updated_at || originalUpdatedAtRef.current;
        const roleBasePath = storedRole === "lead" ? "/lead" : storedRole === "admin" ? "/admin" : storedRole === "admin_ops" ? "/admin-ops" : "/manager";
        navigate(source === "pending" ? `${roleBasePath}/report/${report.id}?source=pending` : `${roleBasePath}/report/${report.id}?source=approved`, { replace: true });
      } else {
        if (!("process_id" in payload)) throw new Error("Thiếu dữ liệu báo cáo để cập nhật.");
        await updateTempReport(Number(report.id), payload);
        navigate(`/worker/history/${report.id}`, { replace: true });
      }
    } catch (error: unknown) {
      const apiError = getApiError(error, "Không thể lưu thay đổi.");
      const conflictCodes = ["REPORT_VERSION_CONFLICT", "TEMP_REPORT_VERSION_CONFLICT", "TEMP_REPORT_VERSION_REQUIRED"];
      if (conflictCodes.includes(apiError.code || "") || (apiError.status === 409 && !apiError.code)) {
        setError("Báo cáo đã được người khác cập nhật. Vui lòng tải lại dữ liệu trước khi lưu. Các thay đổi bạn đang nhập vẫn được giữ trên màn hình.");
        return;
      }
      setError(apiError.errors.machine_lines || apiError.message);
    }
    finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  return { loading, report, error, managerRoute, remaining, readOnly, capabilities, formReady, form, navigate, updateForm, source, changeReason, setChangeReason, saving, approvedMachineNoteOnly, setForm, onFormChange, isCvkMode, setIsCvkMode, operationType, setOperationType, cutExecutionMode, setCutExecutionMode, operationMode, setOperationMode, usesMultiMachineLines, usesSingleMachine, editProductOptions, getMachineProductAutocompleteOptions, machineAutocompleteOptions, editMachineOptions, loadingMasterData, machineCount, maxMachineCount, machineLines, resizeMachineLines, updateLine, refreshMachineLineStandard, editNgOptions, editDeductionOptions, toggleMachineDefect, updateMachineDefectValue, workType, setWorkType, selectedNg, showNg, setShowNg, onTtOkChange, applyTtOkInput, onNumberBlur, toggleNg, updateNg, deductions, selectedDeduction, showDeduction, setShowDeduction, toggleDeduction, updateDeduction, normalizeDeduction, warning, save };
}
