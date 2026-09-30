import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { getPendingReports } from "../../services/productionService";
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
    // Pending API returns the snapshot as training_percent_snapshot (the
    // detail page already reads this field). Keep the list consistent with it.
    const hv = x.training_percent ?? x.training_percent_snapshot ?? x.worker_training_percent ?? x.hv_percent ?? x.learning_percent ?? x.hoc_viec_percent ?? 100;
    const ngTypeCount = Math.max(num(x.ng_defect_type_count), num(x.worker_ng_type_count), num(x.machine_ng_type_count));
    return { ok, ng, actual, ttDinhMuc, nangSuat, dat, pp, hv, ngTypeCount };
};

const metricStyle = (type: "productivity" | "pp", value: number, ngTypeCount = 0): CSSProperties => {
    if (type === "productivity" && (value <= 75 || value > 100)) return { backgroundColor: "#ffd6e7", color: "#9b123f", fontWeight: 800, border: "1px solid #ff9fbe" };
    if (type === "pp" && (value === 0 || ngTypeCount === 1)) return { backgroundColor: "#fff0b8", color: "#795600", fontWeight: 800, border: "1px solid #e3ad20" };
    return {};
};

export default function Reports() {
    const navigate = useNavigate();
    const [date, setDate] = useState(getToday());
    const [range, setRange] = useState<{ dateFrom: string; dateTo: string } | null>(null);
    const [search, setSearch] = useState(""); const [process, setProcess] = useState(""); const [shift, setShift] = useState("");
    const [reports, setReports] = useState<ProductionReport[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
    const [page, setPage] = useState(1); const [pages, setPages] = useState(1); const [total, setTotal] = useState(0);

    const load = useCallback(async () => {
        try {
            setLoading(true); setError("");
            const r = range || { dateFrom: date, dateTo: date };
            const result = await getPendingReports({ dateFrom: r.dateFrom, dateTo: r.dateTo, processName: process || undefined, shift: shift || undefined, search: search.trim() || undefined, page, pageSize: 8 });
            setReports(result.data || []); setTotal(result.pagination?.total || 0); setPages(Math.max(1, result.pagination?.total_pages || 1));
        } catch (e: any) {
            setError(e?.response?.data?.message || "Không thể tải báo cáo chờ duyệt"); setReports([]); setTotal(0); setPages(1);
        } finally { setLoading(false); }
    }, [date, range, process, shift, search, page]);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => { setPage(1); }, [date, range, process, shift, search]);

    const processes = useMemo(() => Array.from(new Set(reports.map(r => r.process_name).filter(Boolean) as string[])).sort(), [reports]);
    const shifts = useMemo(() => Array.from(new Set(reports.map(r => r.shift).filter(Boolean))).sort(), [reports]);
    const quick = (type: "day" | "week" | "month" | "year") => { const today = getToday(); setDate(today); setRange(type === "day" ? null : rangeFor(today, type)); };

    return (
        <div className="pending-reference-page">
            <div className="pending-page-title">
                <h1 style={{ margin: 0, color: "#12385f", fontSize: 26, fontWeight: 800 }}>Báo cáo chờ duyệt</h1>
                <div style={{ marginTop: 5, color: "#6f89a8", fontSize: 13 }}>Xem các báo cáo sản xuất đang chờ duyệt.</div>
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

            <div className="pending-workspace list-only" style={{ marginTop: 12 }}>
                <section className="pending-list-card">
                    <div className="pending-list-tabs">
                        <button type="button" className="pending-list-tab active">Danh sách chờ duyệt <span className="tab-badge" style={{ background: "#fff0d8", color: "#a56a00" }}>{total}</span></button>
                    </div>
                    <div className="pending-table-wrap" style={{ overflowX: "auto" }}>
                        <table className="pending-reference-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead><tr><th className="management-checkbox-column">Xem</th><th>Mã báo cáo</th><th>Công nhân</th><th>Công đoạn</th><th>Ca</th><th>Ngày báo cáo</th><th>Thời gian</th><th>% HV</th><th>TT OK</th><th>NG</th><th>% năng suất</th><th>% đạt</th><th>% PP</th><th>Trạng thái</th></tr></thead>
                            <tbody>
                                {loading ? <tr><td colSpan={14} className="management-empty" style={{ padding: 48, textAlign: "center" }}>Đang tải báo cáo...</td></tr> : error ? <tr><td colSpan={14} className="management-error" style={{ padding: 48, textAlign: "center", color: "#c24141" }}>{error}</td></tr> : reports.length === 0 ? <tr><td colSpan={14} className="management-empty" style={{ padding: 48, textAlign: "center" }}>Không có báo cáo chờ duyệt.</td></tr> : reports.map((r, i) => {
                                    const x = kpi(r);
                                    const code = `PR${String(r.work_date || "REPORT").slice(0, 10).replace(/-/g, "")}-${r.worker_code || String(r.id || i + 1).padStart(4, "0")}`;
                                    return <tr key={r.id ?? i} onClick={() => navigate(`/manager/report/${r.id}?source=pending`)} style={{ cursor: "pointer" }}>
                                        <td style={{ textAlign: "center" }}><button type="button" className="pending-detail-edit" aria-label={`Xem báo cáo ${r.id}`} onClick={e => { e.stopPropagation(); navigate(`/manager/report/${r.id}?source=pending`); }}>⌕</button></td>
                                        <td>{code}</td><td>{text(r.full_name || r.worker_name)} <span style={{ color: "#7185a4" }}>({text(r.worker_code)})</span></td><td>{text(r.process_name || r.process_code)}</td><td><span className="shift-chip">{text(r.shift)}</span></td><td>{dateText(r.work_date)}</td><td>{fmt(r.actual_time || r.total_time)} giờ</td><td>{pct(x.hv)}</td><td>{fmt(x.ok)}</td><td>{fmt(x.ng)}</td>
                                        <td style={metricStyle("productivity", x.nangSuat, x.ngTypeCount)}>{pct(x.nangSuat)}</td><td>{pct(x.dat)}</td><td style={metricStyle("pp", x.pp, x.ngTypeCount)}>{pct(x.pp)}{x.pp === 0 || x.ngTypeCount === 1 ? " ⚠" : ""}</td><td><span className="pending-detail-status" style={{ background: "#fff0d8", color: "#a56a00" }}>Chờ duyệt</span></td>
                                    </tr>;
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="pending-table-footer" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
                        <span>Trang {page}/{pages} · {total} báo cáo</span>
                        <div style={{ display: "flex", gap: 6 }}><button type="button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Trước</button><button type="button" disabled={page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))}>Sau</button></div>
                    </div>
                </section>
            </div>
        </div>
    );
}
