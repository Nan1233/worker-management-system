import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { getApprovedReports, getReportById, updateReport } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import { useToast } from "../../components/feedback/toastContext";
import { usePermissions } from "../../hooks/usePermissions";
import { getToday } from "./managerReportDateLogic";
import "./Reports.css";
import "./ReportsSplitReference.css";

const text = (value: unknown, fallback = "---") => value === null || value === undefined || value === "" ? fallback : String(value);
const num = (value: unknown) => Number(value || 0);
const number = (value: unknown) => num(value).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const formatDate = (value?: string | null) => { if (!value) return "---"; const [y, m, d] = String(value).slice(0, 10).split("-"); return y && m && d ? `${d}/${m}/${y}` : String(value); };
const reportCode = (r: ProductionReport, index = 0) => `PR${String(r.work_date || "REPORT").slice(0, 10).replace(/-/g, "")}-${r.worker_code || String(r.id || index + 1).padStart(4, "0")}`;
const timeRange = (r: ProductionReport) => { const e = r.extra_data || {}; return e.start_time && e.end_time ? `${e.start_time} - ${e.end_time}` : ""; };
const dateOf = (v: string) => new Date(`${v}T00:00:00`);
const dateString = (v: Date) => `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
const rangeFor = (value: string, type: "year" | "month" | "week") => {
    const start = dateOf(value); const end = new Date(start);
    if (type === "year") { start.setMonth(0, 1); end.setMonth(11, 31); }
    else if (type === "month") { start.setDate(1); end.setMonth(end.getMonth() + 1, 0); }
    else { const offset = (start.getDay() + 6) % 7; start.setDate(start.getDate() - offset); end.setTime(start.getTime()); end.setDate(start.getDate() + 6); }
    return { dateFrom: dateString(start), dateTo: dateString(end) };
};

const cellStyle: React.CSSProperties = { padding: "8px 10px", borderRight: "1px solid #e3e9f2", borderBottom: "1px solid #e3e9f2", whiteSpace: "nowrap", verticalAlign: "middle", fontSize: 13 };
const inputStyle: React.CSSProperties = { width: "100%", minWidth: 72, boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 4, padding: "5px 6px", fontSize: 13, background: "#fff", outline: "none" };
const readonlyStyle: React.CSSProperties = { ...cellStyle, background: "#fff" };

export default function ApprovedReports() {
    const navigate = useNavigate();
    const { can } = usePermissions();
    const canEdit = can("REPORT_APPROVED_EDIT");
    const { showToast } = useToast();
    const [date, setDate] = useState(getToday());
    const [dateRange, setDateRange] = useState<{ dateFrom: string; dateTo: string } | null>(null);
    const [search, setSearch] = useState("");
    const [process, setProcess] = useState("");
    const [shift, setShift] = useState("");
    const [reports, setReports] = useState<ProductionReport[]>([]);
    const [drafts, setDrafts] = useState<Record<number, ProductionReport>>({});
    const [savingId, setSavingId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [pages, setPages] = useState(1);
    const [selectedDetail, setSelectedDetail] = useState<ProductionReport | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [counts, setCounts] = useState({ day: 0, week: 0, month: 0, year: 0 });

    const loadReports = useCallback(async () => {
        try {
            setLoading(true); setError("");
            const range = dateRange || { dateFrom: date, dateTo: date };
            const filters = { ...range, processName: process || undefined, shift: shift || undefined, search: search.trim() || undefined, page, pageSize: 20 };
            const result = await getApprovedReports(filters);
            setReports(result.data || []); setTotal(result.pagination.total); setPages(result.pagination.total_pages);
            const ranges = { day: { dateFrom: date, dateTo: date }, week: rangeFor(date, "week"), month: rangeFor(date, "month"), year: rangeFor(date, "year") };
            const [day, week, month, year] = await Promise.all(Object.values(ranges).map(r => getApprovedReports({ ...r, processName: process || undefined, shift: shift || undefined, search: search.trim() || undefined, page: 1, pageSize: 1 })));
            setCounts({ day: day.pagination.total, week: week.pagination.total, month: month.pagination.total, year: year.pagination.total });
        } catch (err: unknown) {
            setError(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể tải báo cáo đã duyệt" : "Không thể tải báo cáo đã duyệt");
            setReports([]); setTotal(0); setPages(1); setCounts({ day: 0, week: 0, month: 0, year: 0 });
        } finally { setLoading(false); }
    }, [date, dateRange, process, shift, search, page]);

    useEffect(() => { void loadReports(); }, [loadReports]);
    useEffect(() => { setPage(1); setSelectedDetail(null); setDrafts({}); }, [date, dateRange, process, shift, search]);

    const processes = useMemo(() => Array.from(new Set(reports.map(r => r.process_name).filter(Boolean) as string[])).sort(), [reports]);
    const shifts = useMemo(() => Array.from(new Set(reports.map(r => r.shift).filter(Boolean))).sort(), [reports]);

    const beginEdit = (report: ProductionReport) => {
        if (!canEdit || !report.id) return;
        setDrafts(current => ({ ...current, [Number(report.id)]: { ...report } }));
    };
    const updateDraft = (id: number, field: keyof ProductionReport, value: string | number) => {
        setDrafts(current => ({ ...current, [id]: { ...current[id], [field]: value } }));
    };
    const saveRow = async (id: number) => {
        const draft = drafts[id];
        const original = reports.find(r => Number(r.id) === id);
        if (!draft || !original || savingId) return;
        try {
            setSavingId(id);
            const actual = Math.max(0, num(draft.actual_time));
            const deduction = Math.max(0, num(draft.deduction_time));
            const ok = Math.max(0, num(draft.tt_ok));
            const ng = Math.max(0, num(draft.tt_ng));
            const next: ProductionReport = { ...draft, actual_time: actual, deduction_time: deduction, total_time: actual + deduction, tt_ok: ok, tt_ng: ng, actual_output: ok + ng };
            const result = await updateReport(id, next, "approved", original.updated_at || null);
            const updated = (result?.data || result?.report || result) as ProductionReport;
            const merged = { ...next, ...(updated && typeof updated === "object" ? updated : {}) } as ProductionReport;
            setReports(current => current.map(r => Number(r.id) === id ? merged : r));
            setDrafts(current => { const copy = { ...current }; delete copy[id]; return copy; });
            showToast("Đã lưu báo cáo", "success");
        } catch (err: unknown) {
            showToast(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể lưu báo cáo" : "Không thể lưu báo cáo");
        } finally { setSavingId(null); }
    };
    const cancelRow = (id: number) => setDrafts(current => { const copy = { ...current }; delete copy[id]; return copy; });

    const openDetail = async (report: ProductionReport) => {
        if (!report.id) return;
        setSelectedDetail(report); setDetailLoading(true);
        try { setSelectedDetail(await getReportById(Number(report.id), "approved")); }
        catch (err: unknown) { showToast(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể tải chi tiết báo cáo" : "Không thể tải chi tiết báo cáo"); }
        finally { setDetailLoading(false); }
    };

    const renderEditableNumber = (draft: ProductionReport, field: keyof ProductionReport, width = 82) => (
        <input type="number" min="0" step="0.01" value={String(draft[field] ?? 0)} onChange={e => updateDraft(Number(draft.id), field, Number(e.target.value))} style={{ ...inputStyle, width }} />
    );

    return (
        <div className="management-report-page manager-page" style={{ minWidth: 0 }}>
            <header className="pending-page-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <div><h1>Quản lý báo cáo đã duyệt</h1><p>Bảng dữ liệu dạng Excel · cuộn ngang để xem đầy đủ cột · Tab để chuyển ô · sửa trực tiếp rồi lưu.</p></div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button type="button" className="pending-detail-edit" onClick={() => navigate("/manager/reports")} title="Mở danh sách báo cáo chờ duyệt để tiếp nhận báo cáo mới">＋ Thêm báo cáo</button>
                    <button type="button" className="pending-detail-cancel" onClick={() => void loadReports()}>↻ Làm mới</button>
                </div>
            </header>

            <section className="pending-filter-card">
                <div className="pending-search"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm mã CN, họ tên, máy, sản phẩm..." /></div>
                <label><span>Ngày</span><input type="date" value={date} onChange={e => { setDate(e.target.value); setDateRange(null); }} /></label>
                <label><span>Công đoạn</span><select value={process} onChange={e => setProcess(e.target.value)}><option value="">Tất cả</option>{processes.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
                <label><span>Ca</span><select value={shift} onChange={e => setShift(e.target.value)}><option value="">Tất cả</option>{shifts.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
                <div className="pending-quick-filters"><span>Chọn nhanh</span><button type="button" className={!dateRange ? "active" : ""} onClick={() => setDateRange(null)}>Hôm nay</button><button type="button" onClick={() => setDateRange(rangeFor(date, "week"))}>Tuần này</button><button type="button" onClick={() => setDateRange(rangeFor(date, "month"))}>Tháng này</button><button type="button" onClick={() => setDateRange(rangeFor(date, "year"))}>Năm này</button></div>
            </section>

            <section className="pending-kpis">
                <div className="pending-kpi kpi-orange"><span>Trong ngày</span><strong>{counts.day}</strong><small>Báo cáo đã duyệt</small></div>
                <div className="pending-kpi kpi-slate"><span>Trong tuần</span><strong>{counts.week}</strong><small>Báo cáo đã duyệt</small></div>
                <div className="pending-kpi kpi-green"><span>Trong tháng</span><strong>{counts.month}</strong><small>Báo cáo đã duyệt</small></div>
                <div className="pending-kpi kpi-blue"><span>Trong năm</span><strong>{counts.year}</strong><small>Báo cáo đã duyệt</small></div>
            </section>

            {error && <div className="management-error">{error}</div>}

            <section className="pending-list-card" style={{ width: "100%", overflow: "hidden" }}>
                <div className="pending-list-tabs" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button className="pending-list-tab active" type="button">Danh sách báo cáo ({total})</button>
                    <span style={{ fontSize: 12, color: "#7185a4" }}>{canEdit ? "Chế độ sửa: nhấp đúp ô hoặc nút Sửa · Tab chuyển ô · Lưu để ghi dữ liệu" : "Chỉ xem"}</span>
                </div>
                <div className="pending-table-wrap" style={{ overflow: "auto", maxWidth: "100%", maxHeight: "calc(100vh - 390px)", border: "1px solid #dbe3ee", background: "#fff" }}>
                    <table className="management-report-table" style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: 2050, width: "max-content" }}>
                        <thead style={{ position: "sticky", top: 0, zIndex: 4 }}>
                            <tr style={{ background: "#eef4fb" }}>
                                <th style={{ ...cellStyle, position: "sticky", left: 0, zIndex: 5, background: "#eef4fb" }}>STT</th>
                                <th style={cellStyle}>Ngày</th><th style={cellStyle}>Mã CN</th><th style={cellStyle}>Họ tên</th><th style={cellStyle}>Ca</th><th style={cellStyle}>Máy</th><th style={cellStyle}>Sản phẩm</th><th style={cellStyle}>% HV</th><th style={cellStyle}>TT giờ</th><th style={cellStyle}>Trừ giờ</th><th style={cellStyle}>Tổng giờ</th><th style={cellStyle}>Định mức/h</th><th style={cellStyle}>TT định mức</th><th style={cellStyle}>TT OK</th><th style={cellStyle}>NG</th><th style={cellStyle}>% năng suất</th><th style={cellStyle}>% đạt</th><th style={cellStyle}>% PP</th><th style={{ ...cellStyle, minWidth: 220 }}>Ghi chú</th><th style={cellStyle}>Trạng thái</th><th style={{ ...cellStyle, position: "sticky", right: 0, zIndex: 5, background: "#eef4fb" }}>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? <tr><td colSpan={21} style={{ ...cellStyle, textAlign: "center", padding: 28 }}>Đang tải dữ liệu...</td></tr> : reports.length === 0 ? <tr><td colSpan={21} style={{ ...cellStyle, textAlign: "center", padding: 28 }}>Không có báo cáo đã duyệt trong khoảng thời gian đã chọn.</td></tr> : reports.map((report, index) => {
                                const id = Number(report.id); const draft = drafts[id]; const row = draft || report; const isEditing = Boolean(draft); const ok = num(row.tt_ok); const ng = num(row.tt_ng); const output = Math.max(0, num(row.actual_output) || ok + ng); const target = Math.max(0, num(row.target_output) || num(row.standard_output) * num(row.actual_time)); const productivity = target > 0 ? output / target * 100 : num((row as any).efficiency_percent); const achieved = output > 0 ? ok / output * 100 : 0; const pp = num((row as any).pp_percent ?? (row as any).ppg_percent);
                                return (
                                    <tr key={id || index} onDoubleClick={() => beginEdit(report)} style={{ background: index % 2 ? "#fbfdff" : "#fff" }}>
                                        <td style={{ ...cellStyle, position: "sticky", left: 0, zIndex: 2, background: index % 2 ? "#fbfdff" : "#fff", textAlign: "center", fontWeight: 600 }}>{(page - 1) * 20 + index + 1}</td>
                                        <td style={readonlyStyle}>{isEditing ? <input type="date" value={String(row.work_date || "").slice(0,10)} onChange={e => updateDraft(id, "work_date", e.target.value)} style={inputStyle} /> : formatDate(row.work_date)}</td>
                                        <td style={{ ...readonlyStyle, fontWeight: 600 }}>{report.worker_code || "---"}</td>
                                        <td style={readonlyStyle}>{text(report.full_name)}</td>
                                        <td style={readonlyStyle}>{text(row.shift)}</td>
                                        <td style={readonlyStyle}>{isEditing ? <input value={text(row.machine_no, "")} onChange={e => updateDraft(id, "machine_no", e.target.value)} style={{ ...inputStyle, width: 90 }} /> : text(row.machine_no)}</td>
                                        <td style={{ ...readonlyStyle, minWidth: 150 }}>{isEditing ? <input value={text(row.product_name, "")} onChange={e => updateDraft(id, "product_name", e.target.value)} style={{ ...inputStyle, width: 145 }} /> : text(row.product_name)}</td>
                                        <td style={readonlyStyle}>{number(row.training_percent)}%</td>
                                        <td style={readonlyStyle}>{isEditing ? renderEditableNumber(row, "actual_time", 70) : number(row.actual_time)}</td>
                                        <td style={readonlyStyle}>{isEditing ? renderEditableNumber(row, "deduction_time", 70) : number(row.deduction_time)}</td>
                                        <td style={{ ...readonlyStyle, fontWeight: 600 }}>{number(num(row.actual_time) + num(row.deduction_time))}</td>
                                        <td style={readonlyStyle}>{number(row.standard_output)}</td>
                                        <td style={readonlyStyle}>{number(target)}</td>
                                        <td style={readonlyStyle}>{isEditing ? renderEditableNumber(row, "tt_ok", 76) : number(ok)}</td>
                                        <td style={readonlyStyle}>{isEditing ? renderEditableNumber(row, "tt_ng", 76) : number(ng)}</td>
                                        <td style={{ ...readonlyStyle, fontWeight: 600 }}>{number(productivity)}%</td>
                                        <td style={{ ...readonlyStyle, fontWeight: 600 }}>{number(achieved)}%</td>
                                        <td style={readonlyStyle}>{pp ? `${number(pp)}%` : "---"}</td>
                                        <td style={{ ...readonlyStyle, minWidth: 220 }}>{isEditing ? <input value={text(row.note, "")} onChange={e => updateDraft(id, "note", e.target.value)} style={{ ...inputStyle, minWidth: 210 }} /> : text(row.note, "")}</td>
                                        <td style={readonlyStyle}><span className="pending-detail-status">Đã duyệt</span></td>
                                        <td style={{ ...cellStyle, position: "sticky", right: 0, zIndex: 2, background: index % 2 ? "#fbfdff" : "#fff" }} onClick={e => e.stopPropagation()}>
                                            {isEditing ? <div style={{ display: "flex", gap: 5 }}><button type="button" className="pending-detail-save" disabled={savingId === id} onClick={() => void saveRow(id)}>{savingId === id ? "Lưu..." : "Lưu"}</button><button type="button" className="pending-detail-cancel" disabled={savingId === id} onClick={() => cancelRow(id)}>Hủy</button></div> : <div style={{ display: "flex", gap: 5 }}><button type="button" className="pending-detail-edit" onClick={() => beginEdit(report)}>Sửa</button><button type="button" className="pending-detail-cancel" onClick={() => void openDetail(report)}>Xem</button></div>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="pending-table-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>Hiển thị {reports.length ? (page - 1) * 20 + 1 : 0} đến {(page - 1) * 20 + reports.length} của {total} báo cáo</span>
                    <div className="management-pagination" style={{ margin: 0 }}><button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹</button><button className="active" disabled>{page} / {pages}</button><button disabled={page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))}>›</button></div>
                </div>
            </section>

            {selectedDetail && <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.35)", zIndex: 50, display: "flex", justifyContent: "flex-end" }} onClick={() => setSelectedDetail(null)}>
                <aside style={{ width: "min(560px, 92vw)", height: "100%", background: "#fff", overflow: "auto", padding: 24, boxShadow: "-10px 0 30px rgba(15,23,42,.15)" }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}><div><h2 style={{ margin: 0 }}>Chi tiết báo cáo</h2><span style={{ color: "#1769d2", fontSize: 13 }}>{reportCode(selectedDetail)}</span></div><button type="button" onClick={() => setSelectedDetail(null)} style={{ border: 0, background: "transparent", fontSize: 28, cursor: "pointer" }}>×</button></div>
                    {detailLoading ? <div>Đang tải chi tiết...</div> : <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        {[['Công nhân', `${text(selectedDetail.full_name)} (${text(selectedDetail.worker_code)})`], ['Ngày', formatDate(selectedDetail.work_date)], ['Công đoạn', text(selectedDetail.process_name)], ['Ca', text(selectedDetail.shift)], ['Máy', text(selectedDetail.machine_no)], ['Sản phẩm', text(selectedDetail.product_name)], ['TT giờ', `${number(selectedDetail.actual_time)}h`], ['Trừ giờ', `${number(selectedDetail.deduction_time)}h`], ['Tổng giờ', `${number(selectedDetail.total_time)}h`], ['Định mức/h', number(selectedDetail.standard_output)], ['TT OK', number(selectedDetail.tt_ok)], ['NG', number(selectedDetail.tt_ng)], ['Tổng sản lượng', number(selectedDetail.actual_output)], ['% HV', `${number(selectedDetail.training_percent)}%`]].map(([label, value]) => <div key={label} style={{ padding: 12, background: "#f7f9fc", borderRadius: 8 }}><div style={{ color: "#7185a4", fontSize: 12 }}>{label}</div><strong>{value}</strong></div>)}
                        <div style={{ gridColumn: "1 / -1", padding: 12, background: "#f7f9fc", borderRadius: 8 }}><div style={{ color: "#7185a4", fontSize: 12 }}>Ghi chú</div><strong>{text(selectedDetail.note, "Không có")}</strong></div>
                    </div>}
                </aside>
            </div>}
        </div>
    );
}
