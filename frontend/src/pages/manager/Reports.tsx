import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPendingReports } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import { getToday } from "./managerReportDateLogic";

const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const f = (value: unknown) => n(value).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const dateText = (value: unknown) => { const s = String(value || "").slice(0, 10); const [y, m, d] = s.split("-"); return y && m && d ? `${d}/${m}/${y}` : s || "—"; };

const metrics = (report: ProductionReport) => {
    const ok = n(report.tt_ok);
    const ng = n(report.tt_ng);
    const actual = n(report.actual_output) || ok + ng;
    const standard = n(report.standard_output);
    const time = n(report.actual_time);
    const target = n((report as any).tt_dinh_muc) || (standard > 0 && time > 0 ? standard * time : 0);
    const productivity = target > 0 ? actual / target * 100 : 0;
    const achieved = actual > 0 ? ok / actual * 100 : 0;
    const pp = actual > 0 ? ng / actual * 100 : 0;
    const hv = n((report as any).training_percent ?? (report as any).training_percent_snapshot ?? report.hv_percent ?? 0);
    const ngTypes = Array.isArray(report.defects) ? report.defects.filter(x => n(x.quantity) > 0).length : 0;
    return { ok, ng, actual, productivity, achieved, pp, hv, ngTypes };
};

export default function Reports() {
    const navigate = useNavigate();
    const [date, setDate] = useState(getToday());
    const [search, setSearch] = useState("");
    const [process, setProcess] = useState("");
    const [shift, setShift] = useState("");
    const [reports, setReports] = useState<ProductionReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setError("");
            const result = await getPendingReports({ dateFrom: date, dateTo: date, search: search.trim() || undefined, processName: process || undefined, shift: shift || undefined, page: 1, pageSize: 50 });
            setReports(result.data || []);
        } catch (err: any) {
            setReports([]);
            setError(err?.response?.data?.message || "Không thể tải báo cáo chờ duyệt.");
        } finally { setLoading(false); }
    }, [date, search, process, shift]);

    useEffect(() => { void load(); }, [load]);
    const processes = Array.from(new Set(reports.map(r => r.process_name).filter(Boolean) as string[])).sort();
    const shifts = Array.from(new Set(reports.map(r => r.shift).filter(Boolean))).sort();

    return <main className="manager-page" style={{ padding: 18 }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
            <h1 style={{ margin: "0 0 10px", color: "#12385f", fontSize: 22 }}>Báo cáo chờ duyệt</h1>
            <section style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8, padding: 10, marginBottom: 10, border: "1px solid #dce6f0", borderRadius: 10, background: "#fff" }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm mã báo cáo, công nhân..." />
                <input type="date" value={date} onChange={e => setDate(e.target.value)} />
                <select value={process} onChange={e => setProcess(e.target.value)}><option value="">Tất cả công đoạn</option>{processes.map(x => <option key={x}>{x}</option>)}</select>
                <select value={shift} onChange={e => setShift(e.target.value)}><option value="">Tất cả ca</option>{shifts.map(x => <option key={x}>{x}</option>)}</select>
            </section>
            <section style={{ overflow: "auto", border: "1px solid #dce6f0", borderRadius: 10, background: "#fff" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                    <thead><tr style={{ background: "#f5f8fc", color: "#53657a" }}><th style={{ padding: 9 }}>Mã BC</th><th>Công nhân</th><th>Công đoạn</th><th>Ca</th><th>Ngày</th><th>Thời gian</th><th>% HV</th><th>TT OK</th><th>NG</th><th>% NS</th><th>% đạt</th><th>% PP</th><th>Trạng thái</th></tr></thead>
                    <tbody>{loading ? <tr><td colSpan={13} style={{ padding: 30, textAlign: "center" }}>Đang tải...</td></tr> : error ? <tr><td colSpan={13} style={{ padding: 30, textAlign: "center", color: "#b42318" }}>{error}</td></tr> : reports.length === 0 ? <tr><td colSpan={13} style={{ padding: 30, textAlign: "center", color: "#718096" }}>Không có báo cáo.</td></tr> : reports.map((r, index) => { const m = metrics(r); const code = `PR${String(r.work_date || "REPORT").slice(0,10).replace(/-/g,"")}-${r.worker_code || String(r.id || index + 1).padStart(4,"0")}`; const prodStyle = (m.productivity <= 75 || m.productivity > 100) ? { background: "#ffd6e7", color: "#9b123f", fontWeight: 800 } : {}; const ppStyle = (m.pp === 0 || m.ngTypes === 1) ? { background: "#fff0b8", color: "#795600", fontWeight: 800 } : {}; return <tr key={r.id || index} onClick={() => navigate(`/manager/report/${r.id}?source=pending`)} style={{ cursor: "pointer", borderTop: "1px solid #edf1f5" }}><td style={{ padding: 8, color: "#1769d2", fontWeight: 700 }}>{code}</td><td>{r.full_name || r.worker_name || "—"} <small>({r.worker_code || "—"})</small></td><td>{r.process_name || r.process_code || "—"}</td><td>{r.shift || "—"}</td><td>{dateText(r.work_date)}</td><td>{f(r.actual_time || r.total_time)} giờ</td><td>{f(m.hv)}%</td><td>{f(m.ok)}</td><td>{f(m.ng)}</td><td style={prodStyle}>{f(m.productivity)}%</td><td>{f(m.achieved)}%</td><td style={ppStyle}>{f(m.pp)}% {m.pp === 0 || m.ngTypes === 1 ? "⚠" : ""}</td><td><span style={{ background: "#fff4dc", color: "#a56a00", borderRadius: 999, padding: "4px 7px", fontWeight: 800 }}>Chờ duyệt</span></td></tr>; })}</tbody>
                </table>
            </section>
        </div>
    </main>;
}
