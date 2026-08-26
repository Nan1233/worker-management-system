import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { approveSelectedTempReports, deleteReport, getApprovedReports, getPendingReports, getTempReportDetail, updateReport } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import { useToast } from "../../components/feedback/toastContext";
import { getToday } from "./managerReportDateLogic";
import "./ManagerExcelReports.css";

const PROCESSES = ["Tất cả", "CÁN", "ÉP", "XLBV", "Cắt lồng", "TT Mài", "TT Đo", "TT Kiểm 1", "TT Kiểm 2"];
const DEFECT_FIELDS: Array<[keyof ProductionReport, string]> = [["kqd_dap_lai", "KQD đập lại"], ["kqd_tuot", "KQD tuột"], ["vo_do_long", "Vỡ"], ["xuoc_do_long", "Xước"], ["cong_gay", "Công gãy"], ["xoay", "Xoay"], ["khong_dut", "Không đứt"], ["bavia_hut", "Bavia hút"], ["ppcm", "PPCM"], ["loi_cao_su", "Lỗi cao su"], ["ng_kich_thuoc", "NG kích thước"], ["cat_lem", "Cắt lẹm"]];
const text = (v: unknown, fallback = "—") => v === undefined || v === null || v === "" ? fallback : String(v);
const n = (v: unknown) => Number(v || 0);
const fmt = (v: unknown) => n(v).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const qty = (v: unknown) => Math.round(n(v)).toLocaleString("vi-VN");
const dateFmt = (v?: string) => v ? `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}/${String(v).slice(0, 4)}` : "—";
const rate = (r: ProductionReport) => n(r.target_output) ? n(r.actual_output) / n(r.target_output) * 100 : 0;
const ngRate = (r: ProductionReport) => n(r.actual_output) ? n(r.tt_ng) / n(r.actual_output) * 100 : 0;

export default function ManagerExcelReports() {
  const { showToast } = useToast();
  const approvedView = window.location.pathname.endsWith("/approved");
  const [process, setProcess] = useState("Tất cả");
  const [status, setStatus] = useState<"all" | "pending" | "approved">(approvedView ? "approved" : "all");
  const [date, setDate] = useState(getToday());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reports, setReports] = useState<ProductionReport[]>([]);
  const [details, setDetails] = useState<Record<number, ProductionReport>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<ProductionReport | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const load = async () => {
    try {
      setLoading(true);
      const filters = { dateFrom: date, dateTo: date, processName: process === "Tất cả" ? undefined : process, search: search.trim() || undefined, page, pageSize };
      const result = status === "approved" ? await getApprovedReports(filters) : await getPendingReports(filters);
      let rows = result.data || [];
      if (status === "all") {
        const approved = await getApprovedReports(filters);
        rows = [...rows, ...(approved.data || [])].sort((a, b) => String(b.work_date).localeCompare(String(a.work_date)));
      }
      setReports(rows);
      setTotal(status === "all" ? rows.length : result.pagination?.total || rows.length);
      const ids = rows.map(r => Number(r.id)).filter(Boolean);
      const missing = ids.filter(id => !details[id]);
      if (missing.length) {
        const loaded = await Promise.all(missing.map(async id => { try { return await getTempReportDetail(id); } catch { return null; } }));
        setDetails(prev => { const next = { ...prev }; loaded.forEach(item => { if (item?.id) next[Number(item.id)] = item; }); return next; });
      }
    } catch (err) {
      showToast(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể tải dữ liệu báo cáo" : "Không thể tải dữ liệu báo cáo");
      setReports([]);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [process, status, date, search, page]);
  useEffect(() => { setPage(1); setSelected([]); }, [process, status, date, search]);

  const rows = useMemo(() => reports.map(r => details[Number(r.id)] ? { ...r, ...details[Number(r.id)] } : r), [reports, details]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const toggle = (id: number) => setSelected(v => v.includes(id) ? v.filter(x => x !== id) : [...v, id]);
  const startEdit = (r: ProductionReport) => { setEditing(Number(r.id)); setDraft({ ...r }); };
  const setField = (field: keyof ProductionReport, value: string | number) => setDraft(d => d ? { ...d, [field]: value } : d);
  const save = async () => {
    if (!draft?.id) return;
    try {
      setSaving(true);
      const source = draft.status === "pending" ? "pending" : "approved";
      await updateReport(Number(draft.id), draft, source, draft.updated_at || null);
      showToast("Đã cập nhật báo cáo", "success"); setEditing(null); setDraft(null); await load();
    } catch (err) { showToast(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể cập nhật báo cáo" : "Không thể cập nhật báo cáo"); }
    finally { setSaving(false); }
  };
  const approve = async () => {
    if (!selected.length) return;
    try { await approveSelectedTempReports(selected.map(id => ({ id, expected_updated_at: rows.find(r => Number(r.id) === id)?.updated_at || null }))); showToast(`Đã duyệt ${selected.length} báo cáo`, "success"); setSelected([]); await load(); }
    catch (err) { showToast(axios.isAxiosError(err) ? err.response?.data?.message || "Duyệt báo cáo thất bại" : "Duyệt báo cáo thất bại"); }
  };
  const remove = async (r: ProductionReport) => {
    if (!r.id || !window.confirm(`Xóa báo cáo ${dateFmt(r.work_date)} - ${text(r.full_name)}?`)) return;
    try { await deleteReport(Number(r.id), "Quản lý xóa báo cáo"); showToast("Đã xóa báo cáo", "success"); await load(); }
    catch (err) { showToast(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể xóa báo cáo" : "Không thể xóa báo cáo"); }
  };

  const title = approvedView ? "Báo cáo đã duyệt" : "Quản lý báo cáo";
  const subtitle = approvedView ? "Xem và chỉnh sửa trực tiếp dữ liệu báo cáo đã duyệt." : "Bảng dữ liệu sản xuất đầy đủ, trình bày theo kiểu Excel để xem trực tiếp.";

  return <div className="manager-excel-page">
    <header className="manager-excel-head"><div><h1>{title}</h1><p>{subtitle}</p></div><div className="manager-excel-head-actions"><button type="button" onClick={() => void load()}>↻ Làm mới</button>{selected.length > 0 && status !== "approved" && <button className="primary" type="button" onClick={() => void approve()}>✓ Duyệt {selected.length}</button>}</div></header>
    <div className="manager-excel-tabs">{PROCESSES.map(p => <button key={p} className={process === p ? "active" : ""} onClick={() => setProcess(p)}>{p}</button>)}</div>
    <section className="manager-excel-filters"><label>Ngày<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>{!approvedView && <label>Trạng thái<select value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="all">Tất cả</option><option value="pending">Chờ duyệt</option><option value="approved">Đã duyệt</option></select></label>}<label className="search">Tìm kiếm<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Mã CN, họ tên, máy, sản phẩm..." /></label></section>
    <section className="manager-excel-table-card"><div className="manager-excel-table-wrap"><table className="manager-excel-table"><thead><tr><th className="sticky select"><input type="checkbox" checked={rows.length > 0 && rows.every(r => selected.includes(Number(r.id)))} onChange={e => setSelected(e.target.checked ? rows.map(r => Number(r.id)).filter(Boolean) : [])} /></th><th className="sticky date">Ngày</th><th className="sticky code">Mã CN</th><th className="sticky name">Họ tên</th><th>Công đoạn</th><th>Ca</th><th>Máy</th><th>Sản phẩm</th><th>% HV</th><th>Tổng giờ</th><th>Trừ giờ</th><th>TT giờ</th><th>Định mức</th><th>Thực tế</th><th>OK</th><th>NG</th><th>% đạt</th><th>% NG</th>{DEFECT_FIELDS.map(([, label]) => <th key={label}>{label}</th>)}<th>Trừ giờ chi tiết</th><th>Lỗi chi tiết</th><th>Ghi chú</th><th>Trạng thái</th><th className="action">Thao tác</th></tr></thead><tbody>{loading ? <tr><td colSpan={28} className="empty">Đang tải dữ liệu...</td></tr> : !rows.length ? <tr><td colSpan={28} className="empty">Không có báo cáo phù hợp.</td></tr> : rows.map((r, i) => {
      const id = Number(r.id); const isEdit = editing === id; const d = isEdit ? draft || r : r; const detailsRow = d.deductions || []; const defects = d.defects || [];
      return <tr key={`${id}-${i}`} className={`${selected.includes(id) ? "selected" : ""} ${isEdit ? "editing" : ""}`} onClick={() => { if (!isEdit) setSelected(v => v.includes(id) ? v : [...v, id]); }}>
        <td className="sticky select" onClick={e => e.stopPropagation()}><input type="checkbox" checked={selected.includes(id)} onChange={() => toggle(id)} /></td>
        <td className="sticky date">{dateFmt(d.work_date)}</td><td className="sticky code">{text(d.worker_code)}</td><td className="sticky name">{text(d.full_name)}</td>
        <td>{text(d.process_name)}</td><td>{text(d.shift)}</td><td>{text(d.machine_no)}</td><td className="wide">{text(d.product_name)}</td><td>{fmt(d.training_percent ?? (d as any).training_percent_snapshot)}%</td><td>{fmt(d.total_time)}</td><td>{fmt(d.deduction_time)}</td><td>{fmt(d.actual_time)}</td><td>{fmt(d.target_output ?? d.standard_output)}</td><td>{isEdit ? <input className="cell-input" type="number" value={n(d.actual_output)} onChange={e => setField("actual_output", Number(e.target.value))} /> : qty(d.actual_output)}</td><td>{isEdit ? <input className="cell-input" type="number" value={n(d.tt_ok)} onChange={e => setField("tt_ok", Number(e.target.value))} /> : qty(d.tt_ok)}</td><td>{qty(d.tt_ng)}</td><td>{fmt(rate(d))}%</td><td>{fmt(ngRate(d))}%</td>{DEFECT_FIELDS.map(([field, label]) => <td key={label}>{isEdit ? <input className="cell-input defect" type="number" value={n(d[field])} onChange={e => setField(field, Number(e.target.value))} /> : qty(d[field])}</td>)}<td className="detail-cell">{detailsRow.length ? detailsRow.map(x => `${text(x.deduction_name)} ${fmt(n(x.hours) * 60)}p`).join(" · ") : "—"}</td><td className="detail-cell">{defects.length ? defects.map(x => `${text(x.defect_name)}: ${qty(x.quantity)}`).join(" · ") : "—"}</td><td className="wide">{text(d.note)}</td><td><span className={`status ${d.status || "pending"}`}>{d.status === "approved" ? "Đã duyệt" : d.status === "rejected" ? "Từ chối" : "Chờ duyệt"}</span></td><td className="action" onClick={e => e.stopPropagation()}>{isEdit ? <div className="row-actions"><button type="button" onClick={() => void save()} disabled={saving}>Lưu</button><button type="button" onClick={() => { setEditing(null); setDraft(null); }}>Hủy</button></div> : <div className="row-actions"><button type="button" onClick={() => startEdit(r)}>Sửa</button>{d.status === "approved" && <button type="button" className="danger" onClick={() => void remove(r)}>Xóa</button>}</div>}</td>
      </tr>;
    })}</tbody></table></div><footer className="manager-excel-footer"><span>{total} báo cáo</span><div><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button><strong>{page} / {pageCount}</strong><button disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>›</button></div></footer></section>
  </div>;
}
