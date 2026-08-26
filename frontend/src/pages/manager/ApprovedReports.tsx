import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { getApprovedReports, getReportById } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import { getToday } from "./managerReportDateLogic";
import "./ReportsSplitReference.css";

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const text = (v: unknown, fallback = "—") => v === null || v === undefined || v === "" ? fallback : String(v);
const fmt = (v: unknown) => num(v).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const pct = (v: unknown) => `${fmt(v)}%`;
const dateText = (v: unknown) => { const s = String(v || "").slice(0, 10); const [y, m, d] = s.split("-"); return y && m && d ? `${d}/${m}/${y}` : s || "—"; };
const dateValue = (v: Date) => `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
const rangeFor = (value: string, type: "day" | "week" | "month" | "year") => {
    const start = new Date(`${value}T00:00:00`); const end = new Date(start);
    if (type === "year") { start.setMonth(0, 1); end.setMonth(11, 31); }
    else if (type === "month") { start.setDate(1); end.setMonth(end.getMonth() + 1, 0); }
    else if (type === "week") { const offset = (start.getDay() + 6) % 7; start.setDate(start.getDate() - offset); end.setTime(start.getTime()); end.setDate(start.getDate() + 6); }
    return { dateFrom: dateValue(start), dateTo: dateValue(end) };
};

/* Canonical KPI resolver: prefer DB-generated KPI columns, then use the same source fields/formulas as ManagerReportGrid. */
const kpi = (r: ProductionReport) => {
    const x = r as ProductionReport & Record<string, unknown>;
    const ok = num(x.tt_ok); const ng = num(x.tt_ng);
    const actual = num(x.actual_output) || ok + ng;
    const standard = num(x.standard_output) || num(x.target_output);
    const actualTime = num(x.actual_time);
    const ttDinhMuc = num(x.tt_dinh_muc) || (standard > 0 && actualTime > 0 ? standard * actualTime : 0);
    const nangSuat = num(x.nang_suat_percent) || (ttDinhMuc > 0 ? actual / ttDinhMuc * 100 : 0);
    const dat = actual > 0 ? ok / actual * 100 : 0;
    const pp = num(x.pp_percent) || (actual > 0 ? ng / actual * 100 : 0);
    const hv = x.training_percent ?? x.hv_percent ?? x.learning_percent ?? x.hoc_viec_percent ?? 0;
    return { ok, ng, actual, ttDinhMuc, nangSuat, dat, pp, hv };
};

export default function ApprovedReports() {
    const [date, setDate] = useState(getToday());
    const [range, setRange] = useState<{ dateFrom: string; dateTo: string } | null>(null);
    const [search, setSearch] = useState(""); const [process, setProcess] = useState(""); const [shift, setShift] = useState("");
    const [reports, setReports] = useState<ProductionReport[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
    const [page, setPage] = useState(1); const [pages, setPages] = useState(1); const [total, setTotal] = useState(0);
    const [counts, setCounts] = useState({ day: 0, week: 0, month: 0, year: 0 });
    const [detail, setDetail] = useState<ProductionReport | null>(null); const [detailLoading, setDetailLoading] = useState(false);

    const load = useCallback(async () => {
        try {
            setLoading(true); setError("");
            const r = range || { dateFrom: date, dateTo: date };
            const filters = { dateFrom: r.dateFrom, dateTo: r.dateTo, processName: process || undefined, shift: shift || undefined, search: search.trim() || undefined };
            const result = await getApprovedReports({ ...filters, page, pageSize: 8 });
            setReports(result.data || []); setTotal(result.pagination?.total || 0); setPages(Math.max(1, result.pagination?.total_pages || 1));
            const ranges = (["day", "week", "month", "year"] as const).map(type => ({ type, ...rangeFor(date, type) }));
            const values = await Promise.all(ranges.map(x => getApprovedReports({ dateFrom: x.dateFrom, dateTo: x.dateTo, processName: process || undefined, shift: shift || undefined, search: search.trim() || undefined, page: 1, pageSize: 1 })));
            setCounts({ day: values[0].pagination?.total || 0, week: values[1].pagination?.total || 0, month: values[2].pagination?.total || 0, year: values[3].pagination?.total || 0 });
        } catch (e: unknown) {
            setError(axios.isAxiosError(e) ? e.response?.data?.message || "Không thể tải báo cáo đã duyệt" : "Không thể tải báo cáo đã duyệt");
            setReports([]); setTotal(0); setPages(1);
        } finally { setLoading(false); }
    }, [date, range, process, shift, search, page]);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => { setPage(1); setDetail(null); }, [date, range, process, shift, search]);

    const processes = useMemo(() => Array.from(new Set(reports.map(r => r.process_name).filter(Boolean) as string[])).sort(), [reports]);
    const shifts = useMemo(() => Array.from(new Set(reports.map(r => r.shift).filter(Boolean))).sort(), [reports]);
    const quick = (type: "day" | "week" | "month" | "year") => { setDate(getToday()); setRange(type === "day" ? null : rangeFor(getToday(), type)); };

    const openDetail = async (report: ProductionReport) => {
        setDetail(report); setDetailLoading(true);
        try { const full = await getReportById(Number(report.id), "approved"); setDetail(full || report); }
        catch { setDetail(report); }
        finally { setDetailLoading(false); }
    };

    const detailKpi = detail ? kpi(detail) : null;
    const detailAny = detail as (ProductionReport & Record<string, unknown>) | null;
    const detailDeductions = Array.isArray(detailAny?.deductions) ? (detailAny?.deductions as any[]).filter(x => num(x.hours) > 0) : [];
    const detailDefects = Array.isArray(detailAny?.defects) ? (detailAny?.defects as any[]).filter(x => num(x.quantity) > 0) : [];

    return (
        <div className="pending-reference-page">
            <div className="pending-page-title">
                <h1 style={{ margin: 0, color: "#12385f", fontSize: 26, fontWeight: 800 }}>Đã duyệt báo cáo</h1>
                <div style={{ marginTop: 5, color: "#6f89a8", fontSize: 13 }}>Xem lại các báo cáo sản xuất đã được duyệt.</div>
            </div>

            <div className="pending-filter-card" style={{ display: "grid", gap: 10, alignItems: "end", padding: 14, border: "1px solid #dbe6f2", borderRadius: 12, background: "#fff", boxShadow: "0 4px 14px rgba(35,76,125,.045)" }}>
                <label className="pending-search"><span>Tìm kiếm</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm kiếm mã báo cáo, công nhân..." /></label>
                <label><span>Ngày báo cáo</span><input type="date" value={date} onChange={e => { setDate(e.target.value); setRange(null); }} /></label>
                <div className="pending-quick-filters">
                    {(["Hôm nay", "Tuần này", "Tháng này", "Năm này"] as const).map(label => {
                        const type = label === "Hôm nay" ? "day" : label === "Tuần này" ? "week" : label === "Tháng này" ? "month" : "year";
                        const active = type === "day" ? !range : Boolean(range && range.dateFrom === rangeFor(date, type).dateFrom && range.dateTo === rangeFor(date, type).dateTo);
                        return <button key={label} type="button" className={active ? "active" : ""} onClick={() => quick(type)}>{label}</button>;
                    })}
                </div>
                <label><span>Công đoạn</span><select value={process} onChange={e => setProcess(e.target.value)}><option value="">Tất cả</option>{processes.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
                <label><span>Ca làm việc</span><select value={shift} onChange={e => setShift(e.target.value)}><option value="">Tất cả</option>{shifts.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
            </div>

            <div className="pending-kpis" style={{ display: "grid", gap: 12, marginTop: 12 }}>
                {[["Hôm nay", counts.day, "kpi-orange", "day"], ["Tuần này", counts.week, "kpi-slate", "week"], ["Tháng này", counts.month, "", "month"], ["Năm này", counts.year, "", "year"]].map(([label, value, tone, type]) => (
                    <button key={String(label)} type="button" className={`pending-kpi ${tone}`} onClick={() => quick(type as "day" | "week" | "month" | "year")} style={{ border: "1px solid #dbe6f2", borderRadius: 10, padding: "12px 14px", background: tone === "kpi-orange" ? "#fff8ef" : tone === "kpi-slate" ? "#f7f9fc" : "#fff", textAlign: "left" }}>
                        <span>{label}</span><strong>{value}</strong><small>Báo cáo đã duyệt · Bấm để xem</small>
                    </button>
                ))}
            </div>

            <div className={`pending-workspace ${detail ? "" : "list-only"}`} style={{ marginTop: 12 }}>
                <section className="pending-list-card">
                    <div className="pending-list-tabs"><button type="button" className="pending-list-tab active">Danh sách đã duyệt <span className="tab-badge" style={{ background: "#e8f8f0", color: "#159266" }}>{total}</span></button></div>
                    <div className="pending-table-wrap" style={{ overflowX: "auto" }}>
                        <table className="pending-reference-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead><tr><th className="management-checkbox-column">Xem</th><th>Mã báo cáo</th><th>Công nhân</th><th>Công đoạn</th><th>Ca</th><th>Ngày báo cáo</th><th>Thời gian</th><th>% HV</th><th>TT OK</th><th>NG</th><th>% năng suất</th><th>% đạt</th><th>% PP</th><th>Trạng thái</th></tr></thead>
                            <tbody>
                                {loading ? <tr><td colSpan={14} className="management-empty" style={{ padding: 48, textAlign: "center" }}>Đang tải báo cáo...</td></tr>
                                    : error ? <tr><td colSpan={14} className="management-error" style={{ padding: 48, textAlign: "center", color: "#c24141" }}>{error}</td></tr>
                                    : reports.length === 0 ? <tr><td colSpan={14} className="management-empty" style={{ padding: 48, textAlign: "center" }}>Không có báo cáo đã duyệt.</td></tr>
                                    : reports.map((r, i) => { const x = kpi(r); return (
                                        <tr key={r.id ?? i} onClick={() => void openDetail(r)} style={{ cursor: "pointer" }}>
                                            <td style={{ textAlign: "center" }}><button type="button" className="pending-detail-edit" aria-label={`Xem báo cáo ${r.id}`} onClick={e => { e.stopPropagation(); void openDetail(r); }}>⌕</button></td>
                                            <td>{`PR${String(r.work_date || "REPORT").slice(0, 10).replace(/-/g, "")}-${r.worker_code || String(r.id || i + 1).padStart(4, "0")}`}</td>
                                            <td>{text(r.full_name || r.worker_name)} <span style={{ color: "#7185a4" }}>({text(r.worker_code)})</span></td>
                                            <td>{text(r.process_name)}</td><td><span className="shift-chip">{text(r.shift)}</span></td><td>{dateText(r.work_date)}</td>
                                            <td>{fmt(r.actual_time || r.total_time)} giờ</td><td>{pct(x.hv)}</td><td>{fmt(x.ok)}</td><td>{fmt(x.ng)}</td><td>{pct(x.nangSuat)}</td><td>{pct(x.dat)}</td><td>{pct(x.pp)}</td>
                                            <td><span className="pending-detail-status">Đã duyệt</span></td>
                                        </tr>
                                    ); })}
                            </tbody>
                        </table>
                    </div>
                    <div className="pending-table-footer" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
                        <span>Trang {page}/{pages} · {total} báo cáo</span>
                        <div style={{ display: "flex", gap: 6 }}><button type="button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Trước</button><button type="button" disabled={page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))}>Sau</button></div>
                    </div>
                </section>

                {detail && <aside className="pending-detail-card">
                    <div className="pending-detail-head"><div className="pending-detail-title"><h2>Chi tiết báo cáo</h2><span className="pending-detail-status">Đã duyệt</span><span className="pending-detail-code">#{detail.id}</span></div><button type="button" className="pending-detail-close" onClick={() => setDetail(null)} aria-label="Đóng">×</button></div>
                    {detailLoading ? <div className="pending-detail-loading">Đang tải chi tiết...</div> : detailKpi && <div className="pending-detail-body">
                        <section className="pending-detail-section"><h3>Thông tin chung</h3><div className="pending-detail-grid">
                            {[["Công nhân", `${text(detail.full_name || detail.worker_name)} (${text(detail.worker_code)})`], ["Ngày báo cáo", dateText(detail.work_date)], ["Công đoạn", text(detail.process_name)], ["Ca làm việc", text(detail.shift)], ["Máy móc", text(detail.machine_no)], ["Sản phẩm", text(detail.product_name)], ["Thời gian", `${fmt(detail.actual_time || detail.total_time)} giờ`], ["Học việc", pct(detailKpi.hv)]].map(([label, value]) => <div className="pending-detail-field" key={String(label)}><span>{label}</span><strong>{String(value)}</strong></div>)}
                        </div></section>
                        <section className="pending-detail-section"><h3>Kết quả sản xuất</h3><div className="pending-result-grid"><div className="pending-result-item"><span>Sản lượng OK</span><strong>{fmt(detailKpi.ok)}</strong></div><div className="pending-result-item ng"><span>Sản lượng NG</span><strong>{fmt(detailKpi.ng)}</strong></div><div className="pending-result-item total"><span>Tổng sản lượng</span><strong>{fmt(detailKpi.actual)}</strong></div><div className="pending-result-item rate"><span>% đạt</span><strong>{pct(detailKpi.dat)}</strong></div></div></section>
                        <section className="pending-detail-section"><h3>Chỉ số KPI</h3><div className="pending-detail-info-grid"><div className="pending-detail-field"><span>TT định mức</span><strong>{fmt(detailKpi.ttDinhMuc)}</strong></div><div className="pending-detail-field"><span>% năng suất</span><strong>{pct(detailKpi.nangSuat)}</strong></div><div className="pending-detail-field"><span>% đạt</span><strong>{pct(detailKpi.dat)}</strong></div><div className="pending-detail-field"><span>% PP</span><strong>{pct(detailKpi.pp)}</strong></div></div></section>
                        <section className="pending-detail-section"><h3>Chi tiết thời gian trừ</h3>{detailDeductions.length ? <div className="pending-defect-list">{detailDeductions.map((x: any, i: number) => <span className="pending-defect" key={i}>{text(x.deduction_name, x.deduction_code)}: {fmt(num(x.hours) * 60)} phút</span>)}</div> : <div className="pending-history-empty">Không có thời gian trừ.</div>}</section>
                        <section className="pending-detail-section"><h3>Chi tiết lỗi NG</h3>{detailDefects.length ? <div className="pending-defect-list">{detailDefects.map((x: any, i: number) => <span className="pending-defect" key={i}>{text(x.defect_name, x.defect_code)}: {fmt(x.quantity)} sản phẩm</span>)}</div> : <div className="pending-history-empty">Không có lỗi NG.</div>}</section>
                        <section className="pending-detail-section"><h3>Ghi chú</h3><div className="pending-detail-field"><span>Ghi chú</span><strong>{text(detail.note || (detail as any).notes, "Không có ghi chú")}</strong></div></section>
                    </div>}
                </aside>}
            </div>
        </div>
    );
}
