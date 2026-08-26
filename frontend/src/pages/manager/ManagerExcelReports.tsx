import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  getApprovedReports,
  getCachedDefects,
  getCachedDeductions,
  getReportById,
  updateReport,
} from "../../services/productionService";
import type { ProductionReport, ProductionDeduction, ProductionDefect } from "../../types/production";
import { normalizeDefectOptions, normalizeDeductionOptions, type WorkerMasterOption } from "../worker/processMasterDataNormalization";
import { useToast } from "../../components/feedback/toastContext";
import { getToday } from "./managerReportDateLogic";
import "./ManagerExcelReports.css";

type DatePreset = "today" | "yesterday" | "week" | "last-week" | "month" | "last-month" | "custom";
type EditableField = "shift" | "machine_no" | "product_name" | "actual_time" | "actual_output" | "tt_ok" | "note";

const PROCESS_TABS = [
  "CÁN",
  "ÉP",
  "XLBV",
  "Cắt lồng",
  "TT Mài",
  "TT Đo",
  "TT Kiểm 1",
  "TT Kiểm 2",
];

const text = (value: unknown, fallback = "—") => value === undefined || value === null || value === "" ? fallback : String(value);
const num = (value: unknown) => Number(value || 0);
const fmt = (value: unknown) => num(value).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const pct = (value: unknown) => `${fmt(value)}%`;
const dateFmt = (value?: string) => value ? `${String(value).slice(8, 10)}/${String(value).slice(5, 7)}/${String(value).slice(0, 4)}` : "—";
const parseDate = (value: string) => { const [y, m, d] = value.split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const monthEnd = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);
const weekStart = (date: Date) => { const result = new Date(date); const day = result.getDay(); result.setDate(result.getDate() + (day === 0 ? -6 : 1 - day)); return result; };
const weekEnd = (date: Date) => { const result = weekStart(date); result.setDate(result.getDate() + 6); return result; };
const initialRange = () => { const d = parseDate(getToday()); return { from: isoDate(monthStart(d)), to: isoDate(monthEnd(d)) }; };

const getDeductionValue = (report: ProductionReport, option: WorkerMasterOption) => {
  const item = (report.deductions || []).find((d) =>
    (option.deduction_type_id && d.deduction_type_id === option.deduction_type_id) ||
    (option.deduction_code && d.deduction_code === option.deduction_code) ||
    d.deduction_name.trim().toUpperCase() === option.label.trim().toUpperCase()
  );
  return num(item?.hours);
};

const getDefectValue = (report: ProductionReport, option: WorkerMasterOption) => {
  const item = (report.defects || []).find((d) =>
    (option.defect_type_id && d.defect_type_id === option.defect_type_id) ||
    (option.defect_code && d.defect_code === option.defect_code) ||
    d.defect_name.trim().toUpperCase() === option.label.trim().toUpperCase()
  );
  return num(item?.quantity);
};

const upsertDeduction = (report: ProductionReport, option: WorkerMasterOption, hours: number): ProductionDeduction[] => {
  const rows = [...(report.deductions || [])];
  const index = rows.findIndex((d) =>
    (option.deduction_type_id && d.deduction_type_id === option.deduction_type_id) ||
    (option.deduction_code && d.deduction_code === option.deduction_code) ||
    d.deduction_name.trim().toUpperCase() === option.label.trim().toUpperCase()
  );
  const item: ProductionDeduction = {
    id: index >= 0 ? rows[index].id : undefined,
    deduction_type_id: option.deduction_type_id,
    deduction_code: option.deduction_code || option.code,
    deduction_name: option.label,
    hours: Math.max(0, hours),
  };
  if (index >= 0) rows[index] = item;
  else if (hours > 0) rows.push(item);
  return rows;
};

const upsertDefect = (report: ProductionReport, option: WorkerMasterOption, quantity: number): ProductionDefect[] => {
  const rows = [...(report.defects || [])];
  const index = rows.findIndex((d) =>
    (option.defect_type_id && d.defect_type_id === option.defect_type_id) ||
    (option.defect_code && d.defect_code === option.defect_code) ||
    d.defect_name.trim().toUpperCase() === option.label.trim().toUpperCase()
  );
  const item: ProductionDefect = {
    id: index >= 0 ? rows[index].id : undefined,
    defect_type_id: option.defect_type_id,
    defect_code: option.defect_code || option.code,
    defect_name: option.label,
    quantity: Math.max(0, Math.round(quantity)),
  };
  if (index >= 0) rows[index] = item;
  else if (quantity > 0) rows.push(item);
  return rows;
};

export default function ManagerExcelReports() {
  const { showToast } = useToast();
  const range = initialRange();
  const [process, setProcess] = useState(PROCESS_TABS[0]);
  const [dateFrom, setDateFrom] = useState(range.from);
  const [dateTo, setDateTo] = useState(range.to);
  const [preset, setPreset] = useState<DatePreset>("month");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reports, setReports] = useState<ProductionReport[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, ProductionReport>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [masterLoading, setMasterLoading] = useState(false);
  const [deductions, setDeductions] = useState<WorkerMasterOption[]>([]);
  const [defects, setDefects] = useState<WorkerMasterOption[]>([]);
  const [processId, setProcessId] = useState<number | null>(null);
  const pageSize = 20;

  const applyPreset = (next: DatePreset) => {
    const today = parseDate(getToday()); let from = today; let to = today;
    if (next === "yesterday") { from = new Date(today); from.setDate(from.getDate() - 1); to = new Date(from); }
    else if (next === "week") { from = weekStart(today); to = weekEnd(today); }
    else if (next === "last-week") { to = weekStart(today); to.setDate(to.getDate() - 1); from = new Date(to); from.setDate(from.getDate() - 6); }
    else if (next === "month") { from = monthStart(today); to = monthEnd(today); }
    else if (next === "last-month") { from = new Date(today.getFullYear(), today.getMonth() - 1, 1); to = new Date(today.getFullYear(), today.getMonth(), 0); }
    else { setPreset("custom"); return; }
    setPreset(next); setDateFrom(isoDate(from)); setDateTo(isoDate(to)); setPage(1);
  };

  const load = async () => {
    try {
      setLoading(true);
      const result = await getApprovedReports({ dateFrom, dateTo, processName: process, search: search.trim() || undefined, page, pageSize });
      const list = result.data || [];
      const full = await Promise.all(list.map(async (row) => {
        try { return await getReportById(Number(row.id), "approved"); }
        catch { return row; }
      }));
      setReports(full);
      setProcessId(Number(full[0]?.process_id || 0) || null);
    } catch (error) {
      showToast(axios.isAxiosError(error) ? error.response?.data?.message || "Không thể tải báo cáo đã duyệt" : "Không thể tải báo cáo đã duyệt");
      setReports([]);
      setProcessId(null);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [process, dateFrom, dateTo, search, page]);
  useEffect(() => { setPage(1); setEditing(null); }, [process, dateFrom, dateTo, search]);

  useEffect(() => {
    let alive = true;
    const loadMaster = async () => {
      if (!processId) { setDeductions([]); setDefects([]); return; }
      setMasterLoading(true);
      try {
        const [rawDefects, rawDeductions] = await Promise.all([
          getCachedDefects(processId),
          getCachedDeductions(processId),
        ]);
        if (!alive) return;
        setDefects(normalizeDefectOptions(rawDefects, processId));
        setDeductions(normalizeDeductionOptions(rawDeductions, processId));
      } catch {
        if (alive) { setDefects([]); setDeductions([]); }
      } finally { if (alive) setMasterLoading(false); }
    };
    void loadMaster();
    return () => { alive = false; };
  }, [processId]);

  const totalPages = Math.max(1, Math.ceil((reports.length ? reports.length : 0) / pageSize));

  const getRow = (report: ProductionReport) => drafts[Number(report.id)] || report;
  const deductionTotal = (report: ProductionReport) => deductions.reduce((sum, option) => sum + getDeductionValue(report, option), 0);
  const getActualTime = (report: ProductionReport) => num(report.actual_time);
  const getTotalTime = (report: ProductionReport) => getActualTime(report) + deductionTotal(report);
  const getStandard = (report: ProductionReport) => num((report as any).standard_output ?? (report as any).target_output);
  const getTT = (report: ProductionReport) => num(report.actual_output);
  const getOK = (report: ProductionReport) => num(report.tt_ok);
  const getNG = (report: ProductionReport) => defects.reduce((sum, option) => sum + getDefectValue(report, option), 0) || num(report.tt_ng);
  const getTTDM = (report: ProductionReport) => {
    const stored = num((report as any).tt_dinh_muc);
    return stored || getStandard(report) * getActualTime(report);
  };
  const getNangSuat = (report: ProductionReport) => {
    const stored = Number((report as any).nang_suat_percent);
    return Number.isFinite(stored) && stored !== 0 ? stored : getTTDM(report) > 0 ? getTT(report) / getTTDM(report) * 100 : 0;
  };
  const getDat = (report: ProductionReport) => getTT(report) > 0 ? getOK(report) / getTT(report) * 100 : 0;
  const getPP = (report: ProductionReport) => {
    const stored = Number((report as any).pp_percent);
    return Number.isFinite(stored) && stored !== 0 ? stored : getTT(report) > 0 ? getNG(report) / getTT(report) * 100 : 0;
  };

  const beginEdit = (report: ProductionReport) => {
    const id = Number(report.id);
    setDrafts((prev) => ({ ...prev, [id]: { ...report, deductions: [...(report.deductions || [])], defects: [...(report.defects || [])] } }));
    setEditing(id);
  };

  const setDraftField = (id: number, field: EditableField, value: string | number) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const setDeduction = (id: number, option: WorkerMasterOption, value: string) => {
    setDrafts((prev) => {
      const report = prev[id];
      if (!report) return prev;
      return { ...prev, [id]: { ...report, deductions: upsertDeduction(report, option, num(value)) } };
    });
  };

  const setDefect = (id: number, option: WorkerMasterOption, value: string) => {
    setDrafts((prev) => {
      const report = prev[id];
      if (!report) return prev;
      return { ...prev, [id]: { ...report, defects: upsertDefect(report, option, num(value)) } };
    });
  };

  const save = async (report: ProductionReport) => {
    const id = Number(report.id);
    const draft = drafts[id];
    if (!draft) return;
    const totalTime = getTotalTime(draft);
    if (totalTime > 12) {
      showToast("Tổng giờ không được vượt quá 12 giờ");
      return;
    }
    const ng = defects.reduce((sum, option) => sum + getDefectValue(draft, option), 0);
    const payload: ProductionReport = {
      ...draft,
      actual_time: Math.max(0, num(draft.actual_time)),
      deduction_time: deductionTotal(draft),
      total_time: totalTime,
      actual_output: Math.max(0, num(draft.actual_output)),
      tt_ok: Math.max(0, num(draft.tt_ok)),
      tt_ng: ng,
      deductions: (draft.deductions || []).filter((d) => num(d.hours) > 0),
      defects: (draft.defects || []).filter((d) => num(d.quantity) > 0),
    };
    try {
      setSaving(true);
      await updateReport(id, payload, "approved", draft.updated_at || null);
      showToast("Đã cập nhật báo cáo", "success");
      setEditing(null);
      setDrafts((prev) => { const next = { ...prev }; delete next[id]; return next; });
      await load();
    } catch (error) {
      showToast(axios.isAxiosError(error) ? error.response?.data?.message || "Không thể cập nhật báo cáo" : "Không thể cập nhật báo cáo");
    } finally { setSaving(false); }
  };

  const cancelEdit = (id: number) => {
    setEditing(null);
    setDrafts((prev) => { const next = { ...prev }; delete next[id]; return next; });
  };

  const updateFromInput = (id: number, field: EditableField, value: string) => {
    const numericFields: EditableField[] = ["actual_time", "actual_output", "tt_ok"];
    setDraftField(id, field, numericFields.includes(field) ? num(value) : value);
  };

  const renderInput = (id: number, field: EditableField, value: unknown, type: "text" | "number" = "text") => (
    <input
      className="manager-excel-cell-input"
      type={type}
      step={type === "number" ? "0.01" : undefined}
      value={value ?? ""}
      onChange={(event) => updateFromInput(id, field, event.target.value)}
      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
    />
  );

  return (
    <div className="manager-excel-page">
      <header className="manager-excel-head">
        <div>
          <h1>Quản lý báo cáo</h1>
          <p>Chỉ báo cáo đã duyệt · chỉnh sửa trực tiếp như Excel · nhấn Tab để chuyển ô.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}>↻ Làm mới</button>
      </header>

      <div className="manager-excel-tabs">
        {PROCESS_TABS.map((tab) => (
          <button key={tab} type="button" className={process === tab ? "active" : ""} onClick={() => setProcess(tab)}>{tab}</button>
        ))}
      </div>

      <section className="manager-excel-filters">
        <label>Khoảng thời gian<select value={preset} onChange={(e) => applyPreset(e.target.value as DatePreset)}>
          <option value="today">Hôm nay</option><option value="yesterday">Hôm qua</option><option value="week">Tuần này</option><option value="last-week">Tuần trước</option><option value="month">Tháng này</option><option value="last-month">Tháng trước</option><option value="custom">Tùy chọn</option>
        </select></label>
        <label>Từ ngày<input type="date" value={dateFrom} onChange={(e) => { setPreset("custom"); setDateFrom(e.target.value); }} /></label>
        <label>Đến ngày<input type="date" value={dateTo} min={dateFrom} onChange={(e) => { setPreset("custom"); setDateTo(e.target.value); }} /></label>
        <label className="search">Tìm kiếm<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Mã CN, họ tên, máy, sản phẩm..." /></label>
      </section>

      {masterLoading && <div className="manager-excel-master-loading">Đang tải cấu hình cột của công đoạn...</div>}

      <section className="manager-excel-table-card">
        <div className="manager-excel-table-wrap">
          <table className="manager-excel-table">
            <thead>
              <tr>
                <th className="sticky date">Ngày</th><th className="sticky code">Mã CN</th><th className="sticky name">Họ tên</th>
                <th>Ca</th><th>Máy</th><th>Sản phẩm</th><th>% HV</th>
                <th>TT giờ</th><th>Trừ giờ</th>
                {deductions.map((option) => <th key={`d-${option.key}`}>{option.label}</th>)}
                <th>Tổng giờ</th><th>Định mức/h</th><th>TT định mức</th><th>TT</th><th>OK</th><th>NG</th><th>% năng suất</th><th>% đạt</th><th>% PP</th>
                {defects.map((option) => <th key={`n-${option.key}`}>{option.label}</th>)}
                <th>Ghi chú</th><th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={24 + deductions.length + defects.length} className="empty">Đang tải dữ liệu...</td></tr> : !reports.length ? <tr><td colSpan={24 + deductions.length + defects.length} className="empty">Không có báo cáo đã duyệt của công đoạn này trong khoảng thời gian đã chọn.</td></tr> : reports.map((original) => {
                const id = Number(original.id);
                const report = getRow(original);
                const isEditing = editing === id;
                const totalTime = getTotalTime(report);
                return (
                  <tr key={id} className={isEditing ? "editing" : ""}>
                    <td className="sticky date">{dateFmt(report.work_date)}</td>
                    <td className="sticky code">{text(report.worker_code)}</td>
                    <td className="sticky name">{text(report.full_name)}</td>
                    <td>{isEditing ? renderInput(id, "shift", report.shift) : text(report.shift)}</td>
                    <td>{isEditing ? renderInput(id, "machine_no", report.machine_no) : text(report.machine_no)}</td>
                    <td className="wide">{isEditing ? renderInput(id, "product_name", report.product_name) : text(report.product_name)}</td>
                    <td>{pct(report.training_percent ?? (report as any).training_percent_snapshot)}</td>
                    <td className="editable-cell">{isEditing ? renderInput(id, "actual_time", getActualTime(report), "number") : fmt(getActualTime(report))}</td>
                    <td className="calculated-cell">{fmt(deductionTotal(report))}</td>
                    {deductions.map((option) => <td key={`dv-${id}-${option.key}`} className="editable-cell">{isEditing ? <input className="manager-excel-cell-input" type="number" min="0" step="0.01" value={getDeductionValue(report, option)} onChange={(e) => setDeduction(id, option, e.target.value)} /> : fmt(getDeductionValue(report, option))}</td>)}
                    <td className={`calculated-cell ${totalTime > 12 ? "invalid-cell" : ""}`}>{fmt(totalTime)}</td>
                    <td className="calculated-cell">{fmt(getStandard(report))}</td>
                    <td className="calculated-cell">{fmt(getTTDM(report))}</td>
                    <td className="editable-cell">{isEditing ? renderInput(id, "actual_output", getTT(report), "number") : fmt(getTT(report))}</td>
                    <td className="editable-cell">{isEditing ? renderInput(id, "tt_ok", getOK(report), "number") : fmt(getOK(report))}</td>
                    <td className="calculated-cell">{fmt(getNG(report))}</td>
                    <td className="calculated-cell">{pct(getNangSuat(report))}</td>
                    <td className="calculated-cell">{pct(getDat(report))}</td>
                    <td className="calculated-cell">{pct(getPP(report))}</td>
                    {defects.map((option) => <td key={`nv-${id}-${option.key}`} className="editable-cell">{isEditing ? <input className="manager-excel-cell-input" type="number" min="0" step="1" value={getDefectValue(report, option)} onChange={(e) => setDefect(id, option, e.target.value)} /> : fmt(getDefectValue(report, option))}</td>)}
                    <td className="wide">{isEditing ? renderInput(id, "note", report.note) : text(report.note)}</td>
                    <td><span className="approved-badge">Đã duyệt</span></td>
                    <td className="action-cell">
                      {isEditing ? <><button type="button" disabled={saving} onClick={() => void save(original)}>Lưu</button><button type="button" disabled={saving} onClick={() => cancelEdit(id)}>Hủy</button></> : <button type="button" onClick={() => beginEdit(original)}>Sửa</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <footer className="manager-excel-footer"><span>{reports.length} báo cáo đã duyệt · Tổng giờ = TT giờ + Trừ giờ · Tổng giờ tối đa 12h</span><div><button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button><strong>{page} / {totalPages}</strong><button disabled={reports.length < pageSize} onClick={() => setPage((p) => p + 1)}>›</button></div></footer>
      </section>
    </div>
  );
}
