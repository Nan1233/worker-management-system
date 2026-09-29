import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { getPendingReports } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import { getToday } from "./managerReportDateLogic";
import "./ReportsSplitReference.css";

const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};
const text = (v: unknown, fallback = "—") => v === null || v === undefined || v === "" ? fallback : String(v);
const fmt = (v: unknown) => num(v).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const pct = (v: unknown) => `${fmt(v)}%`;
const dateText = (v: unknown) => {
    const s = String(v || "").slice(0, 10);
    const [y, m, d] = s.split("-");
    return y && m && d ? `${d}/${m}/${y}` : s || "—";
};

const dateValue = (v: Date) =>
    `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;

const rangeFor = (value: string, type: "day" | "week" | "month" | "year") => {
    const start = new Date(`${value}T00:00:00`);
    const end = new Date(start);
    if (type === "year") {
        start.setMonth(0, 1);
        end.setMonth(11, 31);
    } else if (type === "month") {
        start.setDate(1);
        end.setMonth(end.getMonth() + 1, 0);
    } else if (type === "week") {
        const offset = (start.getDay() + 6) % 7;
        start.setDate(start.getDate() - offset);
        end.setTime(start.getTime());
        end.setDate(start.getDate() + 6);
    }
    return { dateFrom: dateValue(start), dateTo: dateValue(end) };
};

const kpi = (r: ProductionReport) => {
    const x = r as ProductionReport & Record<string, unknown>;
    const ok = num(x.tt_ok);
    const ng = num(x.tt_ng);
    const actual = num(x.actual_output) || ok + ng;
    const standard = num(x.standard_output) || num(x.target_output);
    const actualTime = num(x.actual_time || x.total_time);
    const ttDinhMuc = num(x.tt_dinh_muc) || (standard > 0 && actualTime > 0 ? standard * actualTime : 0);
    const nangSuat = num(x.nang_suat_percent) || (ttDinhMuc > 0 ? actual / ttDinhMuc * 100 : 0);
    const dat = actual > 0 ? ok / actual * 100 : 0;
    const pp = num(x.pp_percent) || (actual > 0 ? ng / actual * 100 : 0);
    const hv = num(x.training_percent ?? x.training_percent_snapshot ?? x.hv_percent ?? x.learning_percent ?? x.hoc_viec_percent);
    const ngTypeCount = Math.max(
        num(x.ng_defect_type_count),
        num(x.worker_ng_type_count),
        num(x.machine_ng_type_count),
        Array.isArray(x.defects) ? x.defects.filter((d: any) => num(d?.quantity) > 0).length : 0,
    );
    return { ok, ng, actual, nangSuat, dat, pp, hv, ngTypeCount };
};

const metricStyle = (type: "productivity" | "pp", value: number, ngTypeCount = 0): CSSProperties => {
    if (type === "productivity" && (value <= 75 || value > 100)) {
        return { backgroundColor: "#ffd6e7", color: "#9b123f", fontWeight: 800, border: "1px solid #ff9fbe" };
    }
    if (type === "pp" && (value === 0 || ngTypeCount === 1)) {
        return { backgroundColor: "#fff0b8", color: "#795600", fontWeight: 800, border: "1px solid #e3ad20" };
    }
    return {};
};

export default function Reports() {
    const navigate = useNavigate();
    const [date, setDate] = useState(getToday());
    const [range, setRange] = useState<{ dateFrom: string; dateTo: string } | null>(null);
    const [search, setSearch] = useState("");
    const [process, setProcess] = useState("");
    const [shift, setShift] = useState("");
    const [reports, setReports] = useState<ProductionReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [total, setTotal] = useState(0);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setError("");
            const r = range || { dateFrom: date, dateTo: date };
            const result = await getPendingReports({
                dateFrom: r.dateFrom,
                dateTo: r.dateTo,
                search: search.trim() || undefined,
                processName: process || undefined,
                shift: shift || undefined,
                page: 1,
                pageSize: 50,
            });
            setReports(result.data || []);
            setTotal(result.pagination?.total || (result.data || []).length);
        } catch (err: any) {
            setReports([]);
            setTotal(0);
            setError(err?.response?.data?.message || "Không thể tải báo cáo chờ duyệt.");
        } finally {
            setLoading(false);
        }
    }, [date, range, search, process, shift]);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => { setRange(null); }, [date]);

    const processes = useMemo(
        () => Array.from(new Set(reports.map(r => r.process_name).filter(Boolean) as string[])).sort(),
        [reports],
    );
    const shifts = useMemo(
        () => Array.from(new Set(reports.map(r => r.shift).filter(Boolean))).sort(),
        [reports],
    );

    const quick = (type: "day" | "week" | "month" | "year") => {
        const today = getToday();
        setDate(today);
        setRange(type === "day" ? null : rangeFor(today, type));
    };

    return (
        <main className="manager-page" style={{ padding: 18 }}>
            <div className="pending-reference-page" style={{ maxWidth: 1400, margin: "0 auto" }}>
                <div className="pending-page-title">
                    <h1>Báo cáo chờ duyệt</h1>
                </div>

                <div className="pending-filter-card">
                    <label className="pending-search">
                        <span>Tìm kiếm</span>
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm kiếm mã báo cáo, công nhân..." />
                    </label>

                    <label>
                        <span>Ngày báo cáo</span>
                        <input type="date" value={date} onChange={e => { setDate(e.target.value); setRange(null); }} />
                    </label>

                    <label>
                        <span>Công đoạn</span>
                        <select value={process} onChange={e => setProcess(e.target.value)}>
                            <option value="">Tất cả</option>
                            {processes.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </label>

                    <label>
                        <span>Ca làm việc</span>
                        <select value={shift} onChange={e => setShift(e.target.value)}>
                            <option value="">Tất cả</option>
                            {shifts.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </label>

                    <div className="pending-quick-filters">
                        {(["Hôm nay", "Tuần này", "Tháng này", "Năm này"] as const).map(label => {
                            const type = label === "Hôm nay" ? "day" : label === "Tuần này" ? "week" : label === "Tháng này" ? "month" : "year";
                            const target = type === "day" ? null : rangeFor(date, type);
                            const active = type === "day"
                                ? !range
                                : Boolean(range && target && range.dateFrom === target.dateFrom && range.dateTo === target.dateTo);
                            return (
                                <button key={label} type="button" className={active ? "active" : ""} onClick={() => quick(type)}>
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <section className="pending-workspace list-only">
                    <div className="pending-list-card">
                        <div className="pending-list-tabs">
                            <button type="button" className="pending-list-tab active">
                                Danh sách chờ duyệt <span className="tab-badge" style={{ background: "#fff0d8", color: "#a56a00" }}>{total}</span>
                            </button>
                        </div>

                        <div className="pending-table-wrap">
                            <table className="pending-reference-table">
                                <thead>
                                    <tr>
                                        <th>Mã báo cáo</th>
                                        <th>Công nhân</th>
                                        <th>Công đoạn</th>
                                        <th>Ca</th>
                                        <th>Ngày báo cáo</th>
                                        <th>Thời gian</th>
                                        <th>% HV</th>
                                        <th>TT OK</th>
                                        <th>NG</th>
                                        <th>% năng suất</th>
                                        <th>% đạt</th>
                                        <th>% PP</th>
                                        <th>Trạng thái</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={13} className="management-empty">Đang tải báo cáo...</td></tr>
                                    ) : error ? (
                                        <tr><td colSpan={13} className="management-empty" style={{ color: "#c24141" }}>{error}</td></tr>
                                    ) : reports.length === 0 ? (
                                        <tr><td colSpan={13} className="management-empty">Không có báo cáo chờ duyệt.</td></tr>
                                    ) : reports.map((r, i) => {
                                        const x = kpi(r);
                                        const code = `PR${String(r.work_date || "REPORT").slice(0, 10).replace(/-/g, "")}-${r.worker_code || String(r.id || i + 1).padStart(4, "0")}`;
                                        return (
                                            <tr key={r.id ?? i} onClick={() => navigate(`/manager/report/${r.id}?source=pending`)}>
                                                <td style={{ color: "#1769d2", fontWeight: 500 }}>{code}</td>
                                                <td>{text(r.full_name || r.worker_name)} <span style={{ color: "#7185a4" }}>({text(r.worker_code)})</span></td>
                                                <td>{text(r.process_name || r.process_code)}</td>
                                                <td><span className="shift-chip">{text(r.shift)}</span></td>
                                                <td>{dateText(r.work_date)}</td>
                                                <td>{fmt(r.actual_time || r.total_time)} giờ</td>
                                                <td>{pct(x.hv)}</td>
                                                <td>{fmt(x.ok)}</td>
                                                <td>{fmt(x.ng)}</td>
                                                <td style={metricStyle("productivity", x.nangSuat, x.ngTypeCount)}>{pct(x.nangSuat)}</td>
                                                <td>{pct(x.dat)}</td>
                                                <td style={metricStyle("pp", x.pp, x.ngTypeCount)}>{pct(x.pp)}{x.pp === 0 || x.ngTypeCount === 1 ? " ⚠" : ""}</td>
                                                <td><span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 20, padding: "0 7px", borderRadius: 999, background: "#fff0d8", color: "#a56a00", fontSize: 10, fontWeight: 500 }}>Chờ duyệt</span></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="pending-table-footer">
                            <span>Hiển thị {reports.length ? 1 : 0} đến {reports.length} của {total} báo cáo</span>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}
