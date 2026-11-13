import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import axios from "axios";
import { getApprovedReports, getReportById, invalidateApprovedReportCache } from "../../services/productionService";
import { getAccessToken } from "../../utils/authStorage";
import type { ProductionReport } from "../../types/production";
import { getToday } from "./managerReportDateLogic";
import { getAllReportDefects } from "../../utils/reportDetails";
import "./ReportsSplitReference.css";
import "./ApprovedReviewScreen.css";

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
    const machineLines = Array.isArray(x.machine_lines) ? x.machine_lines as Record<string, unknown>[] : [];
    const machineGrossTime = machineLines.reduce((sum, line) => sum + Math.max(0, num(line.machine_time_hours)), 0);
    const machineNetTime = machineLines.reduce((sum, line) => {
        const gross = Math.max(0, num(line.machine_time_hours));
        const deduction = Math.max(0, num(line.deduction_time_hours));
        return sum + Math.max(0, gross - deduction);
    }, 0);
    const machineStandardTime = machineLines.reduce((sum, line) => {
        const netHours = Math.max(0, num(line.machine_time_hours) - num(line.deduction_time_hours));
        return sum + (netHours > 0 ? netHours * Math.max(0, num(line.standard_output)) : 0);
    }, 0);
    const standard = num(x.standard_output) || num(x.target_output);
    // KPI uses net productive hours; the visible "Thời gian" field uses gross machine time.
    const actualTime = num(x.actual_time) || machineNetTime;
    const totalTime = num(x.total_time) || machineGrossTime;
    const ttDinhMuc = num(x.tt_dinh_muc) || machineStandardTime || (standard > 0 && actualTime > 0 ? standard * actualTime : 0);
    const nangSuat = num(x.nang_suat_percent) || (ttDinhMuc > 0 ? actual / ttDinhMuc * 100 : 0);
    const dat = actual > 0 ? ok / actual * 100 : 0;
    const pp = num(x.pp_percent) || (actual > 0 ? ng / actual * 100 : 0);
    const hv = x.training_percent ?? x.hv_percent ?? x.learning_percent ?? x.hoc_viec_percent ?? 0;
    const ngTypeCount = Math.max(num(x.ng_defect_type_count), num(x.worker_ng_type_count), num(x.machine_ng_type_count));
    return { ok, ng, actual, actualTime, totalTime, ttDinhMuc, nangSuat, dat, pp, hv, ngTypeCount };
};

const metricStyle = (type: "productivity" | "pp", value: number, ngTypeCount = 0): CSSProperties => {
    if (type === "productivity" && (value <= 75 || value > 100)) return { backgroundColor: "#ffd6e7", color: "#9b123f", fontWeight: 800, border: "1px solid #ff9fbe" };
    if (type === "pp" && (value === 0 || ngTypeCount === 1)) return { backgroundColor: "#fff0b8", color: "#795600", fontWeight: 800, border: "1px solid #e3ad20" };
    return {};
};

const parseMachineDefects = (detail: Record<string, unknown> | null) => {
    const lines = Array.isArray(detail?.machine_lines) ? detail!.machine_lines as Record<string, unknown>[] : [];
    const result: Array<{ name: string; quantity: number; machine: string }> = [];
    for (const line of lines) {
        let raw: unknown = line.defects;
        if (!Array.isArray(raw)) raw = line.defects_json;
        if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { raw = null; } }
        if (raw && !Array.isArray(raw) && typeof raw === "object" && Array.isArray((raw as any).defects)) raw = (raw as any).defects;
        if (Array.isArray(raw)) {
            for (const item of raw as any[]) {
                const quantity = num(item?.quantity ?? item?.qty ?? item?.ng_quantity);
                if (quantity > 0) result.push({ name: text(item?.defect_name || item?.name || item?.defect_code, "NG chưa phân loại"), quantity, machine: text(line.machine_code) });
            }
        } else if (raw && typeof raw === "object") {
            for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
                if (["selectedDefects", "selectedNg", "total", "ngQuantity"].includes(key)) continue;
                const quantity = num(typeof value === "object" && value ? (value as any).quantity ?? (value as any).qty ?? (value as any).ng_quantity : value);
                if (quantity > 0) result.push({ name: text(typeof value === "object" && value ? (value as any).defect_name || (value as any).name || key : key), quantity, machine: text(line.machine_code) });
            }
        }
    }
    return result;
};

export default function ApprovedReports() {
    const [date, setDate] = useState(getToday());
    const [range, setRange] = useState<{ dateFrom: string; dateTo: string } | null>(() => rangeFor(getToday(), "month"));
    const [searchKeyword, setSearchKeyword] = useState(""); const [searchQuery, setSearchQuery] = useState(""); const [process, setProcess] = useState(""); const [shift, setShift] = useState("");
    const [reports, setReports] = useState<ProductionReport[]>([]); const [processOptions, setProcessOptions] = useState<string[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
    const [page, setPage] = useState(1); const [pages, setPages] = useState(1); const [total, setTotal] = useState(0);
    const [reportImportPreview, setReportImportPreview] = useState<{ filePath?: string; fileName?: string; detected: number; creates?: number; updates?: number } | null>(null);
    const [reportImportStatus, setReportImportStatus] = useState<{ tone: "success" | "warning" | "error"; message: string } | null>(null);
    const [reportImportBusy, setReportImportBusy] = useState(false);
    const [counts, setCounts] = useState({ day: 0, week: 0, month: 0, year: 0 });
    const [detail, setDetail] = useState<ProductionReport | null>(null); const [detailLoading, setDetailLoading] = useState(false); const [detailError, setDetailError] = useState("");

    const reportLoadSeqRef = useRef(0);
    const detailRequestSeqRef = useRef(0);
    const detailReportRef = useRef<ProductionReport | null>(null);
    const previousFilterKeyRef = useRef("");

    useEffect(() => {
        const timer = setTimeout(() => {
            setSearchQuery(searchKeyword.trim());
        }, 250);
        return () => clearTimeout(timer);
    }, [searchKeyword]);

    const load = useCallback(async () => {
        const requestSeq = ++reportLoadSeqRef.current;
        const isCurrentRequest = () => reportLoadSeqRef.current === requestSeq;
        try {
            setLoading(true); setError("");
            const r = range || { dateFrom: date, dateTo: date };
            const filters = { dateFrom: r.dateFrom, dateTo: r.dateTo, processName: process || undefined, shift: shift || undefined, search: searchQuery || undefined };
            const result = await getApprovedReports({ ...filters, page, pageSize: 20 });
            if (!isCurrentRequest()) return;
            const lastPage = Math.max(1, result.pagination?.total_pages || 1);
            setTotal(result.pagination?.total || 0); setPages(lastPage);
            if (result.processes) setProcessOptions(result.processes.map(item => String(item?.process_name || item?.process_code || "")).filter(Boolean).sort((a, b) => a.localeCompare(b, "vi")));
            if (page > lastPage) { setReports([]); setPage(lastPage); return; }
            setReports(result.data || []);

        } catch (e: unknown) {
            if (!isCurrentRequest()) return;
            setError(axios.isAxiosError(e) ? e.response?.data?.message || "Không thể tải báo cáo đã duyệt" : "Không thể tải báo cáo đã duyệt");
            /* Keep the previous list visible when refresh fails. */
        } finally { if (isCurrentRequest()) setLoading(false); }
    }, [date, range, process, shift, searchQuery, page]);

    // KPI counts depend on filters, not on the current table page. Keep them
    // separate from paged rows to avoid four redundant API calls per page turn.
    useEffect(() => {
        let cancelled = false;
        const ranges = (["day", "week", "month", "year"] as const).map(type => rangeFor(date, type));
        void Promise.allSettled(ranges.map(x => getApprovedReports({
            dateFrom: x.dateFrom, dateTo: x.dateTo,
            processName: process || undefined, shift: shift || undefined,
            search: searchQuery || undefined, page: 1, pageSize: 1, includeMeta: false,
        }))).then(values => {
            if (cancelled) return;
            setCounts(previous => {
                const count = (index: number, fallback: number) => {
                    const result = values[index];
                    return result.status === "fulfilled" ? (result.value.pagination?.total || 0) : fallback;
                };
                return { day: count(0, previous.day), week: count(1, previous.week), month: count(2, previous.month), year: count(3, previous.year) };
            });
        });
        return () => { cancelled = true; };
    }, [date, process, shift, searchQuery]);

    const filterKey = JSON.stringify([date, range?.dateFrom || "", range?.dateTo || "", process, shift, searchQuery]);
    useEffect(() => {
        const changed = previousFilterKeyRef.current !== filterKey;
        previousFilterKeyRef.current = filterKey;
        if (changed && page !== 1) return;
        void load();
        return () => { reportLoadSeqRef.current += 1; };
    }, [load, filterKey, page]);
    useEffect(() => { setPage(1); }, [date, range, process, shift, searchQuery]);
    useEffect(() => {
        detailRequestSeqRef.current += 1; detailReportRef.current = null;
        setDetail(null); setDetailError(""); setDetailLoading(false);
    }, [date, range, process, shift, searchQuery, page]);

    const processes = useMemo(() => Array.from(new Set([...processOptions, process].filter(Boolean))).sort((a, b) => a.localeCompare(b, "vi")), [processOptions, process]);
    const shifts = useMemo(() => Array.from(new Set(["A", "B", "C", "D", ...reports.map(r => String(r.shift || "")).filter(Boolean), shift].filter(Boolean))).sort(), [reports, shift]);
    const quick = (type: "day" | "week" | "month" | "year") => { setDate(getToday()); setRange(type === "day" ? null : rangeFor(getToday(), type)); };

    const openDetail = async (report: ProductionReport) => {
        const sequence = ++detailRequestSeqRef.current; detailReportRef.current = report;
        setDetail(report); setDetailLoading(true); setDetailError("");
        try {
            const full = await getReportById(Number(report.id), "approved");
            if (detailRequestSeqRef.current !== sequence) return;
            if (!full || Number(full.id) !== Number(report.id)) {
                setDetailError("Chi tiết không hợp lệ. Vui lòng tải lại.");
                return;
            }
            setDetail(full);
        } catch {
            if (detailRequestSeqRef.current === sequence) setDetailError("Không thể tải chi tiết. Vui lòng thử lại.");
        } finally {
            if (detailRequestSeqRef.current === sequence) setDetailLoading(false);
        }
    };
    const closeDetail = () => {
        detailRequestSeqRef.current += 1; detailReportRef.current = null;
        setDetail(null); setDetailLoading(false); setDetailError("");
    };
    const resetFilters = () => {
        const today = getToday();
        setDate(today); setRange(rangeFor(today, "month"));
        setSearchKeyword(""); setSearchQuery(""); setProcess(""); setShift("");
    };
    const refreshReports = () => {
        invalidateApprovedReportCache();
        detailRequestSeqRef.current += 1;
        detailReportRef.current = null;
        setDetail(null);
        setDetailError("");
        setDetailLoading(false);
        void load();
    };

    const desktopImportApi = () => (window as Window & { ktcDesktop?: {
        isDesktop?: boolean;
        previewReportImport?: (token: string) => Promise<any>;
        applyReportImport?: (token: string, filePath: string) => Promise<any>;
    } }).ktcDesktop;

    const previewExcelImport = async () => {
        const desktop = desktopImportApi();
        const token = getAccessToken() || "";
        if (!token) { setReportImportStatus({ tone: "error", message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." }); return; }
        if (!desktop?.isDesktop || typeof desktop.previewReportImport !== "function") {
            setReportImportStatus({ tone: "warning", message: "Nhập Excel chỉ khả dụng trên ứng dụng KTC Desktop." });
            return;
        }
        setReportImportBusy(true); setReportImportStatus(null); setReportImportPreview(null);
        try {
            const preview = await desktop.previewReportImport(token);
            if (preview?.canceled) { setReportImportPreview(null); return; }
            if (!preview?.filePath) throw new Error("Không nhận được đường dẫn file import hợp lệ.");
            setReportImportPreview({ ...preview, filePath: preview.filePath });
            if (Number(preview.detected || 0) === 0) {
                setReportImportStatus({ tone: "warning", message: "File không có dòng mới hoặc thay đổi cần import." });
            } else {
                setReportImportStatus({ tone: "success", message: "Đã đọc " + Number(preview.detected) + " thay đổi từ " + (preview.fileName || "file Excel") + "." });
            }
        } catch (error) {
            setReportImportStatus({ tone: "error", message: error instanceof Error ? error.message : "Không thể đọc file import." });
        } finally { setReportImportBusy(false); }
    };

    const applyExcelImport = async () => {
        if (!reportImportPreview?.filePath) return;
        const desktop = desktopImportApi();
        const token = getAccessToken() || "";
        if (!token) { setReportImportStatus({ tone: "error", message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." }); return; }
        if (!desktop?.isDesktop || typeof desktop.applyReportImport !== "function") {
            setReportImportStatus({ tone: "warning", message: "Nhập Excel chỉ khả dụng trên ứng dụng KTC Desktop." });
            return;
        }
        setReportImportBusy(true); setReportImportStatus(null);
        try {
            const result = await desktop.applyReportImport(token, reportImportPreview.filePath);
            if (Number(result?.failed || 0) > 0) {
                setReportImportStatus({ tone: "warning", message: "Import một phần: " + Number(result?.succeeded || 0) + " thành công, " + Number(result.failed) + " lỗi. Có thể kiểm tra và thử lại." });
            } else if (Number(result?.detected || 0) === 0 || Number(result?.succeeded || 0) === 0) {
                setReportImportStatus({ tone: "warning", message: "File không có dòng mới hoặc thay đổi cần import." });
                setReportImportPreview(null);
            } else {
                setReportImportStatus({ tone: "success", message: "Import thành công " + Number(result.succeeded) + " báo cáo." });
                setReportImportPreview(null);
                invalidateApprovedReportCache();
                await load();
            }
        } catch (error) {
            setReportImportStatus({ tone: "error", message: error instanceof Error ? error.message : "Không thể import báo cáo." });
        } finally { setReportImportBusy(false); }
    };

    const detailKpi = detail ? kpi(detail) : null;
    const detailAny = detail as (ProductionReport & Record<string, unknown>) | null;
    const detailDeductions = Array.isArray(detailAny?.deductions) ? (detailAny?.deductions as any[]).filter(x => num(x.hours) > 0) : [];
    const detailDefects = detail ? getAllReportDefects(detail).filter(x => num(x.quantity) > 0) : [];
    const detailMachineDefects = parseMachineDefects(detailAny);

    return (
        <div className="pending-reference-page approved-review-screen">
            <div className="pending-page-title"><h1 style={{ margin: 0, color: "#12385f", fontSize: 26, fontWeight: 800 }}>Báo cáo đã duyệt</h1><div style={{ marginTop: 5, color: "#6f89a8", fontSize: 13 }}>Xem lại các báo cáo sản xuất đã được duyệt.</div></div>
            <div className="approved-review-toolbar">
                <span role="status" aria-live="polite">{range ? `Từ ${dateText(range.dateFrom)} đến ${dateText(range.dateTo)}` : `Ngày ${dateText(date)}`}</span>
                <div><button type="button" onClick={resetFilters} disabled={reportImportBusy}>Đặt lại bộ lọc</button><button type="button" onClick={refreshReports} disabled={reportImportBusy || loading}>{loading ? "Đang tải..." : "Làm mới danh sách"}</button></div>
            </div>
            <div className="pending-filter-card approved-review-filters">
                <label className="pending-search"><span>Tìm kiếm</span><input value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)} aria-label="Tìm báo cáo theo mã hoặc công nhân" placeholder="Tìm kiếm mã báo cáo, công nhân..." /></label>
                <label className="pending-date-filter"><span>Ngày báo cáo</span><input type="date" value={date} onChange={e => { setDate(e.target.value); setRange(null); }} /></label>
                <div className="pending-quick-filters">{(["Hôm nay", "Tuần này", "Tháng này", "Năm này"] as const).map(label => { const type = label === "Hôm nay" ? "day" : label === "Tuần này" ? "week" : label === "Tháng này" ? "month" : "year"; const active = type === "day" ? !range && date === getToday() : Boolean(range && date === getToday() && range.dateFrom === rangeFor(date, type).dateFrom && range.dateTo === rangeFor(date, type).dateTo); return <button key={label} type="button" className={active ? "active" : ""} aria-pressed={active} onClick={() => quick(type)}>{label}</button>; })}</div>
                <label className="pending-process-filter"><span>Công đoạn</span><select value={process} onChange={e => setProcess(e.target.value)}><option value="">Tất cả</option>{processes.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
                <label className="pending-shift-filter"><span>Ca làm việc</span><select value={shift} onChange={e => setShift(e.target.value)}><option value="">Tất cả</option>{shifts.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
            </div>
            <section className="approved-report-import" aria-label="Nhập báo cáo Excel" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 10, padding: 12, border: "1px solid #dbe6f2", borderRadius: 10, background: "#fff" }}>
                <button type="button" onClick={() => void previewExcelImport()} disabled={reportImportBusy} aria-label="Chọn file Excel để import">{reportImportBusy ? "Đang xử lý..." : "Nhập từ Excel"}</button>
                {reportImportPreview && Number(reportImportPreview.detected || 0) > 0 && <span>{reportImportPreview.fileName || "File Excel"} · {reportImportPreview.detected} thay đổi ({reportImportPreview.creates || 0} thêm, {reportImportPreview.updates || 0} cập nhật)</span>}
                {reportImportPreview && Number(reportImportPreview.detected || 0) > 0 && <button type="button" onClick={() => void applyExcelImport()} disabled={reportImportBusy}>Xác nhận import</button>}
                {reportImportStatus && <p role="status" aria-live="polite" data-tone={reportImportStatus.tone} className={reportImportStatus.tone === "warning" ? "warning" : reportImportStatus.tone} style={{ flexBasis: "100%", margin: 0 }}>{reportImportStatus.message}</p>}
            </section>
            <div className="pending-kpis" style={{ display: "grid", gap: 12, marginTop: 12 }}>{[["Hôm nay", counts.day, "kpi-orange", "day"], ["Tuần này", counts.week, "kpi-slate", "week"], ["Tháng này", counts.month, "", "month"], ["Năm này", counts.year, "", "year"]].map(([label, value, tone, type]) => <button key={String(label)} type="button" className={`pending-kpi ${tone}`} onClick={() => quick(type as "day" | "week" | "month" | "year")} style={{ border: "1px solid #dbe6f2", borderRadius: 10, padding: "12px 14px", background: tone === "kpi-orange" ? "#fff8ef" : tone === "kpi-slate" ? "#f7f9fc" : "#fff", textAlign: "left" }}><span>{label}</span><strong>{value}</strong><small>Báo cáo đã duyệt · Bấm để xem</small></button>)}</div>
            <div className={`pending-workspace ${detail ? "" : "list-only"}`} style={{ marginTop: 12 }}>
                <section className="pending-list-card">
                    <div className="pending-list-tabs"><button type="button" className="pending-list-tab active">Danh sách đã duyệt <span className="tab-badge" style={{ background: "#e8f8f0", color: "#159266" }}>{total}</span></button></div>
                    <div className="pending-table-wrap" role="region" aria-label="Bảng báo cáo đã duyệt, có thể cuộn ngang" tabIndex={0} style={{ overflowX: "auto" }}><table className="pending-reference-table" style={{ width: "100%", borderCollapse: "collapse" }}><caption className="approved-table-caption">Danh sách báo cáo đã duyệt</caption>
                        <thead><tr><th className="management-checkbox-column">Xem</th><th>Mã báo cáo</th><th>Công nhân</th><th>Công đoạn</th><th>Ca</th><th>Ngày báo cáo</th><th>Thời gian</th><th>% HV</th><th>TT OK</th><th>NG</th><th>% năng suất</th><th>% đạt</th><th>% PP</th><th>Trạng thái</th></tr></thead>
                        <tbody>{loading ? <tr><td colSpan={14} className="management-empty" style={{ padding: 48, textAlign: "center" }}>Đang tải báo cáo...</td></tr> : error ? <tr><td colSpan={14} className="management-error" style={{ padding: 48, textAlign: "center", color: "#c24141" }}><div role="alert">{error}</div><button type="button" className="approved-retry-button" onClick={refreshReports}>Thử tải lại</button></td></tr> : reports.length === 0 ? <tr><td colSpan={14} className="management-empty" style={{ padding: 48, textAlign: "center" }}>Không có báo cáo đã duyệt.</td></tr> : reports.map((r, i) => { const x = kpi(r); return <tr key={r.id ?? i} tabIndex={0} aria-selected={detail?.id === r.id} className={detail?.id === r.id ? "pending-row-active" : ""} onClick={() => void openDetail(r)} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); void openDetail(r); } }} style={{ cursor: "pointer" }}>
                            <td style={{ textAlign: "center" }}><button type="button" className="pending-detail-edit" aria-label={`Xem báo cáo ${r.id}`} onClick={e => { e.stopPropagation(); void openDetail(r); }}>⌕</button></td>
                            <td>{`PR${String(r.work_date || "REPORT").slice(0, 10).replace(/-/g, "")}-${r.worker_code || String(r.id || i + 1).padStart(4, "0")}`}</td><td>{text(r.full_name || r.worker_name)} <span style={{ color: "#7185a4" }}>({text(r.worker_code)})</span></td><td>{text(r.process_name)}</td><td><span className="shift-chip">{text(r.shift)}</span></td><td>{dateText(r.work_date)}</td><td>{fmt(x.totalTime || x.actualTime)} giờ</td><td>{pct(x.hv)}</td><td>{fmt(x.ok)}</td><td>{fmt(x.ng)}</td>
                            <td style={metricStyle("productivity", x.nangSuat, x.ngTypeCount)}>{pct(x.nangSuat)}</td><td>{pct(x.dat)}</td><td style={metricStyle("pp", x.pp, x.ngTypeCount)}>{pct(x.pp)}{x.pp === 0 || x.ngTypeCount === 1 ? " ⚠" : ""}</td><td><span className="pending-detail-status">Đã duyệt</span></td>
                        </tr>; })}</tbody>
                    </table></div>
                    <div className="pending-table-footer" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 13 }}><span role="status" aria-live="polite">Trang {page}/{pages} · {total} báo cáo</span><nav className="management-pagination" aria-label="Phân trang báo cáo"><button type="button" aria-label="Trang trước" disabled={loading || page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Trước</button><button type="button" aria-label="Trang sau" disabled={loading || page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))}>Sau</button></nav></div>
                </section>
                {detail && <aside className="pending-detail-card approved-detail-card" aria-label={`Chi tiết báo cáo #${detail.id}`}>
                    <div className="pending-detail-head"><div className="pending-detail-title"><h2>Chi tiết báo cáo</h2><span className="pending-detail-status">Đã duyệt</span><span className="pending-detail-code">#{detail.id}</span></div><button type="button" className="pending-detail-close" onClick={closeDetail} aria-label="Đóng">×</button></div>
                    {detailLoading ? <div className="pending-detail-loading" role="status">Đang tải chi tiết...</div> : detailError ? <div className="approved-detail-error" role="alert">{detailError}<button type="button" onClick={() => { if (detailReportRef.current) void openDetail(detailReportRef.current); }}>Tải lại chi tiết</button></div> : detailKpi && <div className="pending-detail-body">
                        <section className="pending-detail-section"><h3>Thông tin chung</h3><div className="pending-detail-grid">{[["Công nhân", `${text(detail.full_name || detail.worker_name)} (${text(detail.worker_code)})`], ["Ngày báo cáo", dateText(detail.work_date)], ["Công đoạn", text(detail.process_name)], ["Ca làm việc", text(detail.shift)], ["Máy móc", text(detail.machine_no)], ["Sản phẩm", text(detail.product_name)], ["Thời gian", `${fmt(detailKpi.totalTime || detailKpi.actualTime || detail.total_time)} giờ`], ["Học việc", pct(detailKpi.hv)]].map(([label, value]) => <div className="pending-detail-field" key={String(label)}><span>{label}</span><strong>{String(value)}</strong></div>)}</div></section>
                        <section className="pending-detail-section"><h3>Kết quả sản xuất</h3><div className="pending-result-grid"><div className="pending-result-item"><span>Sản lượng OK</span><strong>{fmt(detailKpi.ok)}</strong></div><div className="pending-result-item ng"><span>Sản lượng NG</span><strong>{fmt(detailKpi.ng)}</strong></div><div className="pending-result-item total"><span>Tổng sản lượng</span><strong>{fmt(detailKpi.actual)}</strong></div><div className="pending-result-item rate"><span>% đạt</span><strong>{pct(detailKpi.dat)}</strong></div></div></section>
                        <section className="pending-detail-section"><h3>Chỉ số KPI</h3><div className="pending-detail-info-grid"><div className="pending-detail-field"><span>TT định mức</span><strong>{fmt(detailKpi.ttDinhMuc)}</strong></div><div className="pending-detail-field" style={metricStyle("productivity", detailKpi.nangSuat, detailKpi.ngTypeCount)}><span>% năng suất</span><strong>{pct(detailKpi.nangSuat)}</strong></div><div className="pending-detail-field"><span>% đạt</span><strong>{pct(detailKpi.dat)}</strong></div><div className="pending-detail-field" style={metricStyle("pp", detailKpi.pp, detailKpi.ngTypeCount)}><span>% PP (NG)</span><strong>{pct(detailKpi.pp)}{detailKpi.pp === 0 || detailKpi.ngTypeCount === 1 ? " ⚠" : ""}</strong></div></div></section>
                        <section className="pending-detail-section"><h3>Chi tiết thời gian trừ</h3>{detailDeductions.length ? <div className="pending-defect-list">{detailDeductions.map((x: any, i: number) => <span className="pending-defect" key={i}>{text(x.deduction_name, x.deduction_code)}: {fmt(num(x.hours) * 60)} phút</span>)}</div> : <div className="pending-history-empty">Không có thời gian trừ.</div>}</section>
                        <section className="pending-detail-section"><h3>Chi tiết lỗi NG của người</h3>{detailDefects.length ? <div className="pending-defect-list">{detailDefects.map((x: any, i: number) => <span className="pending-defect" key={i}>{text(x.defect_name, x.defect_code)}: {fmt(x.quantity)} sản phẩm</span>)}</div> : detailKpi.ng > 0 ? <div className="pending-history-empty" style={{ background: "#fff8e1", border: "1px solid #f0c36d", color: "#7a5b00", fontWeight: 700 }}>NG {fmt(detailKpi.ng)} sản phẩm — chưa phân loại lỗi.</div> : <div className="pending-history-empty">Không có lỗi NG.</div>}</section>
                        <section className="pending-detail-section"><h3>Chi tiết lỗi NG theo máy</h3>{detailMachineDefects.length ? <div className="pending-defect-list">{detailMachineDefects.map((x, i) => <span className="pending-defect" key={`${x.machine}-${x.name}-${i}`}>{x.machine !== "—" ? `${x.machine} · ` : ""}{x.name}: {fmt(x.quantity)} sản phẩm</span>)}</div> : <div className="pending-history-empty">Không có chi tiết lỗi NG theo máy.</div>}</section>
                        <section className="pending-detail-section"><h3>Ghi chú</h3><div className="pending-detail-field"><span>Ghi chú</span><strong>{text(detail.note || (detail as any).notes, "Không có ghi chú")}</strong></div></section>
                    </div>}
                </aside>}
            </div>
        </div>
    );
}
