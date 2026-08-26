import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { getApprovedReports, getTempReportDetail } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import { useToast } from "../../components/feedback/toastContext";
import { getToday } from "./managerReportDateLogic";
import "./ManagerExcelReports.css";

const PROCESSES = ["Tất cả", "CÁN", "ÉP", "XLBV", "Cắt lồng", "TT Mài", "TT Đo", "TT Kiểm 1", "TT Kiểm 2"];
const DEFECT_FIELDS: Array<[keyof ProductionReport, string]> = [["kqd_dap_lai", "KQD đập lại"], ["kqd_tuot", "KQD tuột"], ["vo_do_long", "Vỡ"], ["xuoc_do_long", "Xước"], ["cong_gay", "Công gãy"], ["xoay", "Xoay"], ["khong_dut", "Không đứt"], ["bavia_hut", "Bavia hút"], ["ppcm", "PPCM"], ["loi_cao_su", "Lỗi cao su"], ["ng_kich_thuoc", "NG kích thước"], ["cat_lem", "Cắt lẹm"]];
const n = (v: unknown) => Number(v || 0);
const text = (v: unknown, fallback = "—") => v === undefined || v === null || v === "" ? fallback : String(v);
const fmt = (v: unknown) => n(v).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const qty = (v: unknown) => Math.round(n(v)).toLocaleString("vi-VN");
const dateFmt = (v?: string) => v ? `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}/${String(v).slice(0, 4)}` : "—";
const rate = (r: ProductionReport) => n(r.target_output) ? n(r.actual_output) / n(r.target_output) * 100 : 0;
const ngRate = (r: ProductionReport) => n(r.actual_output) ? n(r.tt_ng) / n(r.actual_output) * 100 : 0;

type DatePreset = "today" | "yesterday" | "week" | "last-week" | "month" | "last-month" | "custom";
const parseDate = (v: string) => { const [y, m, d] = v.split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const monthEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const weekStart = (d: Date) => { const x = new Date(d); const day = x.getDay(); x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day)); return x; };
const weekEnd = (d: Date) => { const x = weekStart(d); x.setDate(x.getDate() + 6); return x; };

export default function ManagerApprovedExcelReports() {
  const { showToast } = useToast();
  const today = parseDate(getToday());
  const [process, setProcess] = useState("Tất cả");
  const [preset, setPreset] = useState<DatePreset>("month");
  const [dateFrom, setDateFrom] = useState(iso(monthStart(today)));
  const [dateTo, setDateTo] = useState(iso(monthEnd(today)));
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reports, setReports] = useState<ProductionReport[]>([]);
  const [details, setDetails] = useState<Record<number, ProductionReport>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const pageSize = 20;

  const applyPreset = (next: DatePreset) => {
    const d = parseDate(getToday()); let from = d; let to = d;
    if (next === "yesterday") { from = new Date(d); from.setDate(from.getDate() - 1); to = new Date(from); }
    else if (next === "week") { from = weekStart(d); to = weekEnd(d); }
    else if (next === "last-week") { to = weekStart(d); to.setDate(to.getDate() - 1); from = new Date(to); from.setDate(from.getDate() - 6); }
    else if (next === "month") { from = monthStart(d); to = monthEnd(d); }
    else if (next === "last-month") { from = new Date(d.getFullYear(), d.getMonth() - 1, 1); to = new Date(d.getFullYear(), d.getMonth(), 0); }
    else { setPreset("custom"); return; }
    setPreset(next); setDateFrom(iso(from)); setDateTo(iso(to));
  };

  const load = async () => {
    try {
      setLoading(true);
      const filters = { dateFrom, dateTo, processName: process === "Tất cả" ? undefined : process, search: search.trim() || undefined, page, pageSize };
      const result = await getApprovedReports(filters);
      const rows = result.data || [];
      setReports(rows); setTotal(result.pagination?.total || rows.length);
      const missing = rows.map(r => Number(r.id)).filter(id => id && !details[id]);
      if (missing.length) {
        const loaded = await Promise.all(missing.map(async id => { try { return await getTempReportDetail(id); } catch { return null; } }));
        setDetails(prev => { const next = { ...prev }; loaded.forEach(r => { if (r?.id) next[Number(r.id)] = r; }); return next; });
      }
    } catch (err) {
      showToast(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể tải báo cáo đã duyệt" : "Không thể tải báo cáo đã duyệt");
      setReports([]); setTotal(0);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [process, dateFrom, dateTo, search, page]);
  useEffect(() => { setPage(1); }, [process, dateFrom, dateTo, search]);
  const rows = useMemo(() => reports.map(r => details[Number(r.id)] ? { ...r, ...details[Number(r.id)] } : r), [reports, details]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return <div className="manager-excel-page">
    <header className="manager-excel-head"><div><h1>Quản lý báo cáo</h1><p>Chỉ hiển thị các báo cáo đã được duyệt, trình bày liền mạch theo kiểu Excel.</p></div><div className="manager-excel-head-actions"><button type="button" onClick={() => void load()}>↻ Làm mới</button></div></header>
    <div className="manager-excel-tabs">{PROCESSES.map(p => <button key={p} className={process === p ? "active" : ""} onClick={() => setProcess(p)}>{p}</button>)}</div>
    <section className="manager-excel-filters">
      <label>Khoảng thời gian<select value={preset} onChange={e => applyPreset(e.target.value as DatePreset)}><option value="today">Hôm nay</option><option value="yesterday">Hôm qua</option><option value="week">Tuần này</option><option value="last-week">Tuần trước</option><option value="month">Tháng này</option><option value="last-month">Tháng trước</option><option value="custom">Tùy chọn khoảng ngày</option></select></label>
      <label>Từ ngày<input type="date" value={dateFrom} onChange={e => { setPreset("custom"); setDateFrom(e.target.value); }} /></label>
      <label>Đến ngày<input type="date" value={dateTo} min={dateFrom} onChange={e => { setPreset("custom"); setDateTo(e.target.value); }} /></label>
      <label className="search">Tìm kiếm<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Mã CN, họ tên, máy, sản phẩm..." /></label>
      <button className="filter-reset" type="button" onClick={() => { setProcess("Tất cả"); setSearch(""); applyPreset("month"); }}>Đặt lại</button>
    </section>
    <section className="manager-excel-table-card"><div className="manager-excel-table-wrap"><table className="manager-excel-table"><thead><tr><th className="sticky date">Ngày</th><th className="sticky code">Mã CN</th><th className="sticky name">Họ tên</th><th>Công đoạn</th><th>Ca</th><th>Máy</th><th>Sản phẩm</th><th>% HV</th><th>Tổng giờ</th><th>Trừ giờ</th><th>TT giờ</th><th>Định mức</th><th>Thực tế</th><th>OK</th><th>NG</th><th>% đạt</th><th>% NG</th>{DEFECT_FIELDS.map(([, label]) => <th key={label}>{label}</th>)}<th>Trừ giờ chi tiết</th><th>Lỗi chi tiết</th><th>Ghi chú</th></tr></thead><tbody>{loading ? <tr><td colSpan={27} className="empty">Đang tải dữ liệu...</td></tr> : !rows.length ? <tr><td colSpan={27} className="empty">Không có báo cáo đã duyệt phù hợp.</td></tr> : rows.map((r, i) => { const d = r; const deductions = d.deductions || []; const defects = d.defects || []; return <tr key={`${d.id}-${i}`}>
      <td className="sticky date">{dateFmt(d.work_date)}</td><td className="sticky code">{text(d.worker_code)}</td><td className="sticky name">{text(d.full_name)}</td><td>{text(d.process_name)}</td><td>{text(d.shift)}</td><td>{text(d.machine_no)}</td><td className="wide">{text(d.product_name)}</td><td>{fmt(d.training_percent ?? (d as any).training_percent_snapshot)}%</td><td>{fmt(d.total_time)}</td><td>{fmt(d.deduction_time)}</td><td>{fmt(d.actual_time)}</td><td>{fmt(d.target_output ?? d.standard_output)}</td><td>{qty(d.actual_output)}</td><td>{qty(d.tt_ok)}</td><td>{qty(d.tt_ng)}</td><td>{fmt(rate(d))}%</td><td>{fmt(ngRate(d))}%</td>{DEFECT_FIELDS.map(([field, label]) => <td key={label}>{qty(d[field])}</td>)}<td className="detail-cell">{deductions.length ? deductions.map(x => `${text(x.deduction_name)} ${fmt(n(x.hours) * 60)}p`).join(" · ") : "—"}</td><td className="detail-cell">{defects.length ? defects.map(x => `${text(x.defect_name)}: ${qty(x.quantity)}`).join(" · ") : "—"}</td><td className="wide">{text(d.note)}</td>
    </tr>; })}</tbody></table></div><footer className="manager-excel-footer"><span>{total} báo cáo đã duyệt</span><div><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button><strong>{page} / {pageCount}</strong><button disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>›</button></div></footer></section>
  </div>;
}
