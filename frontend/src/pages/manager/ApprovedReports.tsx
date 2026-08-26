import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { getApprovedReports } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import { getToday } from "./managerReportDateLogic";
import "./ReportsSplitReference.css";

const num = (v: unknown) => Number(v || 0);
const text = (v: unknown, fallback = "—") => v === null || v === undefined || v === "" ? fallback : String(v);
const fmt = (v: unknown) => num(v).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const dateText = (v: unknown) => {
    const s = String(v || "").slice(0, 10);
    const [y, m, d] = s.split("-");
    return y && m && d ? `${d}/${m}/${y}` : s || "—";
};
const dateValue = (v: Date) => `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
const rangeFor = (value: string, type: "day" | "week" | "month" | "year") => {
    const start = new Date(`${value}T00:00:00`);
    const end = new Date(start);
    if (type === "year") { start.setMonth(0, 1); end.setMonth(11, 31); }
    else if (type === "month") { start.setDate(1); end.setMonth(end.getMonth() + 1, 0); }
    else if (type === "week") { const offset = (start.getDay() + 6) % 7; start.setDate(start.getDate() - offset); end.setTime(start.getTime()); end.setDate(start.getDate() + 6); }
    return { dateFrom: dateValue(start), dateTo: dateValue(end) };
};

export default function ApprovedReports() {
    const [date, setDate] = useState(getToday());
    const [range, setRange] = useState<{ dateFrom: string; dateTo: string } | null>(null);
    const [search, setSearch] = useState("");
    const [process, setProcess] = useState("");
    const [shift, setShift] = useState("");
    const [reports, setReports] = useState<ProductionReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [counts, setCounts] = useState({ day: 0, week: 0, month: 0, year: 0 });

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setError("");
            const selectedRange = range || { dateFrom: date, dateTo: date };
            const filters = {
                dateFrom: selectedRange.dateFrom,
                dateTo: selectedRange.dateTo,
                processName: process || undefined,
                shift: shift || undefined,
                search: search.trim() || undefined,
            };
            const result = await getApprovedReports({ ...filters, page, pageSize: 8 });
            setReports(result.data || []);
            setTotal(result.pagination?.total || 0);
            setPages(Math.max(1, result.pagination?.total_pages || 1));

            const ranges = (["day", "week", "month", "year"] as const).map(type => ({ type, ...rangeFor(date, type) }));
            const values = await Promise.all(ranges.map(item => getApprovedReports({
                dateFrom: item.dateFrom,
                dateTo: item.dateTo,
                processName: process || undefined,
                shift: shift || undefined,
                search: search.trim() || undefined,
                page: 1,
                pageSize: 1,
            })));
            setCounts({ day: values[0].pagination?.total || 0, week: values[1].pagination?.total || 0, month: values[2].pagination?.total || 0, year: values[3].pagination?.total || 0 });
        } catch (e: unknown) {
            setError(axios.isAxiosError(e) ? e.response?.data?.message || "Không thể tải báo cáo đã duyệt" : "Không thể tải báo cáo đã duyệt");
            setReports([]);
            setTotal(0);
            setPages(1);
        } finally {
            setLoading(false);
        }
    }, [date, range, process, shift, search, page]);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => { setPage(1); }, [date, range, process, shift, search]);

    const processes = useMemo(() => Array.from(new Set(reports.map(r => r.process_name).filter(Boolean) as string[])).sort(), [reports]);
    const shifts = useMemo(() => Array.from(new Set(reports.map(r => r.shift).filter(Boolean))).sort(), [reports]);

    const quick = (type: "day" | "week" | "month" | "year") => {
        if (type === "day") { setRange(null); setDate(getToday()); }
        else { setDate(getToday()); setRange(rangeFor(getToday(), type)); }
    };

    const card = (title: string, value: number, tone: "blue" | "green" | "dark" | "orange") => (
        <button type="button" onClick={() => quick(title === "Hôm nay" ? "day" : title === "Tuần này" ? "week" : title === "Tháng này" ? "month" : "year")} style={{ flex: 1, minWidth: 180, textAlign: "left", border: `1px solid ${tone === "blue" ? "#d8e5f7" : "#dce5ef"}`, borderRadius: 12, background: tone === "orange" ? "#fffaf1" : "#fff", padding: "16px 18px", cursor: "pointer", boxShadow: "0 1px 3px rgba(20,50,90,.04)" }}>
            <div style={{ fontSize: 13, color: "#69809d", fontWeight: 600 }}>{title}</div>
            <div style={{ marginTop: 7, fontSize: 24, lineHeight: 1, fontWeight: 800, color: tone === "green" ? "#15945f" : tone === "orange" ? "#d87900" : "#173d6b" }}>{value}</div>
            <div style={{ marginTop: 8, fontSize: 12, color: "#7890ad" }}>Báo cáo đã duyệt · Bấm để xem</div>
        </button>
    );

    return (
        <div style={{ minHeight: "100%", background: "#f5f8fc", padding: "28px 32px 40px" }}>
            <div style={{ maxWidth: 1480, margin: "0 auto" }}>
                <div style={{ marginBottom: 18 }}>
                    <h1 style={{ margin: 0, color: "#12385f", fontSize: 30, fontWeight: 800 }}>Đã duyệt báo cáo</h1>
                    <div style={{ marginTop: 5, color: "#6f89a8", fontSize: 14 }}>Xem lại các báo cáo sản xuất đã được duyệt.</div>
                </div>

                <div style={{ background: "#fff", border: "1px solid #d9e4f1", borderRadius: 12, padding: 16, boxShadow: "0 2px 8px rgba(30,70,110,.05)", display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
                    <label style={{ flex: "1 1 300px" }}><span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#69809d", margin: "0 0 7px 3px" }}>Tìm kiếm</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm kiếm mã báo cáo, công nhân..." style={{ width: "100%", height: 40, boxSizing: "border-box", border: "1px solid #d5e0ed", borderRadius: 8, padding: "0 12px", outline: "none", color: "#173d6b" }} /></label>
                    <label style={{ width: 190 }}><span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#69809d", margin: "0 0 7px 3px" }}>Ngày báo cáo</span><input type="date" value={date} onChange={e => { setDate(e.target.value); setRange(null); }} style={{ width: "100%", height: 40, boxSizing: "border-box", border: "1px solid #d5e0ed", borderRadius: 8, padding: "0 10px", color: "#173d6b" }} /></label>
                    <div style={{ display: "flex", height: 40, border: "1px solid #d5e0ed", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
                        {(["Hôm nay", "Tuần này", "Tháng này", "Năm này"] as const).map(label => <button key={label} type="button" onClick={() => quick(label === "Hôm nay" ? "day" : label === "Tuần này" ? "week" : label === "Tháng này" ? "month" : "year")} style={{ border: 0, borderRight: "1px solid #e1e8f1", padding: "0 13px", background: ((label === "Hôm nay" && !range) || (label === "Tuần này" && range?.dateTo === rangeFor(date, "week").dateTo) || (label === "Tháng này" && range?.dateTo === rangeFor(date, "month").dateTo) || (label === "Năm này" && range?.dateTo === rangeFor(date, "year").dateTo)) ? "#eaf3ff" : "#fff", color: "#356da7", fontWeight: 700, cursor: "pointer" }}>{label}</button>)}
                    </div>
                    <label style={{ width: 175 }}><span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#69809d", margin: "0 0 7px 3px" }}>Công đoạn</span><select value={process} onChange={e => setProcess(e.target.value)} style={{ width: "100%", height: 40, border: "1px solid #d5e0ed", borderRadius: 8, padding: "0 10px", color: "#173d6b", background: "#fff" }}><option value="">Tất cả</option>{processes.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
                    <label style={{ width: 165 }}><span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#69809d", margin: "0 0 7px 3px" }}>Ca làm việc</span><select value={shift} onChange={e => setShift(e.target.value)} style={{ width: "100%", height: 40, border: "1px solid #d5e0ed", borderRadius: 8, padding: "0 10px", color: "#173d6b", background: "#fff" }}><option value="">Tất cả</option>{shifts.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
                </div>

                <div style={{ display: "flex", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
                    {card("Hôm nay", counts.day, "orange")}
                    {card("Tuần này", counts.week, "dark")}
                    {card("Tháng này", counts.month, "green")}
                    {card("Năm này", counts.year, "blue")}
                </div>

                <div style={{ marginTop: 16, background: "#fff", border: "1px solid #d9e4f1", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 8px rgba(30,70,110,.04)" }}>
                    <div style={{ height: 48, display: "flex", alignItems: "center", padding: "0 16px", borderBottom: "1px solid #e0e7f0", color: "#1b65b7", fontWeight: 800 }}>Danh sách báo cáo ({total})</div>
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse", fontSize: 13 }}>
                            <thead><tr style={{ background: "#f3f7fb", color: "#315779", textAlign: "left" }}>{["Mã báo cáo", "Công nhân", "Công đoạn", "Ca", "Ngày báo cáo", "Thời gian", "% HV", "TT OK", "NG", "% năng suất", "% đạt", "% PP", "Trạng thái"].map(h => <th key={h} style={{ padding: "11px 10px", borderRight: "1px solid #dfe6ef", borderBottom: "1px solid #dfe6ef", whiteSpace: "nowrap", fontSize: 12, fontWeight: 800 }}>{h}</th>)}</tr></thead>
                            <tbody>
                                {loading ? <tr><td colSpan={13} style={{ padding: 50, textAlign: "center", color: "#7890ad" }}>Đang tải báo cáo...</td></tr> : error ? <tr><td colSpan={13} style={{ padding: 50, textAlign: "center", color: "#c24141" }}>{error}</td></tr> : reports.length === 0 ? <tr><td colSpan={13} style={{ padding: 58, textAlign: "center", color: "#7890ad" }}>Không có báo cáo đã duyệt.</td></tr> : reports.map((r, i) => <tr key={r.id} style={{ background: i % 2 ? "#fbfdff" : "#fff" }}>
                                    <td style={{ padding: "11px 10px", borderRight: "1px solid #e1e8f0", borderBottom: "1px solid #e1e8f0", fontWeight: 700, color: "#24598b" }}>PR{String(r.work_date || "").slice(0, 10).replace(/-/g, "")}-{text(r.worker_code, String(r.id))}</td>
                                    <td style={{ padding: "11px 10px", borderRight: "1px solid #e1e8f0", borderBottom: "1px solid #e1e8f0", whiteSpace: "nowrap" }}>{text(r.worker_code)} · {text(r.full_name)}</td>
                                    <td style={{ padding: "11px 10px", borderRight: "1px solid #e1e8f0", borderBottom: "1px solid #e1e8f0", whiteSpace: "nowrap" }}>{text(r.process_name)}</td>
                                    <td style={{ padding: "11px 10px", borderRight: "1px solid #e1e8f0", borderBottom: "1px solid #e1e8f0" }}>{text(r.shift)}</td>
                                    <td style={{ padding: "11px 10px", borderRight: "1px solid #e1e8f0", borderBottom: "1px solid #e1e8f0" }}>{dateText(r.work_date)}</td>
                                    <td style={{ padding: "11px 10px", borderRight: "1px solid #e1e8f0", borderBottom: "1px solid #e1e8f0" }}>{fmt(r.total_time)}</td>
                                    <td style={{ padding: "11px 10px", borderRight: "1px solid #e1e8f0", borderBottom: "1px solid #e1e8f0" }}>{fmt((r as any).training_percent ?? (r as any).learning_percent ?? (r as any).hoc_viec_percent ?? 0)}%</td>
                                    <td style={{ padding: "11px 10px", borderRight: "1px solid #e1e8f0", borderBottom: "1px solid #e1e8f0" }}>{fmt(r.tt_ok)}</td>
                                    <td style={{ padding: "11px 10px", borderRight: "1px solid #e1e8f0", borderBottom: "1px solid #e1e8f0" }}>{fmt(r.tt_ng)}</td>
                                    <td style={{ padding: "11px 10px", borderRight: "1px solid #e1e8f0", borderBottom: "1px solid #e1e8f0" }}>{fmt((r as any).productivity_percent ?? (r as any).productivity)}%</td>
                                    <td style={{ padding: "11px 10px", borderRight: "1px solid #e1e8f0", borderBottom: "1px solid #e1e8f0" }}>{fmt((r as any).achievement_percent ?? (r as any).attainment_percent)}%</td>
                                    <td style={{ padding: "11px 10px", borderRight: "1px solid #e1e8f0", borderBottom: "1px solid #e1e8f0" }}>{fmt((r as any).pp_percent ?? (r as any).pp)}%</td>
                                    <td style={{ padding: "11px 10px", borderBottom: "1px solid #e1e8f0" }}><span style={{ display: "inline-flex", padding: "4px 9px", borderRadius: 999, background: "#eaf8f0", color: "#16834f", fontWeight: 800, fontSize: 12 }}>Đã duyệt</span></td>
                                </tr>)}
                            </tbody>
                        </table>
                    </div>
                    <div style={{ minHeight: 54, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", color: "#69809d", fontSize: 13 }}>
                        <span>Hiển thị {reports.length ? (page - 1) * 8 + 1 : 0} đến {(page - 1) * 8 + reports.length} của {total} báo cáo</span>
                        <div style={{ display: "flex", gap: 6 }}><button type="button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{ width: 36, height: 36, border: "1px solid #dce5ef", borderRadius: 8, background: "#fff", cursor: page <= 1 ? "default" : "pointer" }}>‹</button><span style={{ minWidth: 38, height: 36, display: "grid", placeItems: "center", borderRadius: 8, background: "#1769d2", color: "#fff", fontWeight: 800 }}>{page}</span><button type="button" disabled={page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))} style={{ width: 36, height: 36, border: "1px solid #dce5ef", borderRadius: 8, background: "#fff", cursor: page >= pages ? "default" : "pointer" }}>›</button></div>
                    </div>
                </div>
            </div>
        </div>
    );
}
