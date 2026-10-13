import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { approveTempReport, getPendingReports, getTempReportDetail, rejectSelectedTempReports } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import { getToday } from "./managerReportDateLogic";
import "./ReportsSplitReference.css";
import "./ReportsDetailCompact.css";

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const text = (v: unknown, fallback = "—") => v === null || v === undefined || v === "" ? fallback : String(v);
const getStoredExtraData = (value: unknown): Record<string, unknown> => {
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    if (typeof value === "string") { try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {}; } catch {} }
    return {};
};
const processLabel = (report: ProductionReport) => {
    const x = report as ProductionReport & Record<string, unknown>;
    const extra = getStoredExtraData(x.extra_data);
    const workType = String(extra.work_type || x.work_type || "").trim();
    return extra.non_product_work === true && workType
        ? `${text(x.process_name || x.process_code)} · Công việc khác (${workType})`
        : text(x.process_name || x.process_code);
};
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
    const [date, setDate] = useState(getToday());
    const [range, setRange] = useState<{ dateFrom: string; dateTo: string } | null>(null);
    const [search, setSearch] = useState(""); const [process, setProcess] = useState(""); const [shift, setShift] = useState("");
    const [reports, setReports] = useState<ProductionReport[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
    const [page, setPage] = useState(1); const [pages, setPages] = useState(1); const [total, setTotal] = useState(0);
    const [detail, setDetail] = useState<ProductionReport | null>(null); const [detailLoading, setDetailLoading] = useState(false); const [approving, setApproving] = useState(false);
    const [selectedIds, setSelectedIds] = useState<number[]>([]); const [bulkApproving, setBulkApproving] = useState(false);
    const [rejectReason, setRejectReason] = useState(""); const [rejectNote, setRejectNote] = useState(""); const [rejecting, setRejecting] = useState(false); const [rejectDialogOpen, setRejectDialogOpen] = useState(false); const [rejectTargetIds, setRejectTargetIds] = useState<number[]>([]);

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
    useEffect(() => { setPage(1); setDetail(null); setSelectedIds([]); }, [date, range, process, shift, search]);
    useEffect(() => { setSelectedIds([]); }, [page]);

    const processes = useMemo(() => Array.from(new Set(reports.map(r => r.process_name).filter(Boolean) as string[])).sort(), [reports]);
    const shifts = useMemo(() => Array.from(new Set(reports.map(r => r.shift).filter(Boolean))).sort(), [reports]);
    const quick = (type: "day" | "week" | "month" | "year") => { const today = getToday(); setDate(today); setRange(type === "day" ? null : rangeFor(today, type)); };

    const openDetail = async (report: ProductionReport) => {
        setDetail(report);
        setDetailLoading(true);
        try {
            const full = await getTempReportDetail(Number(report.id));
            setDetail(full || report);
        } catch {
            setDetail(report);
        } finally {
            setDetailLoading(false);
        }
    };

    const approveDetail = async () => {
        if (!detail || approving) return;
        setApproving(true);
        try {
            await approveTempReport(Number(detail.id));
            setDetail(null);
            await load();
            window.alert("Đã duyệt báo cáo thành công.");
        } catch (e: any) {
            window.alert(e?.response?.data?.message || e?.message || "Không thể duyệt báo cáo. Vui lòng thử lại.");
        } finally {
            setApproving(false);
        }
    };

    const openRejectDialog = (ids: number[]) => {
        const validIds = [...new Set(ids.map(Number).filter(id => Number.isInteger(id) && id > 0))];
        if (!validIds.length || rejecting) return;
        setRejectTargetIds(validIds);
        setRejectReason("");
        setRejectNote("");
        setRejectDialogOpen(true);
    };

    const rejectTargets = async () => {
        if (rejecting || !rejectTargetIds.length) return;
        const reason = rejectReason === "Khác" ? rejectNote.trim() : rejectReason.trim();
        if (!reason) { window.alert("Vui lòng chọn lý do từ chối."); return; }
        const targets = reports.filter(report => rejectTargetIds.includes(Number(report.id)));
        if (targets.length !== rejectTargetIds.length) {
            window.alert("Một số báo cáo không còn trong danh sách hiện tại. Hãy tải lại danh sách rồi thử lại.");
            return;
        }
        if (!window.confirm(`Từ chối ${targets.length} báo cáo đã chọn? Lý do: ${reason}`)) return;
        setRejecting(true);
        try {
            const failedIds: number[] = [];
            const failures: string[] = [];
            let succeeded = 0;
            for (const report of targets) {
                try { await rejectSelectedTempReports([Number(report.id)], reason); succeeded += 1; }
                catch (e: any) { failedIds.push(Number(report.id)); failures.push(`#${report.id}: ${e?.response?.data?.message || e?.message || "Không thể từ chối"}`); }
            }
            setSelectedIds(previous => [...new Set([...previous.filter(id => !rejectTargetIds.includes(id)), ...failedIds])]);
            if (detail && rejectTargetIds.includes(Number(detail.id)) && !failedIds.includes(Number(detail.id))) setDetail(null);
            setRejectDialogOpen(false);
            setRejectTargetIds([]);
            await load();
            window.alert(`Đã từ chối ${succeeded}/${targets.length} báo cáo.${failures.length ? `\\n\\nCác báo cáo chưa từ chối:\\n• ${failures.join("\\n• ")}` : ""}`);
        } finally { setRejecting(false); }
    };

    const visibleIds = reports.map(r => Number(r.id)).filter(id => Number.isInteger(id) && id > 0);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id));
    const toggleSelected = (id: number) => setSelectedIds(previous => previous.includes(id) ? previous.filter(x => x !== id) : [...previous, id]);
    const toggleVisibleSelection = () => setSelectedIds(previous => allVisibleSelected ? previous.filter(id => !visibleIds.includes(id)) : [...new Set([...previous, ...visibleIds])]);
    const approveBulk = async () => {
        const targets = reports.filter(r => selectedIds.includes(Number(r.id)));
        if (!targets.length || bulkApproving) return;
        if (!window.confirm(`Duyệt lần lượt ${targets.length} báo cáo đã chọn? Báo cáo lỗi sẽ được giữ lại để xử lý sau.`)) return;
        setBulkApproving(true); setError("");
        const failedIds: number[] = [];
        const failures: string[] = [];
        let succeeded = 0;
        try {
            // Process each report independently: one invalid report must not block others.
            for (const report of targets) {
                const id = Number(report.id);
                try {
                    await approveTempReport(id);
                    succeeded += 1;
                } catch (e: any) {
                    failedIds.push(id);
                    const code = `PR${String(report.work_date || "REPORT").slice(0, 10).replace(/-/g, "")}-${report.worker_code || id}`;
                    const message = e?.response?.data?.message || e?.message || "Không thể duyệt";
                    failures.push(`${code} (#${id}): ${message}`);
                }
            }
            setSelectedIds(failedIds);
            if (detail && succeeded > 0 && !failedIds.includes(Number(detail.id))) setDetail(null);
            await load();
            const summary = `Duyệt thành công ${succeeded}/${targets.length} báo cáo.${failedIds.length ? `\\n\\nGiữ lại ${failedIds.length} báo cáo chưa duyệt để xử lý tiếp:${`\\n• ${failures.join("\\n• ")}`}` : ""}`;
            window.alert(summary);
        } finally { setBulkApproving(false); }
    };

    const detailKpi = detail ? kpi(detail) : null;
    const detailAny = detail as (ProductionReport & Record<string, unknown>) | null;
    const detailDeductions = Array.isArray(detailAny?.deductions) ? (detailAny?.deductions as any[]).filter(x => num(x.hours) > 0) : [];
    const detailDefects = Array.isArray(detailAny?.defects) ? (detailAny?.defects as any[]).filter(x => num(x.quantity) > 0) : [];

    return (
        <div className="pending-reference-page">
            <div className="pending-page-title">
                <h1 style={{ margin: 0, color: "#12385f", fontSize: 26, fontWeight: 800 }}>Báo cáo chờ duyệt</h1>
                <div style={{ marginTop: 5, color: "#6f89a8", fontSize: 13 }}>Xem các báo cáo sản xuất đang chờ duyệt.</div>
            </div>

            <div className="pending-filter-card" style={{ display: "grid", gridTemplateColumns: "minmax(220px, 2fr) minmax(150px, 1fr) minmax(150px, 1fr) minmax(140px, .9fr)", gridTemplateAreas: '"search date process shift" "quick quick quick quick"', gap: "10px 12px", alignItems: "end", padding: 14, border: "1px solid #dbe6f2", borderRadius: 12, background: "#fff", boxShadow: "0 4px 14px rgba(35,76,125,.045)" }}>
                <label className="pending-search" style={{ gridArea: "search", display: "flex", flexDirection: "column", alignSelf: "end", gap: 4, minWidth: 0, position: "relative" }}><span style={{ position: "static", display: "block", width: "auto", height: "auto", border: 0, fontSize: 12, lineHeight: "16px", color: "#526b88", zIndex: "auto" }}>Tìm kiếm</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm kiếm mã báo cáo, công nhân..." /></label>
                <label className="pending-date-filter" style={{ gridArea: "date", display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}><span>Ngày báo cáo</span><input type="date" value={date} onChange={e => { setDate(e.target.value); setRange(null); }} /></label>
                <div className="pending-quick-filters" style={{ gridArea: "quick", minWidth: 0 }}>
                    {(["Hôm nay", "Tuần này", "Tháng này", "Năm này"] as const).map(label => {
                        const type = label === "Hôm nay" ? "day" : label === "Tuần này" ? "week" : label === "Tháng này" ? "month" : "year";
                        const active = type === "day" ? !range : Boolean(range && range.dateFrom === rangeFor(date, type).dateFrom && range.dateTo === rangeFor(date, type).dateTo);
                        return <button key={label} type="button" className={active ? "active" : ""} onClick={() => quick(type)}>{label}</button>;
                    })}
                </div>
                <label className="pending-process-filter" style={{ gridArea: "process", display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}><span>Công đoạn</span><select value={process} onChange={e => setProcess(e.target.value)}><option value="">Tất cả</option>{processes.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
                <label className="pending-shift-filter" style={{ gridArea: "shift", display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}><span>Ca làm việc</span><select value={shift} onChange={e => setShift(e.target.value)}><option value="">Tất cả</option>{shifts.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
            </div>

            <div className={`pending-workspace ${detail ? "" : "list-only"}`} style={{ marginTop: 12 }}>
                <section className="pending-list-card">
                    <div className="pending-list-tabs">
                        <button type="button" className="pending-list-tab active">Danh sách chờ duyệt <span className="tab-badge" style={{ background: "#fff0d8", color: "#a56a00" }}>{total}</span></button>
                    </div>
                    <div className="pending-bulk-toolbar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, padding: "12px 16px", minHeight: 64, boxSizing: "border-box", background: "#f8fbff", borderBottom: "1px solid #e2eaf3" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 190, color: "#526b88", fontSize: 13 }}>
                            <span style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 9, background: selectedIds.length ? "#e2efff" : "#edf2f7", color: selectedIds.length ? "#1769aa" : "#64748b", fontWeight: 800, fontSize: 14 }}>{selectedIds.length}</span>
                            <span><strong style={{ color: "#244564" }}>{selectedIds.length} báo cáo</strong> được chọn</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", gap: 10, marginLeft: "auto" }}>
                            <button type="button" onClick={() => openRejectDialog(selectedIds)} disabled={selectedIds.length === 0 || rejecting || loading} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 40, border: "1px solid", borderColor: selectedIds.length ? "#e5a4a4" : "#e2e8f0", borderRadius: 9, padding: "0 16px", background: selectedIds.length ? "#fff" : "#f1f5f9", color: selectedIds.length ? "#b42323" : "#94a3b8", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", cursor: selectedIds.length && !rejecting && !loading ? "pointer" : "not-allowed", transition: "background .15s ease, border-color .15s ease" }}>{rejecting ? "Đang từ chối..." : `✕ Từ chối ${selectedIds.length}`}</button>
                            <button type="button" onClick={() => void approveBulk()} disabled={selectedIds.length === 0 || bulkApproving || loading} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 40, border: "1px solid", borderColor: selectedIds.length ? "#1769aa" : "#cbd5e1", borderRadius: 9, padding: "0 18px", background: selectedIds.length ? "linear-gradient(135deg, #1976c9, #145da0)" : "#cbd5e1", color: "#fff", fontSize: 13, fontWeight: 750, whiteSpace: "nowrap", cursor: selectedIds.length && !bulkApproving && !loading ? "pointer" : "not-allowed", boxShadow: selectedIds.length ? "0 3px 8px rgba(23,105,170,.18)" : "none", transition: "background .15s ease, box-shadow .15s ease" }}>{bulkApproving ? "Đang duyệt..." : `✓ Duyệt ${selectedIds.length}`}</button>
                        </div>
                    </div>
                    <div className="pending-table-wrap" style={{ overflowX: "auto" }}>
                        <table className="pending-reference-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead><tr><th className="select-col"><input type="checkbox" aria-label="Chọn tất cả báo cáo trên trang này" checked={allVisibleSelected} onChange={toggleVisibleSelection} disabled={loading || reports.length === 0} /></th><th className="view-col">Xem</th><th>Mã báo cáo</th><th>Công nhân</th><th>Công đoạn</th><th>Ca</th><th>Ngày báo cáo</th><th>Thời gian</th><th>% HV</th><th>TT OK</th><th>NG</th><th>% năng suất</th><th>% đạt</th><th>% PP</th><th>Trạng thái</th></tr></thead>
                            <tbody>
                                {loading ? <tr><td colSpan={15} className="management-empty" style={{ padding: 48, textAlign: "center" }}>Đang tải báo cáo...</td></tr> : error ? <tr><td colSpan={15} className="management-error" style={{ padding: 48, textAlign: "center", color: "#c24141" }}>{error}</td></tr> : reports.length === 0 ? <tr><td colSpan={15} className="management-empty" style={{ padding: 48, textAlign: "center" }}>Không có báo cáo chờ duyệt.</td></tr> : reports.map((r, i) => {
                                    const x = kpi(r);
                                    const code = `PR${String(r.work_date || "REPORT").slice(0, 10).replace(/-/g, "")}-${r.worker_code || String(r.id || i + 1).padStart(4, "0")}`;
                                    return <tr key={r.id ?? i} className={detail?.id === r.id ? "pending-row-active" : ""} onClick={() => void openDetail(r)} style={{ cursor: "pointer" }}>
                                        <td className="select-col"><input type="checkbox" aria-label={`Chọn báo cáo ${r.id}`} checked={selectedIds.includes(Number(r.id))} onChange={() => toggleSelected(Number(r.id))} onClick={e => e.stopPropagation()} /></td><td className="view-col" style={{ textAlign: "center" }}><button type="button" className="pending-detail-edit" aria-label={`Xem báo cáo ${r.id}`} onClick={e => { e.stopPropagation(); void openDetail(r); }}>⌕</button></td>
                                        <td>{code}</td><td>{text(r.full_name || r.worker_name)} <span style={{ color: "#7185a4" }}>({text(r.worker_code)})</span></td><td>{processLabel(r)}</td><td><span className="shift-chip">{text(r.shift)}</span></td><td>{dateText(r.work_date)}</td><td>{fmt(r.actual_time || r.total_time)} giờ</td><td>{pct(x.hv)}</td><td>{fmt(x.ok)}</td><td>{fmt(x.ng)}</td>
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
                {detail && <aside className="pending-detail-card pending-detail-card-compact">
                    <div className="pending-detail-head">
                        <div className="pending-detail-title"><h2>Chi tiết báo cáo</h2><span className="pending-detail-status" style={{ background: "#fff0d8", color: "#a56a00" }}>Chờ duyệt</span><span className="pending-detail-code">#{detail.id}</span></div>
                        <button type="button" className="pending-detail-close" onClick={() => setDetail(null)} aria-label="Đóng">×</button>
                    </div>
                    {detailLoading ? <div className="pending-detail-loading">Đang tải chi tiết...</div> : detailKpi && <div className="pending-detail-body">
                        <section className="pending-detail-section"><h3>Thông tin chung</h3><div className="pending-detail-grid">
                            {[
                                ["Công nhân", `${text(detail.full_name || detail.worker_name)} (${text(detail.worker_code)})`],
                                ["Ngày báo cáo", dateText(detail.work_date)],
                                ["Công đoạn", processLabel(detail)],
                                ["Ca làm việc", text(detail.shift)],
                                ["Máy móc", text(detail.machine_no)],
                                ["Sản phẩm", text(detail.product_name)],
                                ["Thời gian", `${fmt(detail.actual_time || detail.total_time)} giờ`],
                                ["Học việc", pct(detailKpi.hv)]
                            ].map(([label, value]) => <div className="pending-detail-field" key={String(label)}><span>{label}</span><strong>{String(value)}</strong></div>)}
                        </div></section>
                        <section className="pending-detail-section"><h3>Kết quả sản xuất</h3><div className="pending-result-grid">
                            <div className="pending-result-item"><span>Sản lượng OK</span><strong>{fmt(detailKpi.ok)}</strong></div>
                            <div className="pending-result-item ng"><span>Sản lượng NG</span><strong>{fmt(detailKpi.ng)}</strong></div>
                            <div className="pending-result-item total"><span>Tổng sản lượng</span><strong>{fmt(detailKpi.actual)}</strong></div>
                            <div className="pending-result-item rate"><span>% đạt</span><strong>{pct(detailKpi.dat)}</strong></div>
                        </div></section>
                        <section className="pending-detail-section"><h3>Chỉ số KPI</h3><div className="pending-detail-info-grid">
                            <div className="pending-detail-field"><span>TT định mức</span><strong>{fmt(detailKpi.ttDinhMuc)}</strong></div>
                            <div className="pending-detail-field" style={metricStyle("productivity", detailKpi.nangSuat, detailKpi.ngTypeCount)}><span>% năng suất</span><strong>{pct(detailKpi.nangSuat)}</strong></div>
                            <div className="pending-detail-field"><span>% đạt</span><strong>{pct(detailKpi.dat)}</strong></div>
                            <div className="pending-detail-field" style={metricStyle("pp", detailKpi.pp, detailKpi.ngTypeCount)}><span>% PP (NG)</span><strong>{pct(detailKpi.pp)}{detailKpi.pp === 0 || detailKpi.ngTypeCount === 1 ? " ⚠" : ""}</strong></div>
                        </div></section>
                        <section className="pending-detail-section"><h3>Chi tiết thời gian trừ</h3>{detailDeductions.length ? <div className="pending-defect-list">{detailDeductions.map((x: any, i: number) => <span className="pending-defect" key={i}>{text(x.deduction_name, x.deduction_code)}: {fmt(num(x.hours) * 60)} phút</span>)}</div> : <div className="pending-history-empty">Không có thời gian trừ.</div>}</section>
                        <section className="pending-detail-section"><h3>Chi tiết lỗi NG</h3>{detailDefects.length ? <div className="pending-defect-list">{detailDefects.map((x: any, i: number) => <span className="pending-defect" key={i}>{text(x.defect_name, x.defect_code)}: {fmt(x.quantity)} sản phẩm</span>)}</div> : detailKpi.ng > 0 ? <div className="pending-history-empty" style={{ background: "#fff8e1", border: "1px solid #f0c36d", color: "#7a5b00" }}>NG {fmt(detailKpi.ng)} sản phẩm — chưa phân loại lỗi.</div> : <div className="pending-history-empty">Không có lỗi NG.</div>}</section>
                        <section className="pending-detail-section"><h3>Ghi chú</h3><div className="pending-detail-field"><span>Ghi chú</span><strong>{text(detail.note || (detail as any).notes, "Không có ghi chú")}</strong></div></section>
                    </div>}
                    <div className="pending-detail-actions pending-detail-actions-compact">
                        <button type="button" className="pending-detail-cancel" onClick={() => setDetail(null)}>Đóng</button>
                        <button type="button" onClick={() => openRejectDialog([Number(detail.id)])} disabled={rejecting || detailLoading} style={{ border: "1px solid #dc5656", background: "#fff1f1", color: "#b42323", borderRadius: 8, padding: "9px 14px", fontWeight: 700, cursor: rejecting || detailLoading ? "not-allowed" : "pointer" }}>{rejecting ? "Đang từ chối..." : "Từ chối báo cáo"}</button>
                        <button type="button" className="pending-detail-approve" onClick={() => void approveDetail()} disabled={approving || detailLoading || rejecting}>{approving ? "Đang duyệt..." : "Duyệt báo cáo"}</button>
                    </div>
                </aside>}
            </div>
        {rejectDialogOpen && <div role="presentation" onClick={e => { if (e.target === e.currentTarget && !rejecting) setRejectDialogOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,35,60,.42)", display: "grid", placeItems: "center", padding: 16 }}>
            <section role="dialog" aria-modal="true" aria-labelledby="reject-dialog-title" style={{ width: "min(100%, 480px)", background: "#fff", borderRadius: 14, boxShadow: "0 20px 60px rgba(15,35,60,.25)", padding: 22 }}>
                <h2 id="reject-dialog-title" style={{ margin: "0 0 6px", color: "#12385f", fontSize: 20 }}>Từ chối báo cáo</h2>
                <p style={{ margin: "0 0 16px", color: "#526b88", fontSize: 13 }}>Đang chọn <strong>{rejectTargetIds.length}</strong> báo cáo. Chọn lý do trước khi xác nhận.</p>
                <label style={{ display: "block", fontSize: 13, color: "#244564", marginBottom: 6, fontWeight: 700 }}>Lý do từ chối <span style={{ color: "#b42323" }}>*</span></label>
                <select value={rejectReason} onChange={e => setRejectReason(e.target.value)} disabled={rejecting} style={{ width: "100%", minHeight: 40, border: "1px solid #cbd9e8", borderRadius: 8, padding: "8px 10px", background: "#fff", color: "#244564" }}>
                    <option value="">-- Chọn lý do --</option>
                    <option value="Thiếu công đoạn hoặc sản phẩm để tra định mức">Thiếu công đoạn hoặc sản phẩm để tra định mức</option>
                    <option value="Sai công đoạn hoặc sản phẩm">Sai công đoạn hoặc sản phẩm</option>
                    <option value="Sai số lượng OK/NG">Sai số lượng OK/NG</option>
                    <option value="Thiếu thông tin báo cáo">Thiếu thông tin báo cáo</option>
                    <option value="Sai ngày báo cáo hoặc ca làm việc">Sai ngày báo cáo hoặc ca làm việc</option>
                    <option value="Báo cáo bị trùng">Báo cáo bị trùng</option>
                    <option value="Khác">Khác</option>
                </select>
                {rejectReason === "Khác" && <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="Nhập lý do từ chối cụ thể..." rows={3} disabled={rejecting} style={{ width: "100%", boxSizing: "border-box", marginTop: 10, border: "1px solid #cbd9e8", borderRadius: 8, padding: 10, resize: "vertical" }} />}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
                    <button type="button" onClick={() => setRejectDialogOpen(false)} disabled={rejecting} style={{ border: "1px solid #cbd9e8", borderRadius: 8, padding: "9px 14px", background: "#fff", color: "#526b88" }}>Hủy</button>
                    <button type="button" onClick={() => void rejectTargets()} disabled={rejecting || !rejectReason || (rejectReason === "Khác" && !rejectNote.trim())} style={{ border: 0, borderRadius: 8, padding: "9px 14px", background: rejecting || !rejectReason || (rejectReason === "Khác" && !rejectNote.trim()) ? "#cbd5e1" : "#b42323", color: "#fff", fontWeight: 700 }}>{rejecting ? "Đang từ chối..." : `Xác nhận từ chối ${rejectTargetIds.length} báo cáo`}</button>
                </div>
            </section>
        </div>}
        </div>
    );
}
