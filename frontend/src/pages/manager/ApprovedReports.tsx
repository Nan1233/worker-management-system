import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { getApprovedReports, getReportById, updateReport } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import { useToast } from "../../components/feedback/toastContext";
import { usePermissions } from "../../hooks/usePermissions";
import { getToday } from "./managerReportDateLogic";
import { getValidReportIds, reconcileSelectedReportIds, toggleCurrentPageIds, toggleReportId } from "./managerReportSelection";
import "./Reports.css";
import "./ReportsSplitReference.css";

const formatDate = (value?: string | null) => {
    if (!value) return "---";
    const [y, m, d] = String(value).slice(0, 10).split("-");
    return y && m && d ? `${d}/${m}/${y}` : String(value);
};
const text = (value: unknown, fallback = "---") => value === null || value === undefined || value === "" ? fallback : String(value);
const number = (value: unknown) => Number(value || 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const timeRange = (report: ProductionReport) => {
    const extra = report.extra_data || {};
    const start = extra.start_time;
    const end = extra.end_time;
    return start && end ? `${start} - ${end}` : "07:30 - 15:30";
};

export default function ApprovedReports() {
    const { can } = usePermissions();
    const canEdit = can("REPORT_APPROVED_EDIT");
    const { showToast } = useToast();
    const [date, setDate] = useState(getToday());
    const [searchKeyword, setSearchKeyword] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedProcess, setSelectedProcess] = useState("");
    const [selectedShift, setSelectedShift] = useState("");
    const [reports, setReports] = useState<ProductionReport[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [selectedDetail, setSelectedDetail] = useState<ProductionReport | null>(null);
    const [editDraft, setEditDraft] = useState<ProductionReport | null>(null);
    const [editHours, setEditHours] = useState("");
    const [editMinutes, setEditMinutes] = useState("");
    const [editing, setEditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [pages, setPages] = useState(1);
    const seq = useRef(0);
    const [reload, setReload] = useState(0);

    useEffect(() => {
        const timer = window.setTimeout(() => setSearchQuery(searchKeyword.trim()), 250);
        return () => window.clearTimeout(timer);
    }, [searchKeyword]);

    const loadReports = useCallback(async () => {
        const current = ++seq.current;
        try {
            setLoading(true);
            setError("");
            const result = await getApprovedReports({ dateFrom: date || undefined, dateTo: date || undefined, processName: selectedProcess || undefined, shift: selectedShift || undefined, search: searchQuery || undefined, page, pageSize: 8 });
            if (current !== seq.current) return;
            setReports(result.data);
            setTotal(result.pagination.total);
            setPages(result.pagination.total_pages);
            setSelectedIds(previous => reconcileSelectedReportIds(previous, result.data));
        } catch (err: unknown) {
            if (current !== seq.current) return;
            setError(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể tải báo cáo đã duyệt" : "Không thể tải báo cáo đã duyệt");
            setReports([]); setTotal(0); setPages(1); setSelectedIds([]);
        } finally {
            if (current === seq.current) setLoading(false);
        }
    }, [date, selectedProcess, selectedShift, searchQuery, page]);

    useEffect(() => { void loadReports(); }, [loadReports, reload]);
    useEffect(() => { setPage(1); setSelectedIds([]); setSelectedDetail(null); setEditing(false); }, [date, selectedProcess, selectedShift, searchQuery]);

    const processes = useMemo(() => Array.from(new Set(reports.map(r => r.process_name).filter(Boolean) as string[])).sort(), [reports]);
    const shifts = useMemo(() => Array.from(new Set(reports.map(r => r.shift).filter(Boolean))).sort(), [reports]);
    const ids = useMemo(() => getValidReportIds(reports), [reports]);
    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const allSelected = ids.length > 0 && ids.every(id => selectedSet.has(id));

    const openDetail = async (report: ProductionReport) => {
        if (!report.id) return;
        setSelectedDetail(report); setEditDraft(null); setEditing(false); setDetailLoading(true);
        try {
            const detail = await getReportById(Number(report.id), "approved");
            setSelectedDetail(detail);
        } catch (err) {
            showToast(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể tải chi tiết báo cáo" : "Không thể tải chi tiết báo cáo");
        } finally { setDetailLoading(false); }
    };

    const startEdit = () => {
        if (!selectedDetail || !canEdit) return;
        const actual = Math.max(0, Number(selectedDetail.actual_time) || 0);
        const h = Math.floor(actual);
        const m = Math.min(59, Math.round((actual - h) * 60));
        setEditDraft({ ...selectedDetail }); setEditHours(String(h)); setEditMinutes(String(m)); setEditing(true);
    };
    const cancelEdit = () => { setEditDraft(null); setEditing(false); };
    const updateField = (field: keyof ProductionReport, value: string | number) => setEditDraft(current => current ? { ...current, [field]: value } : current);

    const saveEdit = async () => {
        if (!editDraft?.id || saving) return;
        const hours = Math.max(0, Number(editHours) || 0);
        const minutes = Math.min(59, Math.max(0, Number(editMinutes) || 0));
        const actual = hours + minutes / 60;
        const next: ProductionReport = { ...editDraft, actual_time: actual, total_time: actual + (Number(editDraft.deduction_time) || 0), tt_ok: Math.max(0, Number(editDraft.tt_ok) || 0), tt_ng: Math.max(0, Number(editDraft.tt_ng) || 0), actual_output: Math.max(0, Number(editDraft.tt_ok) || 0) + Math.max(0, Number(editDraft.tt_ng) || 0) };
        try {
            setSaving(true);
            const result = await updateReport(Number(next.id), next, "approved", selectedDetail?.updated_at || null);
            const updated = (result?.data || result?.report || result) as ProductionReport;
            const merged = { ...next, ...(updated && typeof updated === "object" ? updated : {}) } as ProductionReport;
            setSelectedDetail(merged); setReports(current => current.map(r => Number(r.id) === Number(merged.id) ? { ...r, ...merged } : r));
            setEditDraft(null); setEditing(false); showToast("Đã cập nhật báo cáo", "success");
            await loadReports();
        } catch (err: unknown) {
            showToast(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể cập nhật báo cáo" : "Không thể cập nhật báo cáo");
        } finally { setSaving(false); }
    };

    const toggleAll = () => setSelectedIds(previous => toggleCurrentPageIds(previous, ids, allSelected));
    const toggleOne = (id: number) => setSelectedIds(previous => toggleReportId(previous, id));
    const detail = editing && editDraft ? editDraft : selectedDetail;
    const ok = Number(detail?.tt_ok || 0), ng = Number(detail?.tt_ng || 0), totalOutput = Number(detail?.actual_output || ok + ng), rate = totalOutput > 0 ? ok / totalOutput * 100 : 0;

    return (
        <div className="management-report-page manager-page pending-reference-page">
            <header className="pending-page-title"><div><h1>Đã duyệt báo cáo</h1><p>Xem lại các báo cáo sản xuất đã được duyệt.</p></div></header>

            <section className="pending-filter-card">
                <div className="pending-search"><span>⌕</span><input value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)} placeholder="Tìm kiếm mã báo cáo, công nhân..." /></div>
                <label><span>Ngày báo cáo</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
                <label><span>Công đoạn</span><select value={selectedProcess} onChange={e => setSelectedProcess(e.target.value)}><option value="">Tất cả</option>{processes.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
                <label><span>Ca làm việc</span><select value={selectedShift} onChange={e => setSelectedShift(e.target.value)}><option value="">Tất cả</option>{shifts.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
                <label><span>Trạng thái</span><select value="Đã duyệt" disabled><option>Đã duyệt</option></select></label>
                <button className="pending-refresh" type="button" onClick={() => setReload(v => v + 1)}>⟳ <span>Làm mới</span></button>
            </section>

            <section className="pending-kpis">
                <div className="pending-kpi kpi-blue"><span>Tổng số báo cáo</span><strong>{total}</strong><small>Báo cáo</small></div>
                <div className="pending-kpi kpi-green"><span>Đã duyệt hôm nay</span><strong>{reports.filter(r => String(r.approved_at || "").slice(0,10) === getToday()).length}</strong><small>Báo cáo</small></div>
                <div className="pending-kpi kpi-slate"><span>Đang hiển thị</span><strong>{reports.length}</strong><small>Báo cáo</small></div>
            </section>

            {error && <div className="management-error">{error}</div>}

            <section className={`pending-workspace ${selectedDetail ? "detail-open" : "list-only"}`}>
                <div className="pending-list-card">
                    <div className="pending-list-tabs"><button className="pending-list-tab active" type="button">Danh sách báo cáo ({total})</button></div>
                    {selectedIds.length > 0 && <div className="management-selected-info">Đã chọn {selectedIds.length} báo cáo.<button type="button" onClick={() => setSelectedIds([])}>Bỏ chọn</button></div>}
                    <div className="pending-table-wrap" style={{ overflowX: "auto" }}>
                        <table className="management-report-table pending-reference-table">
                            <thead><tr><th className="management-checkbox-column"><input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = ids.some(id => selectedSet.has(id)) && !allSelected; }} onChange={toggleAll} /></th><th>STT</th><th>Mã báo cáo</th><th>Công nhân</th><th>Công đoạn</th><th>Ca</th><th>Thời gian</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                            <tbody>
                                {loading ? <tr><td colSpan={9}><div className="pending-detail-loading">Đang tải dữ liệu...</div></td></tr> : reports.length === 0 ? <tr><td colSpan={9}><div className="management-empty">Không có báo cáo đã duyệt.</div></td></tr> : reports.map((report, index) => {
                                    const id = Number(report.id); const selected = selectedSet.has(id); const code = `PR${String(report.work_date || "REPORT").slice(0,10).replace(/-/g, "")}-${report.worker_code || String(id || index + 1).padStart(4, "0")}`;
                                    return <tr key={id || index} className={selectedDetail?.id === report.id ? "pending-row-active" : ""}>
                                        <td className="management-checkbox-column"><input type="checkbox" checked={selected} onChange={() => toggleOne(id)} /></td>
                                        <td>{(page - 1) * 8 + index + 1}</td>
                                        <td><strong style={{ color: "#1769d2" }}>{code}</strong></td>
                                        <td><strong>{text(report.full_name, "Công nhân")}</strong><small style={{ display: "block", color: "#7185a4" }}>({text(report.worker_code)})</small></td>
                                        <td>{text(report.process_name)}</td><td><span className="shift-chip">{text(report.shift)}</span></td>
                                        <td><strong>{formatDate(report.work_date)}</strong><small style={{ display: "block", color: "#7185a4" }}>{timeRange(report)}</small></td>
                                        <td><span className="pending-detail-status">Đã duyệt</span></td>
                                        <td><button className="pending-detail-edit" type="button" title="Xem chi tiết" onClick={() => void openDetail(report)}>◉</button></td>
                                    </tr>;
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="pending-table-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>Hiển thị {reports.length ? (page - 1) * 8 + 1 : 0} đến {(page - 1) * 8 + reports.length} của {total} báo cáo</span>
                        <div className="management-pagination" style={{ margin: 0 }}><button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹</button><button className="active" disabled>{page}</button><button disabled={page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))}>›</button></div>
                    </div>
                </div>

                {selectedDetail && <aside className="pending-detail-card">
                    <div className="pending-detail-head"><div className="pending-detail-title"><h2>Chi tiết báo cáo</h2><span className="pending-detail-status">Đã duyệt</span></div><span className="pending-detail-code">Mã báo cáo: {`PR${String(selectedDetail.work_date || "REPORT").slice(0,10).replace(/-/g, "")}-${selectedDetail.worker_code || selectedDetail.id}`}</span><button className="pending-detail-close" onClick={() => { setSelectedDetail(null); setEditing(false); }}>×</button></div>
                    {detailLoading ? <div className="pending-detail-loading">Đang tải chi tiết...</div> : <>
                        <div className="pending-detail-body">
                            {!detail ? null : editing ? <section className="pending-detail-section"><h3>Chỉnh sửa báo cáo</h3><div className="pending-edit-grid">
                                <label>Công đoạn<input value={text(editDraft?.process_name)} disabled /></label>
                                <label>Công nhân<input value={text(editDraft?.full_name)} disabled /></label>
                                <label>Ngày báo cáo<input type="date" value={String(editDraft?.work_date || "").slice(0,10)} onChange={e => updateField("work_date", e.target.value)} /></label>
                                <label>Ca làm việc<input value={text(editDraft?.shift, "")} onChange={e => updateField("shift", e.target.value)} /></label>
                                <label>Máy móc<input value={text(editDraft?.machine_no, "")} onChange={e => updateField("machine_no", e.target.value)} /></label>
                                <label>Sản phẩm<input value={text(editDraft?.product_name, "")} onChange={e => updateField("product_name", e.target.value)} /></label>
                                <label>Giờ làm<input type="number" min="0" value={editHours} onChange={e => setEditHours(e.target.value)} /></label>
                                <label>Phút làm<input type="number" min="0" max="59" value={editMinutes} onChange={e => setEditMinutes(e.target.value)} /></label>
                                <label>Sản lượng OK<input type="number" min="0" value={String(editDraft?.tt_ok ?? 0)} onChange={e => updateField("tt_ok", Number(e.target.value))} /></label>
                                <label>Sản lượng NG<input type="number" min="0" value={String(editDraft?.tt_ng ?? 0)} onChange={e => updateField("tt_ng", Number(e.target.value))} /></label>
                                <label style={{ gridColumn: "1 / -1" }}>Ghi chú<textarea value={text(editDraft?.note, "")} onChange={e => updateField("note", e.target.value)} /></label>
                            </div></section> : <>
                                <section className="pending-detail-section"><h3>Thông tin chung</h3><div className="pending-detail-grid">
                                    <div className="pending-detail-field"><span>Công nhân</span><strong>{text(detail.full_name)} ({text(detail.worker_code)})</strong></div><div className="pending-detail-field"><span>Ngày báo cáo</span><strong>{formatDate(detail.work_date)}</strong></div>
                                    <div className="pending-detail-field"><span>Công đoạn</span><strong>{text(detail.process_name)}</strong></div><div className="pending-detail-field"><span>Thời gian làm việc</span><strong>{timeRange(detail)} ({number(detail.actual_time)}h)</strong></div>
                                    <div className="pending-detail-field"><span>Máy móc</span><strong>{text(detail.machine_no)}</strong></div><div className="pending-detail-field"><span>Sản phẩm</span><strong>{text(detail.product_name)}</strong></div>
                                    <div className="pending-detail-field"><span>Ca làm việc</span><strong>{text(detail.shift)}</strong></div><div className="pending-detail-field"><span>Định mức</span><strong>{number(detail.standard_output)}</strong></div>
                                </div></section>
                                <section className="pending-detail-section"><h3>Kết quả sản xuất</h3><div className="pending-result-grid"><div className="pending-result-item"><span>Sản lượng OK</span><strong>{number(ok)}</strong></div><div className="pending-result-item ng"><span>Sản lượng NG</span><strong>{number(ng)}</strong></div><div className="pending-result-item total"><span>Tổng sản lượng</span><strong>{number(totalOutput)}</strong></div><div className="pending-result-item rate"><span>Tỷ lệ OK</span><strong>{rate.toFixed(2)}%</strong></div></div></section>
                                <section className="pending-detail-section"><h3>Thông tin chi tiết</h3><div className="pending-detail-info-grid"><div className="pending-detail-field"><span>Lý do NG</span><strong>{detail.defects?.filter(d => Number(d.quantity) > 0).map(d => `${d.defect_name} (${d.quantity})`).join(", ") || "Không có"}</strong></div><div className="pending-detail-field"><span>Ghi chú</span><strong>{text(detail.note, "Không có ghi chú")}</strong></div></div></section>
                                <section className="pending-detail-section"><h3>Lịch sử</h3><div className="pending-history-empty">Báo cáo đã được duyệt{detail.approved_at ? ` lúc ${new Date(detail.approved_at).toLocaleString("vi-VN")}` : ""}.</div></section>
                            </>}
                        </div>
                        <div className="pending-detail-actions">
                            {editing ? <><button className="pending-detail-cancel" type="button" onClick={cancelEdit} disabled={saving}>Hủy</button><button className="pending-detail-save" type="button" onClick={() => void saveEdit()} disabled={saving}>{saving ? "Đang lưu..." : "Lưu thay đổi"}</button></> : canEdit ? <button className="pending-detail-edit" type="button" onClick={startEdit}>✎ Sửa báo cáo</button> : <span style={{ color: "#7185a4", fontSize: 10 }}>Tổ trưởng chỉ có quyền xem báo cáo đã duyệt.</span>}
                        </div>
                    </>}
                </aside>}
            </section>

            {selectedIds.length > 0 && <div className="pending-bulk-actions"><span>Đã chọn {selectedIds.length} báo cáo</span><button className="approve" type="button" onClick={() => { const first = reports.find(r => selectedIds.includes(Number(r.id))); if (first) void openDetail(first); }}>Xem chi tiết</button></div>}
        </div>
    );
}
