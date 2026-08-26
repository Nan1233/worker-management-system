import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { getApprovedReports, getReportById, updateReport } from "../../services/productionService";
import { getCachedDefects, getCachedDeductions } from "../../services/masterDataCache";
import { normalizeDefectOptions, normalizeDeductionOptions, type WorkerMasterOption } from "../worker/processMasterDataNormalization";
import type { ProductionDeduction, ProductionDefect, ProductionReport } from "../../types/production";
import { useToast } from "../../components/feedback/toastContext";
import { getToday } from "./managerReportDateLogic";
import "./ManagerExcelReports.css";

type DatePreset = "today" | "yesterday" | "week" | "last-week" | "month" | "last-month" | "custom";
const PROCESS_TABS = ["CÁN", "ÉP", "XLBV", "Cắt lồng", "TT Mài", "TT Đo", "TT Kiểm 1", "TT Kiểm 2"];
const num = (v: unknown) => Number(v || 0);
const fmt = (v: unknown) => num(v).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const pct = (v: unknown) => `${fmt(v)}%`;
const text = (v: unknown, fallback = "—") => v === undefined || v === null || v === "" ? fallback : String(v);
const dateFmt = (v?: string) => v ? `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}/${String(v).slice(0, 4)}` : "—";
const parseDate = (v: string) => { const [y, m, d] = v.split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const monthEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const weekStart = (d: Date) => { const x = new Date(d); const day = x.getDay(); x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day)); return x; };
const weekEnd = (d: Date) => { const x = weekStart(d); x.setDate(x.getDate() + 6); return x; };
const initialRange = () => { const d = parseDate(getToday()); return { from: iso(monthStart(d)), to: iso(monthEnd(d)) }; };

const deductionValue = (r: ProductionReport, o: WorkerMasterOption) => {
  const x = (r.deductions || []).find((d) => (o.deduction_type_id && d.deduction_type_id === o.deduction_type_id) || (o.deduction_code && d.deduction_code === o.deduction_code) || d.deduction_name.trim().toUpperCase() === o.label.trim().toUpperCase());
  return num(x?.hours);
};
const defectValue = (r: ProductionReport, o: WorkerMasterOption) => {
  const x = (r.defects || []).find((d) => (o.defect_type_id && d.defect_type_id === o.defect_type_id) || (o.defect_code && d.defect_code === o.defect_code) || d.defect_name.trim().toUpperCase() === o.label.trim().toUpperCase());
  return num(x?.quantity);
};
const setDeductionValue = (r: ProductionReport, o: WorkerMasterOption, hours: number): ProductionDeduction[] => {
  const rows = [...(r.deductions || [])];
  const i = rows.findIndex((d) => (o.deduction_type_id && d.deduction_type_id === o.deduction_type_id) || (o.deduction_code && d.deduction_code === o.deduction_code) || d.deduction_name.trim().toUpperCase() === o.label.trim().toUpperCase());
  const item: ProductionDeduction = { id: i >= 0 ? rows[i].id : undefined, deduction_type_id: o.deduction_type_id, deduction_code: o.deduction_code || o.code, deduction_name: o.label, hours: Math.max(0, hours) };
  if (i >= 0) rows[i] = item; else if (hours > 0) rows.push(item);
  return rows;
};
const setDefectValue = (r: ProductionReport, o: WorkerMasterOption, quantity: number): ProductionDefect[] => {
  const rows = [...(r.defects || [])];
  const i = rows.findIndex((d) => (o.defect_type_id && d.defect_type_id === o.defect_type_id) || (o.defect_code && d.defect_code === o.defect_code) || d.defect_name.trim().toUpperCase() === o.label.trim().toUpperCase());
  const item: ProductionDefect = { id: i >= 0 ? rows[i].id : undefined, defect_type_id: o.defect_type_id, defect_code: o.defect_code || o.code, defect_name: o.label, quantity: Math.max(0, Math.round(quantity)) };
  if (i >= 0) rows[i] = item; else if (quantity > 0) rows.push(item);
  return rows;
};

export default function ManagerReportGrid() {
  const { showToast } = useToast();
  const initial = initialRange();
  const [process, setProcess] = useState(PROCESS_TABS[0]);
  const [dateFrom, setDateFrom] = useState(initial.from);
  const [dateTo, setDateTo] = useState(initial.to);
  const [preset, setPreset] = useState<DatePreset>("month");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [reports, setReports] = useState<ProductionReport[]>([]);
  const [drafts, setDrafts] = useState<Record<number, ProductionReport>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processId, setProcessId] = useState<number | null>(null);
  const [deductions, setDeductions] = useState<WorkerMasterOption[]>([]);
  const [defects, setDefects] = useState<WorkerMasterOption[]>([]);
  const pageSize = 20;

  const applyPreset = (next: DatePreset) => {
    const d = parseDate(getToday()); let from = d; let to = d;
    if (next === "yesterday") { from = new Date(d); from.setDate(from.getDate() - 1); to = new Date(from); }
    else if (next === "week") { from = weekStart(d); to = weekEnd(d); }
    else if (next === "last-week") { to = weekStart(d); to.setDate(to.getDate() - 1); from = new Date(to); from.setDate(from.getDate() - 6); }
    else if (next === "month") { from = monthStart(d); to = monthEnd(d); }
    else if (next === "last-month") { from = new Date(d.getFullYear(), d.getMonth() - 1, 1); to = new Date(d.getFullYear(), d.getMonth(), 0); }
    else { setPreset("custom"); return; }
    setPreset(next); setDateFrom(iso(from)); setDateTo(iso(to)); setPage(1);
  };

  const load = async () => {
    try {
      setLoading(true);
      const result = await getApprovedReports({ dateFrom, dateTo, processName: process, search: search.trim() || undefined, page, pageSize });
      const list = result.data || [];
      const full = await Promise.all(list.map(async (row) => {
        try { return await getReportById(Number(row.id), "approved"); } catch { return row; }
      }));
      setReports(full);
      setTotal(Number(result.pagination?.total || full.length));
      setProcessId(Number(full[0]?.process_id || 0) || null);
    } catch (error) {
      showToast(axios.isAxiosError(error) ? error.response?.data?.message || "Không thể tải báo cáo đã duyệt" : "Không thể tải báo cáo đã duyệt");
      setReports([]); setTotal(0); setProcessId(null);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [process, dateFrom, dateTo, search, page]);
  useEffect(() => { setPage(1); setEditing(null); setDrafts({}); }, [process, dateFrom, dateTo, search]);
  useEffect(() => {
    let alive = true;
    if (!processId) { setDeductions([]); setDefects([]); return; }
    Promise.all([getCachedDefects(processId), getCachedDeductions(processId)]).then(([d, h]) => {
      if (!alive) return;
      setDefects(normalizeDefectOptions(d, processId));
      setDeductions(normalizeDeductionOptions(h, processId));
    }).catch(() => { if (alive) { setDefects([]); setDeductions([]); } });
    return () => { alive = false; };
  }, [processId]);

  const row = (r: ProductionReport) => drafts[Number(r.id)] || r;
  const totalDeduction = (r: ProductionReport) => deductions.reduce((s, o) => s + deductionValue(r, o), 0);
  const totalTime = (r: ProductionReport) => num(r.actual_time) + totalDeduction(r);
  const standard = (r: ProductionReport) => num((r as any).standard_output ?? (r as any).target_output);
  const tt = (r: ProductionReport) => num(r.actual_output);
  const ok = (r: ProductionReport) => num(r.tt_ok);
  const ng = (r: ProductionReport) => {
    const detail = defects.reduce((s, o) => s + defectValue(r, o), 0);
    return detail || num(r.tt_ng);
  };
  const ttDinhMuc = (r: ProductionReport) => num((r as any).tt_dinh_muc) || standard(r) * num(r.actual_time);
  const nangSuat = (r: ProductionReport) => num((r as any).nang_suat_percent) || (ttDinhMuc(r) > 0 ? tt(r) / ttDinhMuc(r) * 100 : 0);
  const dat = (r: ProductionReport) => tt(r) > 0 ? ok(r) / tt(r) * 100 : 0;
  const pp = (r: ProductionReport) => num((r as any).pp_percent) || (tt(r) > 0 ? ng(r) / tt(r) * 100 : 0);

  const beginEdit = (r: ProductionReport) => setDrafts((p) => ({ ...p, [Number(r.id)]: { ...r, deductions: [...(r.deductions || [])], defects: [...(r.defects || [])] } }));
  const setField = (id: number, field: keyof ProductionReport, value: string | number) => setDrafts((p) => ({ ...p, [id]: { ...p[id], [field]: value } }));
  const setDeduction = (id: number, o: WorkerMasterOption, value: string) => setDrafts((p) => ({ ...p, [id]: { ...p[id], deductions: setDeductionValue(p[id], o, num(value)) } }));
  const setDefect = (id: number, o: WorkerMasterOption, value: string) => setDrafts((p) => ({ ...p, [id]: { ...p[id], defects: setDefectValue(p[id], o, num(value)) } }));

  const save = async (original: ProductionReport) => {
    const id = Number(original.id); const d = drafts[id]; if (!d) return;
    const totalHours = totalTime(d);
    if (totalHours > 12) { showToast("Tổng giờ không được vượt quá 12 giờ"); return; }
    const ngValue = defects.reduce((s, o) => s + defectValue(d, o), 0);
    const payload: ProductionReport = {
      ...d,
      actual_time: Math.max(0, num(d.actual_time)),
      deduction_time: totalDeduction(d),
      total_time: totalHours,
      actual_output: Math.max(0, num(d.actual_output)),
      tt_ok: Math.max(0, num(d.tt_ok)),
      tt_ng: ngValue,
      deductions: (d.deductions || []).filter((x) => num(x.hours) > 0),
      defects: (d.defects || []).filter((x) => num(x.quantity) > 0),
    };
    try {
      setSaving(true); await updateReport(id, payload, "approved", d.updated_at || null); showToast("Đã cập nhật báo cáo", "success"); setEditing(null);
      setDrafts((p) => { const n = { ...p }; delete n[id]; return n; }); await load();
    } catch (error) { showToast(axios.isAxiosError(error) ? error.response?.data?.message || "Không thể cập nhật báo cáo" : "Không thể cập nhật báo cáo"); }
    finally { setSaving(false); }
  };

  const input = (id: number, field: keyof ProductionReport, value: unknown, type: "text" | "number" = "text") => <input className="manager-excel-cell-input" type={type} min={type === "number" ? 0 : undefined} step={type === "number" ? "0.01" : undefined} value={value ?? ""} onChange={(e) => setField(id, field, type === "number" ? num(e.target.value) : e.target.value)} />;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return <div className="manager-excel-page">
    <header className="manager-excel-head"><div><h1>Quản lý báo cáo</h1><p>Chỉ báo cáo đã duyệt · dữ liệu theo từng công đoạn · nhập trực tiếp bằng bàn phím và Tab.</p></div><button type="button" onClick={() => void load()} disabled={loading}>↻ Làm mới</button></header>
    <div className="manager-excel-tabs">{PROCESS_TABS.map((name) => <button key={name} type="button" className={process === name ? "active" : ""} onClick={() => setProcess(name)}>{name}</button>)}</div>
    <section className="manager-excel-filters">
      <label>Khoảng thời gian<select value={preset} onChange={(e) => applyPreset(e.target.value as DatePreset)}><option value="today">Hôm nay</option><option value="yesterday">Hôm qua</option><option value="week">Tuần này</option><option value="last-week">Tuần trước</option><option value="month">Tháng này</option><option value="last-month">Tháng trước</option><option value="custom">Tùy chọn</option></select></label>
      <label>Từ ngày<input type="date" value={dateFrom} onChange={(e) => { setPreset("custom"); setDateFrom(e.target.value); }} /></label>
      <label>Đến ngày<input type="date" value={dateTo} min={dateFrom} onChange={(e) => { setPreset("custom"); setDateTo(e.target.value); }} /></label>
      <label className="search">Tìm kiếm<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Mã CN, họ tên, máy, sản phẩm..." /></label>
    </section>
    <section className="manager-excel-table-card"><div className="manager-excel-table-wrap"><table className="manager-excel-table"><thead><tr>
      <th className="sticky date">Ngày</th><th className="sticky code">Mã CN</th><th className="sticky name">Họ tên</th><th>Ca</th><th>Máy</th><th>Sản phẩm</th><th>% HV</th>
      <th>TT giờ</th><th>Trừ giờ</th>{deductions.map((o) => <th key={`dh-${o.key}`}>{o.label}</th>)}<th>Tổng giờ</th><th>Định mức/h</th><th>TT định mức</th><th>TT</th><th>OK</th><th>NG</th><th>% năng suất</th><th>% đạt</th><th>% PP</th>{defects.map((o) => <th key={`ng-${o.key}`}>{o.label}</th>)}<th>Ghi chú</th><th>Trạng thái</th>
    </tr></thead><tbody>
      {loading ? <tr><td colSpan={30 + deductions.length + defects.length} className="empty">Đang tải...</td></tr> : !reports.length ? <tr><td colSpan={30 + deductions.length + defects.length} className="empty">Không có báo cáo đã duyệt của công đoạn này.</td></tr> : reports.map((original) => {
        const id = Number(original.id); const r = row(original); const isEditing = editing === id;
        return <tr key={id} className={isEditing ? "editing" : ""} onClick={() => { if (!isEditing) { beginEdit(original); setEditing(id); } }}>
          <td className="sticky date">{dateFmt(r.work_date)}</td><td className="sticky code">{text(r.worker_code)}</td><td className="sticky name">{text(r.full_name)}</td>
          <td>{isEditing ? input(id, "shift", r.shift) : text(r.shift)}</td><td>{isEditing ? input(id, "machine_no", r.machine_no) : text(r.machine_no)}</td><td className="wide">{isEditing ? input(id, "product_name", r.product_name) : text(r.product_name)}</td><td>{pct(r.training_percent ?? (r as any).training_percent_snapshot)}</td>
          <td className="editable-cell">{isEditing ? input(id, "actual_time", r.actual_time, "number") : fmt(r.actual_time)}</td><td className="calculated-cell">{fmt(totalDeduction(r))}</td>
          {deductions.map((o) => <td key={`dv-${id}-${o.key}`} className="editable-cell">{isEditing ? <input className="manager-excel-cell-input" type="number" min="0" step="0.01" value={deductionValue(r, o)} onChange={(e) => setDeduction(id, o, e.target.value)} /> : fmt(deductionValue(r, o))}</td>)}
          <td className={`calculated-cell ${totalTime(r) > 12 ? "invalid-cell" : ""}`}>{fmt(totalTime(r))}</td><td className="calculated-cell">{fmt(standard(r))}</td><td className="calculated-cell">{fmt(ttDinhMuc(r))}</td>
          <td className="editable-cell">{isEditing ? input(id, "actual_output", r.actual_output, "number") : fmt(tt(r))}</td><td className="editable-cell">{isEditing ? input(id, "tt_ok", r.tt_ok, "number") : fmt(ok(r))}</td><td className="calculated-cell">{fmt(ng(r))}</td><td className="calculated-cell">{pct(nangSuat(r))}</td><td className="calculated-cell">{pct(dat(r))}</td><td className="calculated-cell">{pct(pp(r))}</td>
          {defects.map((o) => <td key={`nv-${id}-${o.key}`} className="editable-cell">{isEditing ? <input className="manager-excel-cell-input" type="number" min="0" step="1" value={defectValue(r, o)} onChange={(e) => setDefect(id, o, e.target.value)} /> : fmt(defectValue(r, o))}</td>)}
          <td className="wide">{isEditing ? input(id, "note", r.note) : text(r.note)}</td><td><span className="approved-badge">Đã duyệt</span></td>
          {isEditing && <td className="save-cell"><button type="button" disabled={saving} onClick={(e) => { e.stopPropagation(); void save(original); }}>Lưu</button><button type="button" disabled={saving} onClick={(e) => { e.stopPropagation(); setEditing(null); setDrafts((p) => { const n = { ...p }; delete n[id]; return n; }); }}>Hủy</button></td>}
        </tr>;
      })}
    </tbody></table></div><footer className="manager-excel-footer"><span>{total} báo cáo đã duyệt · Tổng giờ = TT giờ + các loại Trừ giờ · Tổng giờ tối đa 12h</span><div><button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button><strong>{page} / {pages}</strong><button disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>›</button></div></footer></section>
  </div>;
}
