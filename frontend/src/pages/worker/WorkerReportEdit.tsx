import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getReportById, updateTempReport } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import { getProcessCapabilities } from "./processPageDomain";
import { useProcessMasterData } from "./useProcessMasterData";
import { createEmptyMachineLine, initialDeduction, initialForm, type DeductionState, type FormState, type MachineLineState } from "./processPageConfig";
import { buildProductionReportPayload } from "./processReportSubmission";
import { filterProductsForSelection } from "./productSuggestionRules";
import { createClientRequestId } from "../../utils/workerSubmitGuard";

const number = (value: unknown) => Number(value || 0);
const decimal = (value: unknown) => String(value ?? "");
const toHoursMinutes = (value: number) => {
  const total = Math.max(0, Math.round((Number(value) || 0) * 60));
  return { hours: String(Math.floor(total / 60)), minutes: String(total % 60) };
};
const parseDbDateMs = (value?: string | null) => {
  if (!value) return NaN;
  const text = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text) ? text.replace(" ", "T") + "Z" : text;
  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? parsed : NaN;
};

const processSlug = (code?: string | null) => ({ GC: "cat-long", MAI: "mai", DO: "do", K1: "kiem-1", K2: "kiem-2", CAN: "can", EP: "ep", XLBV: "bavia", SX3: "sx3" } as Record<string, string>)[String(code || "").trim().toUpperCase()] || "cat-long";
const machineProcessCodes = new Set(["GC", "MAI", "DO", "EP", "CAN"]);

function WorkerReportEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState<ProductionReport | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [deductions, setDeductions] = useState<DeductionState>(initialDeduction);
  const [selectedNg, setSelectedNg] = useState<string[]>([]);
  const [selectedDeduction, setSelectedDeduction] = useState<string[]>([]);
  const [machineLines, setMachineLines] = useState<MachineLineState[]>([createEmptyMachineLine()]);
  const [extraData, setExtraData] = useState<Record<string, string>>({});
  const [operationType, setOperationType] = useState<"CUT" | "LONG">("CUT");
  const [operationMode, setOperationMode] = useState<"MANUAL" | "MACHINE">("MANUAL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState(0);

  const process = processSlug(report?.process_code);
  const capabilities = useMemo(() => getProcessCapabilities(process), [process]);
  const { machineOptions, productOptions, activeNgOptions, activeDeductionOptions, loadingMasterData } = useProcessMasterData(report?.process_id || 0, capabilities.processCode);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const reportId = Number(id);
        if (!Number.isInteger(reportId) || reportId <= 0) throw new Error("ID báo cáo không hợp lệ.");
        const data = await getReportById(reportId, "pending");
        if (!data) throw new Error("Không tìm thấy báo cáo.");
        if (!alive) return;
        setReport(data);
        const actual = toHoursMinutes(number(data.actual_time));
        const total = toHoursMinutes(number(data.total_time));
        const deductionTotal = toHoursMinutes(number(data.deduction_time));
        setForm({
          ...initialForm,
          workDate: String(data.work_date || "").slice(0, 10), shift: String(data.shift || "A"),
          workerCode: String(data.worker_code || ""), workerName: String(data.full_name || data.worker_name || ""),
          trainingPercent: decimal(data.training_percent), machineNo: String(data.machine_no || "").split(",")[0].trim(),
          productName: String(data.product_name || "").split(",")[0].trim(), standardOutput: decimal(data.standard_output), actualOutput: decimal(data.actual_output),
          ttOk: decimal(data.tt_ok), ttNg: decimal(data.tt_ng), totalTime: `${total.hours}:${total.minutes}`, actualTime: `${actual.hours}:${actual.minutes}`,
          actualHours: actual.hours, actualMinutes: actual.minutes, deductionTime: `${deductionTotal.hours}:${deductionTotal.minutes}`, note: String(data.note || ""),
          kqdDapLai: decimal(data.kqd_dap_lai), kqdTuot: decimal(data.kqd_tuot), voDoLong: decimal(data.vo_do_long), xuocDoLong: decimal(data.xuoc_do_long),
          congGay: decimal(data.cong_gay), xoay: decimal(data.xoay), khongDut: decimal(data.khong_dut), baviaHut: decimal(data.bavia_hut), ppcm: decimal(data.ppcm),
          loiCaoSu: decimal(data.loi_cao_su), ngKichThuoc: decimal(data.ng_kich_thuoc), catLem: decimal(data.cat_lem),
        });
        setOperationType(data.operation_type === "LONG" ? "LONG" : "CUT");
        setOperationMode(data.operation_mode === "MACHINE" || (data.machine_lines || []).length > 0 ? "MACHINE" : "MANUAL");
        setExtraData(Object.fromEntries(Object.entries(data.extra_data || {}).map(([key, value]) => [key, value == null ? "" : String(value)])));
      } catch (e: any) {
        if (alive) setError(e?.response?.data?.message || e?.message || "Không tải được báo cáo.");
      } finally { if (alive) setLoading(false); }
    };
    void load();
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    if (!report?.created_at) return;
    const tick = () => {
      const created = parseDbDateMs(report.created_at);
      setRemaining(Number.isFinite(created) ? Math.max(0, created + 600000 - Date.now()) : 0);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [report?.created_at]);

  const findNgKey = (item: any) => activeNgOptions.find((o: any) => Number(o.id) === Number(item.defect_type_id) || String(o.code || "").toUpperCase() === String(item.defect_code || "").toUpperCase() || String(o.label || "").trim() === String(item.defect_name || "").trim())?.key;
  const findDeductionKey = (item: any) => activeDeductionOptions.find((o: any) => Number(o.id) === Number(item.deduction_type_id) || String(o.code || "").toUpperCase() === String(item.deduction_code || "").toUpperCase() || String(o.label || "").trim() === String(item.deduction_name || "").trim())?.key;

  useEffect(() => {
    if (!report || !activeNgOptions.length) return;
    const selected: string[] = [];
    setForm((current) => {
      const next = { ...current };
      (report.defects || []).forEach((item) => {
        const key = findNgKey(item);
        if (key) { next[key] = String(item.quantity || 0); selected.push(key); }
      });
      return next;
    });
    setSelectedNg(selected);
    setMachineLines((current) => current.map((line, index) => {
      const source = report.machine_lines?.[index];
      if (!source) return line;
      const selectedDefects: string[] = [];
      const defects: Record<string, string> = {};
      (source.defects || []).forEach((item) => {
        const key = findNgKey(item);
        if (key) { selectedDefects.push(key); defects[key] = String(item.quantity || 0); }
      });
      return { ...line, selectedDefects, defects };
    }));
  }, [report, activeNgOptions]);

  useEffect(() => {
    if (!report || !activeDeductionOptions.length) return;
    const next: DeductionState = { ...initialDeduction };
    const selected: string[] = [];
    (report.deductions || []).forEach((item) => {
      const key = findDeductionKey(item);
      if (key) { next[key] = String(Math.round(Number(item.hours || 0) * 60)); selected.push(key); }
    });
    setDeductions(next);
    setSelectedDeduction(selected);
  }, [report, activeDeductionOptions]);

  useEffect(() => {
    if (!report) return;
    const lines = (report.machine_lines || []).map((line) => {
      const hm = toHoursMinutes(number(line.machine_time_hours));
      return { ...createEmptyMachineLine(), machineCode: String(line.machine_code || ""), productCode: String(line.product_code || ""), hours: hm.hours, minutes: hm.minutes, okQuantity: String(line.ok_quantity ?? ""), ngQuantity: String(line.ng_quantity ?? ""), standardOutputPerHour: Number(line.standard_output || 0), standardTimeSeconds: line.standard_time_seconds ?? null, standardSource: line.standard_source || null };
    });
    setMachineLines(lines.length ? lines : [createEmptyMachineLine()]);
  }, [report]);

  const updateForm = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const updateLine = (index: number, patch: Partial<MachineLineState>) => setMachineLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  const addMachine = () => { if (machineLines.length < 4) setMachineLines((current) => [...current, createEmptyMachineLine()]); };
  const removeMachine = (index: number) => setMachineLines((current) => current.filter((_, i) => i !== index));

  const filteredProducts = (machineCode: string) => filterProductsForSelection({ products: productOptions, mode: "MACHINE", machineCode, machineOptions, useEncodedMachineSuffix: capabilities.processCode === "GC" });

  const save = async () => {
    if (!report || remaining <= 0) return;
    setError("");
    const actualHours = number(form.actualHours) + number(form.actualMinutes) / 60;
    const parts = form.deductionTime.split(":");
    const deductionHours = number(parts[0]) + number(parts[1]) / 60;
    const totalHours = actualHours + deductionHours;
    if (totalHours > 12.000001) { setError("Tổng thời gian không được vượt quá 12 giờ."); return; }
    const normalizedLines = operationMode === "MACHINE" ? machineLines.filter((l) => l.machineCode.trim() || l.productCode.trim()) : [];
    if (operationMode === "MACHINE" && (!normalizedLines.length || normalizedLines.some((l) => !l.machineCode.trim() || !l.productCode.trim()))) { setError("Vui lòng nhập đủ mã máy và mã sản phẩm cho từng máy."); return; }
    const payload = buildProductionReportPayload({
      clientRequestId: createClientRequestId(), processId: report.process_id,
      form: { ...form, actualTime: `${form.actualHours}:${form.actualMinutes}`, deductionTime: form.deductionTime, totalTime: `${Math.floor(totalHours)}:${String(Math.round((totalHours % 1) * 60)).padStart(2, "0")}` },
      extraData, operationType, isCutLongProcess: capabilities.isCutLongProcess, usesAnyMachine: operationMode === "MACHINE",
      usesMultiMachineLines: operationMode === "MACHINE" && machineProcessCodes.has(capabilities.processCode),
      usesSingleMachine: operationMode === "MACHINE" && !machineProcessCodes.has(capabilities.processCode),
      machineLines: normalizedLines, machineOptions, productOptions, activeNgOptions, deductions, activeDeductionOptions,
      excludeKqdFromTt: Number(report.exclude_kqd_from_tt || 0) === 1,
    });
    try {
      setSaving(true);
      await updateTempReport(Number(report.id), payload);
      navigate(`/worker/history/${report.id}`, { replace: true });
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.response?.data?.errors?.machine_lines || "Không thể lưu thay đổi.");
    } finally { setSaving(false); }
  };

  if (loading) return <div className="detail-container"><div className="detail-state">Đang tải biểu mẫu...</div></div>;
  if (!report) return <div className="detail-container"><div className="detail-state error">{error || "Không tìm thấy báo cáo."}</div></div>;
  const remainingSeconds = Math.ceil(remaining / 1000);
  const timeText = `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`;
  const ngFields = activeNgOptions.length ? activeNgOptions : Object.keys(form).filter((key) => ["kqdDapLai","kqdTuot","voDoLong","xuocDoLong","congGay","xoay","khongDut","baviaHut","ppcm","loiCaoSu","ngKichThuoc","catLem"].includes(key)).map((key) => ({ key, label: key }));

  return <div className="ktc-page"><main className="detail-container" style={{ maxWidth: 980 }}>
    <header className="detail-header"><div><h1>Sửa báo cáo</h1><p>Chỉnh sửa toàn bộ nội dung như biểu mẫu nhập.</p></div><button className="back-btn" type="button" onClick={() => navigate(-1)}>← Quay lại</button></header>
    {error && <div className="detail-state error" style={{ marginBottom: 12 }}>{error}</div>}
    <section className="detail-section"><div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}><strong>Thời gian còn lại {timeText}</strong><span>{loadingMasterData ? "Đang tải danh mục..." : ""}</span></div></section>

    <section className="detail-section"><h2>Thông tin báo cáo</h2><div className="detail-grid">
      <label><span>Mã công nhân</span><input value={form.workerCode} disabled /></label>
      <label><span>Công nhân</span><input value={form.workerName} disabled /></label>
      <label><span>Ngày sản xuất</span><input type="date" value={form.workDate} onChange={(e) => updateForm("workDate", e.target.value)} /></label>
      <label><span>Ca</span><select value={form.shift} onChange={(e) => updateForm("shift", e.target.value)}><option>A</option><option>B</option><option>C</option></select></label>
      {capabilities.isCutLongProcess && <label><span>Loại gia công</span><select value={operationType} onChange={(e) => setOperationType(e.target.value as "CUT" | "LONG")}><option value="CUT">Cắt</option><option value="LONG">Lồng</option></select></label>}
      {!capabilities.isManualOnlyProcess && <label><span>Hình thức</span><select value={operationMode} onChange={(e) => setOperationMode(e.target.value as "MANUAL" | "MACHINE")}><option value="MANUAL">Tay</option><option value="MACHINE">Máy</option></select></label>}
    </div></section>

    {operationMode === "MANUAL" && <section className="detail-section"><h2>Sản phẩm & sản lượng</h2><div className="detail-grid">
      <label><span>Mã sản phẩm</span><select value={form.productName} onChange={(e) => updateForm("productName", e.target.value)}><option value="">Chọn sản phẩm</option>{productOptions.map((p) => <option key={`${p.id}-${p.product_code}`} value={p.product_code}>{p.product_code}</option>)}</select></label>
      <label><span>Mã máy</span><input value={form.machineNo} onChange={(e) => updateForm("machineNo", e.target.value)} /></label>
      <label><span>Định mức / giờ</span><input type="number" value={form.standardOutput} onChange={(e) => updateForm("standardOutput", e.target.value)} /></label>
      <label><span>Sản lượng thực tế</span><input type="number" value={form.actualOutput} onChange={(e) => updateForm("actualOutput", e.target.value)} /></label>
      <label><span>TT OK</span><input type="number" value={form.ttOk} onChange={(e) => updateForm("ttOk", e.target.value)} /></label>
      <label><span>TT NG</span><input type="number" value={form.ttNg} onChange={(e) => updateForm("ttNg", e.target.value)} /></label>
    </div></section>}

    {operationMode === "MACHINE" && <section className="detail-section"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h2>Máy / sản phẩm</h2><button type="button" className="back-btn" onClick={addMachine} disabled={machineLines.length >= 4}>+ Thêm máy</button></div><div style={{ display: "grid", gap: 10 }}>
      {machineLines.map((line, index) => { const products = filteredProducts(line.machineCode); return <div key={index} style={{ border: "1px solid #d9e2ef", borderRadius: 10, padding: 12 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><strong>Máy {index + 1}</strong>{machineLines.length > 1 && <button type="button" className="back-btn" onClick={() => removeMachine(index)}>Xóa</button>}</div><div className="detail-grid">
        <label><span>Mã máy</span><select value={line.machineCode} onChange={(e) => updateLine(index, { machineCode: e.target.value, productCode: "" })}><option value="">Chọn máy</option>{machineOptions.map((m) => <option key={m.id} value={m.machine_code}>{m.machine_code}</option>)}</select></label>
        <label><span>Mã sản phẩm</span><select value={line.productCode} disabled={!line.machineCode} onChange={(e) => updateLine(index, { productCode: e.target.value })}><option value="">Chọn sản phẩm</option>{products.map((p) => <option key={`${p.id}-${p.product_code}`} value={p.product_code}>{p.product_code}</option>)}</select></label>
        <label><span>Giờ chạy máy</span><input type="number" min="0" value={line.hours} onChange={(e) => updateLine(index, { hours: e.target.value })} /></label>
        <label><span>Phút chạy máy</span><input type="number" min="0" max="59" value={line.minutes} onChange={(e) => updateLine(index, { minutes: e.target.value })} /></label>
        <label><span>OK</span><input type="number" min="0" value={line.okQuantity} onChange={(e) => updateLine(index, { okQuantity: e.target.value })} /></label>
        <label><span>NG</span><input type="number" min="0" value={line.ngQuantity} onChange={(e) => updateLine(index, { ngQuantity: e.target.value })} /></label>
      </div></div>; })}
    </div></section>}

    <section className="detail-section"><h2>Thời gian làm việc</h2><div className="detail-grid">
      <label><span>Giờ thực tế</span><input type="number" min="0" value={form.actualHours} onChange={(e) => updateForm("actualHours", e.target.value)} /></label>
      <label><span>Phút thực tế</span><input type="number" min="0" max="59" value={form.actualMinutes} onChange={(e) => updateForm("actualMinutes", e.target.value)} /></label>
      <label><span>Thời gian trừ (giờ:phút)</span><input value={form.deductionTime} placeholder="0:00" onChange={(e) => updateForm("deductionTime", e.target.value)} /></label>
      <label><span>Tổng thời gian</span><input value={form.totalTime} onChange={(e) => updateForm("totalTime", e.target.value)} /></label>
    </div></section>

    <section className="detail-section"><h2>Lỗi NG</h2><div className="detail-grid">{ngFields.map((option: any) => <label key={option.key}><span>{option.label || option.defect_name || option.code}</span><input type="number" min="0" value={form[option.key] || ""} onChange={(e) => updateForm(option.key, e.target.value)} /></label>)}</div></section>

    <section className="detail-section"><h2>Trừ giờ</h2><div className="detail-grid">{activeDeductionOptions.map((option: any) => <label key={option.key}><span>{option.label}</span><input type="number" min="0" value={deductions[option.key] || ""} onChange={(e) => setDeductions((current) => ({ ...current, [option.key]: e.target.value }))} placeholder="phút" /></label>)}</div></section>

    <section className="detail-section"><h2>Ghi chú</h2><textarea value={form.note} onChange={(e) => updateForm("note", e.target.value)} rows={3} style={{ width: "100%", resize: "vertical" }} /></section>

    {Object.keys(extraData).length > 0 && <section className="detail-section"><h2>Thông tin bổ sung</h2><div className="detail-grid">{Object.entries(extraData).map(([key, value]) => <label key={key}><span>{key}</span><input value={value} onChange={(e) => setExtraData((current) => ({ ...current, [key]: e.target.value }))} /></label>)}</div></section>}

    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}><button type="button" className="back-btn" onClick={() => navigate(-1)}>Hủy</button><button type="button" className="back-btn" disabled={saving || remaining <= 0} onClick={() => void save()}>{saving ? "Đang lưu..." : "Lưu thay đổi"}</button></div>
  </main></div>;
}

export default WorkerReportEdit;
