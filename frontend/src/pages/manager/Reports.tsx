import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
    approveSelectedTempReports,
    getPendingReports,
    getTempReportDetail,
    rejectSelectedTempReports,
    updateReport,
} from "../../services/productionService";
import api from "../../services/api";
import type { ProductionReport } from "../../types/production";
import { useToast } from "../../components/feedback/toastContext";
import { usePermissions } from "../../hooks/usePermissions";
import { getToday } from "./managerReportDateLogic";
import { getValidReportIds, reconcileSelectedReportIds, toggleCurrentPageIds, toggleReportId } from "./managerReportSelection";
import { getStoredUser } from "../../utils/authStorage";
import "./ReportsSplitReference.css";

const REJECT_REASONS = ["Báo cáo trùng", "Sai sản lượng", "Sai thời gian", "Sai máy hoặc sản phẩm", "Thiếu dữ liệu", "Lý do khác"];
const text = (value: unknown, fallback = "---") => value === undefined || value === null || value === "" ? fallback : String(value);
const reportCode = (report: ProductionReport, index = 0) => `PR${String(report.work_date || "REPORT").slice(0, 10).replace(/-/g, "")}-${report.worker_code || String(report.id || index + 1).padStart(4, "0")}`;
const timeRange = (report: ProductionReport) => {
    const extra = report.extra_data || {};
    const start = extra.start_time;
    const end = extra.end_time;
    return start && end ? `${String(start)} - ${String(end)}` : "07:30 - 15:30";
};
const formatDate = (value?: string | null) => {
    if (!value) return "---";
    const raw = String(value).slice(0, 10);
    const [year, month, day] = raw.split("-");
    return year && month && day ? `${day}/${month}/${year}` : raw;
};
const number = (value: unknown) => Number(value || 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const toDate = (value: string) => new Date(`${value}T00:00:00`);
const dateString = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
const rangeFor = (value: string, type: "year" | "month" | "week" | "day") => {
    const base = toDate(value); const start = new Date(base); const end = new Date(base);
    if (type === "year") { start.setMonth(0, 1); end.setMonth(11, 31); }
    else if (type === "month") { start.setDate(1); end.setMonth(end.getMonth() + 1, 0); }
    else if (type === "week") { const mondayOffset = (start.getDay() + 6) % 7; start.setDate(start.getDate() - mondayOffset); end.setTime(start.getTime()); end.setDate(start.getDate() + 6); }
    return { dateFrom: dateString(start), dateTo: dateString(end) };
};

function Reports() {
    const { can } = usePermissions();
    const { showToast } = useToast();
    const role = String(getStoredUser()?.role || "").toLowerCase();
    const canReview = can("REPORT_APPROVE");
    const canDirectEdit = can("REPORT_PENDING_EDIT");
    const isLead = role === "lead" && !canDirectEdit;

    const [date, setDate] = useState(getToday());
    const [dateRange, setDateRange] = useState<{ dateFrom: string; dateTo: string } | null>(null);
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
    const [editingDetail, setEditingDetail] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [editSaving, setEditSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState("");
    const [rejectOpen, setRejectOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
    const [rejectDetail, setRejectDetail] = useState("");
    const [proposalOpen, setProposalOpen] = useState(false);
    const [proposalReason, setProposalReason] = useState("");
    const [proposalSending, setProposalSending] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [yearCount, setYearCount] = useState(0);
    const [monthCount, setMonthCount] = useState(0);
    const [weekCount, setWeekCount] = useState(0);
    const [dayCount, setDayCount] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const seq = useRef(0);
    const lock = useRef(false);

    useEffect(() => {
        const timer = window.setTimeout(() => setSearchQuery(searchKeyword.trim()), 250);
        return () => window.clearTimeout(timer);
    }, [searchKeyword]);

    const loadReports = useCallback(async () => {
        const request = ++seq.current;
        try {
            setLoading(true); setError("");
            const filters = { processName: selectedProcess || undefined, shift: selectedShift || undefined, search: searchQuery || undefined };
            const listRange = dateRange || { dateFrom: date, dateTo: date };
            const result = await getPendingReports({ ...listRange, ...filters, page: currentPage, pageSize: 8 });
            if (request !== seq.current) return;
            setReports(result.data); setTotalCount(result.pagination.total); setTotalPages(result.pagination.total_pages);
            const ranges = { year: rangeFor(date, "year"), month: rangeFor(date, "month"), week: rangeFor(date, "week"), day: rangeFor(date, "day") };
            const [yearResult, monthResult, weekResult, dayResult] = await Promise.all([
                getPendingReports({ ...ranges.year, ...filters, page: 1, pageSize: 1 }),
                getPendingReports({ ...ranges.month, ...filters, page: 1, pageSize: 1 }),
                getPendingReports({ ...ranges.week, ...filters, page: 1, pageSize: 1 }),
                getPendingReports({ ...ranges.day, ...filters, page: 1, pageSize: 1 }),
            ]);
            if (request !== seq.current) return;
            setYearCount(yearResult.pagination.total); setMonthCount(monthResult.pagination.total); setWeekCount(weekResult.pagination.total); setDayCount(dayResult.pagination.total);
            setSelectedIds(previous => reconcileSelectedReportIds(previous, result.data));
        } catch (err: unknown) {
            if (request !== seq.current) return;
            setError(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể tải báo cáo chờ duyệt" : "Không thể tải báo cáo chờ duyệt");
            setReports([]); setTotalCount(0); setTotalPages(1); setSelectedIds([]);
        } finally {
            if (request === seq.current) setLoading(false);
        }
    }, [date, dateRange, selectedProcess, selectedShift, searchQuery, currentPage]);

    useEffect(() => { void loadReports(); }, [loadReports]);
    useEffect(() => {
        setCurrentPage(1); setSelectedIds([]); setSelectedDetail(null); setEditDraft(null); setEditingDetail(false);
    }, [date, dateRange, selectedProcess, selectedShift, searchQuery]);

    const processes = useMemo(() => Array.from(new Set(reports.map(report => report.process_name).filter(Boolean) as string[])).sort(), [reports]);
    const shifts = useMemo(() => Array.from(new Set(reports.map(report => report.shift).filter(Boolean))).sort(), [reports]);
    const pageIds = useMemo(() => getValidReportIds(reports), [reports]);
    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const targets = useMemo(() => reports.filter(report => selectedSet.has(Number(report.id))).map(report => ({ id: Number(report.id), expected_updated_at: report.updated_at || null })), [reports, selectedSet]);
    const allSelected = pageIds.length > 0 && pageIds.every(id => selectedSet.has(id));
    const someSelected = pageIds.some(id => selectedSet.has(id)) && !allSelected;

    const openDetail = async (report: ProductionReport) => {
        const id = Number(report.id);
        if (!id) return;
        setSelectedDetail(report); setEditDraft(null); setEditingDetail(false); setDetailLoading(true);
        try { setSelectedDetail(await getTempReportDetail(id)); }
        catch (err) { showToast(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể tải chi tiết báo cáo" : "Không thể tải chi tiết báo cáo"); }
        finally { setDetailLoading(false); }
    };

    const startInlineEdit = () => {
        if (!selectedDetail || !canDirectEdit) return;
        const actual = Math.max(0, Number(selectedDetail.actual_time) || 0);
        const hours = Math.floor(actual);
        const minutes = Math.round((actual - hours) * 60);
        setEditDraft({ ...selectedDetail }); setEditHours(String(hours)); setEditMinutes(String(Math.min(59, minutes))); setEditingDetail(true);
    };
    const cancelInlineEdit = () => { setEditDraft(null); setEditingDetail(false); };
    const updateEditField = (field: keyof ProductionReport, value: string | number) => setEditDraft(current => current ? { ...current, [field]: value } : current);
    const saveInlineEdit = async () => {
        if (!editDraft || !editDraft.id || editSaving) return;
        const actualHours = Math.max(0, Number(editHours) || 0);
        const actualMinutes = Math.min(59, Math.max(0, Number(editMinutes) || 0));
        const actualTime = actualHours + actualMinutes / 60;
        const deductionTime = Number(editDraft.deduction_time) || 0;
        const ok = Math.max(0, Number(editDraft.tt_ok) || 0);
        const ng = Math.max(0, Number(editDraft.tt_ng) || 0);
        const nextDraft: ProductionReport = { ...editDraft, work_date: String(editDraft.work_date || "").slice(0, 10), actual_time: actualTime, total_time: actualTime + deductionTime, tt_ok: ok, tt_ng: ng, actual_output: ok + ng };
        try {
            setEditSaving(true);
            const result = await updateReport(Number(editDraft.id), nextDraft, "pending");
            const updated = result?.data || result?.report || result;
            const merged = { ...nextDraft, ...(updated && typeof updated === "object" ? updated : {}) } as ProductionReport;
            setSelectedDetail(merged); setReports(current => current.map(item => Number(item.id) === Number(merged.id) ? { ...item, ...merged } : item));
            setEditDraft(null); setEditingDetail(false); showToast("Đã cập nhật báo cáo", "success"); await loadReports();
        } catch (err: unknown) {
            showToast(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể cập nhật báo cáo" : "Không thể cập nhật báo cáo");
        } finally { setEditSaving(false); }
    };

    const openProposal = () => {
        if (!selectedDetail || !isLead) return;
        setProposalReason(""); setProposalOpen(true);
    };
    const sendProposal = async () => {
        if (!selectedDetail || proposalSending) return;
        const reason = proposalReason.trim();
        if (reason.length < 2) return showToast("Vui lòng nhập nội dung đề xuất sửa");
        try {
            setProposalSending(true);
            await api.post(`/production-temp/${Number(selectedDetail.id)}/request-edit`, { reason });
            showToast("Đã gửi đề xuất sửa cho công nhân", "success");
            setProposalOpen(false); setProposalReason("");
        } catch (err: unknown) {
            showToast(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể gửi đề xuất sửa" : "Không thể gửi đề xuất sửa");
        } finally { setProposalSending(false); }
    };

    const togglePage = () => setSelectedIds(previous => toggleCurrentPageIds(previous, pageIds, allSelected));
    const toggleOne = (id: number) => setSelectedIds(previous => toggleReportId(previous, id));
    const approveTargets = async (ids: number[], items: { id: number; expected_updated_at: string | null }[]) => {
        if (lock.current || actionLoading || !ids.length || !canReview) return;
        if (!window.confirm(`Duyệt ${ids.length} báo cáo đã chọn?`)) return;
        lock.current = true; setActionLoading(true);
        try {
            await approveSelectedTempReports(items);
            showToast(`Đã duyệt ${ids.length} báo cáo`, "success");
            setSelectedIds(previous => previous.filter(id => !ids.includes(id)));
            if (selectedDetail && ids.includes(Number(selectedDetail.id))) setSelectedDetail(null);
            await loadReports();
        } catch (err: unknown) {
            showToast(axios.isAxiosError(err) ? err.response?.data?.message || "Duyệt báo cáo thất bại" : "Duyệt báo cáo thất bại");
        } finally { lock.current = false; setActionLoading(false); }
    };
    const approveSelected = () => approveTargets(selectedIds, targets);
    const approveOne = (report: ProductionReport) => approveTargets([Number(report.id)], [{ id: Number(report.id), expected_updated_at: report.updated_at || null }]);
    const openRejectForSelected = () => { if (selectedIds.length && canReview) setRejectOpen(true); };
    const rejectSelected = async () => {
        if (lock.current || actionLoading || !selectedIds.length || !canReview) return;
        const reason = rejectReason === "Lý do khác" ? rejectDetail.trim() : [rejectReason, rejectDetail.trim()].filter(Boolean).join(": ");
        if (!reason) return showToast("Vui lòng nhập lý do từ chối");
        lock.current = true; setActionLoading(true);
        try {
            await rejectSelectedTempReports(targets, reason);
            showToast(`Đã từ chối ${selectedIds.length} báo cáo`, "success");
            setRejectOpen(false); setRejectDetail(""); setSelectedIds([]); setSelectedDetail(null); setEditingDetail(false); await loadReports();
        } catch (err: unknown) {
            showToast(axios.isAxiosError(err) ? err.response?.data?.message || "Từ chối báo cáo thất bại" : "Từ chối báo cáo thất bại");
        } finally { lock.current = false; setActionLoading(false); }
    };

    const detail = editingDetail && editDraft ? editDraft : selectedDetail;
    const detailDefects = (detail?.defects || []).filter(item => Number(item.quantity) > 0);
    const detailDeductions = (detail?.deductions || []).filter(item => Number(item.hours) > 0);
    const detailTotal = Number(detail?.actual_output || 0);
    const detailOk = Number(detail?.tt_ok || 0);
    const detailNg = Number(detail?.tt_ng || 0);
    const detailRate = detailTotal > 0 ? (detailOk / detailTotal) * 100 : 0;
    const selectDay = () => { setDate(getToday()); setDateRange(null); };
    const selectMonth = () => setDateRange(rangeFor(date, "month"));
    const selectWeek = () => setDateRange(rangeFor(date, "week"));
    const selectYear = () => setDateRange(rangeFor(date, "year"));
    const rangeIsActive = (type: "year" | "month" | "week" | "day") => {
        const range = rangeFor(date, type); const current = dateRange || { dateFrom: date, dateTo: date };
        return current.dateFrom === range.dateFrom && current.dateTo === range.dateTo;
    };

    return (
        <div className="management-report-page manager-page pending-reference-page">
            <header className="pending-page-title"><div><h1>Chờ duyệt báo cáo</h1><p>Xem chi tiết và duyệt các báo cáo sản xuất từ công nhân.</p></div></header>

            <section className="pending-filter-card">
                <div className="pending-search"><span>⌕</span><input value={searchKeyword} onChange={event => setSearchKeyword(event.target.value)} placeholder="Tìm kiếm mã báo cáo, công nhân..." /></div>
                <label><span>Ngày báo cáo</span><input type="date" value={date} onChange={event => { setDate(event.target.value); setDateRange(null); }} /></label>
                <div className="pending-quick-filters"><span>Chọn nhanh</span><button type="button" className={rangeIsActive("day") ? "active" : ""} onClick={selectDay}>Hôm nay</button><button type="button" className={rangeIsActive("week") ? "active" : ""} onClick={selectWeek}>Tuần này</button><button type="button" className={rangeIsActive("month") ? "active" : ""} onClick={selectMonth}>Tháng này</button><button type="button" className={rangeIsActive("year") ? "active" : ""} onClick={selectYear}>Năm này</button></div>
                <label><span>Công đoạn</span><select value={selectedProcess} onChange={event => setSelectedProcess(event.target.value)}><option value="">Tất cả</option>{processes.map(process => <option key={process} value={process}>{process}</option>)}</select></label>
                <label><span>Ca làm việc</span><select value={selectedShift} onChange={event => setSelectedShift(event.target.value)}><option value="">Tất cả</option>{shifts.map(shift => <option key={shift}>{shift}</option>)}</select></label>
                <button className="pending-refresh" type="button" onClick={() => void loadReports()}>⟳ <span>Làm mới</span></button>
            </section>

            <section className="pending-kpis">
                <div role="button" tabIndex={0} className={`pending-kpi kpi-orange ${rangeIsActive("day") ? "is-active" : ""}`} onClick={selectDay}><span>Hôm nay</span><strong>{dayCount}</strong><small>Báo cáo chờ duyệt · Bấm để xem</small></div>
                <div role="button" tabIndex={0} className={`pending-kpi kpi-slate ${rangeIsActive("week") ? "is-active" : ""}`} onClick={selectWeek}><span>Tuần này</span><strong>{weekCount}</strong><small>Báo cáo chờ duyệt · Bấm để xem</small></div>
                <div role="button" tabIndex={0} className={`pending-kpi kpi-green ${rangeIsActive("month") ? "is-active" : ""}`} onClick={selectMonth}><span>Tháng này</span><strong>{monthCount}</strong><small>Báo cáo chờ duyệt · Bấm để xem</small></div>
                <div role="button" tabIndex={0} className={`pending-kpi kpi-blue ${rangeIsActive("year") ? "is-active" : ""}`} onClick={selectYear}><span>Năm này</span><strong>{yearCount}</strong><small>Báo cáo chờ duyệt · Bấm để xem</small></div>
            </section>

            {error && <div className="management-error">{error}</div>}

            <section className={`pending-workspace ${selectedDetail ? "detail-open" : "list-only"}`}>
                <div className="pending-list-card">
                    <div className="pending-list-tabs"><button type="button" className="pending-list-tab active">Danh sách báo cáo ({totalCount})</button></div>
                    {selectedIds.length > 0 && <div className="management-selected-info"><strong>Đã chọn {selectedIds.length} báo cáo.</strong><div className="management-selected-actions"><button type="button" onClick={() => setSelectedIds([])}>Bỏ chọn</button>{canReview && <><button type="button" className="selected-reject-action" onClick={openRejectForSelected} disabled={actionLoading}>Từ chối</button><button type="button" className="selected-approve-action" onClick={() => void approveSelected()} disabled={actionLoading}>Duyệt</button></>}</div></div>}

                    {loading ? <div className="management-empty">Đang tải...</div> : !reports.length ? <div className="pending-overdue-empty">Không có báo cáo phù hợp</div> : <div className="pending-table-wrap"><table className="pending-reference-table"><thead><tr><th className="select-col"><input type="checkbox" checked={allSelected} ref={element => { if (element) element.indeterminate = someSelected; }} onChange={togglePage} /></th><th>STT</th><th>Mã báo cáo</th><th>Công nhân</th><th>Công đoạn</th><th>Ca</th><th>Thời gian</th><th>Trạng thái</th></tr></thead><tbody>{reports.map((report, index) => { const id = Number(report.id); const selected = selectedSet.has(id); const active = Number(selectedDetail?.id) === id; return <tr key={report.id ?? index} className={`${selected ? "is-selected" : ""} ${active ? "pending-row-active" : ""}`} onClick={() => void openDetail(report)} title="Chọn để xem chi tiết"><td className="select-col" onClick={event => event.stopPropagation()}><input type="checkbox" checked={selected} disabled={!id || actionLoading} onChange={() => toggleOne(id)} /></td><td>{(currentPage - 1) * 8 + index + 1}</td><td className="report-code">{reportCode(report, index)}</td><td><div className="worker-cell">{text(report.full_name)}<small>({text(report.worker_code)})</small></div></td><td>{text(report.process_name)}</td><td><span className="shift-chip">{text(report.shift)}</span></td><td><div className="date-cell"><strong>{formatDate(report.work_date)}</strong><small>{timeRange(report)}</small></div></td><td><span className="status-pill status-orange">Chờ duyệt</span></td></tr>; })}</tbody></table></div>}

                    <footer className="pending-table-footer"><span>Hiển thị {reports.length ? (currentPage - 1) * 8 + 1 : 0} đến {Math.min(currentPage * 8, totalCount)} của {totalCount} báo cáo</span><nav className="pending-pagination"><button disabled={currentPage === 1} onClick={() => setCurrentPage(page => Math.max(1, page - 1))}>‹</button>{Array.from({ length: Math.min(totalPages, 4) }, (_, index) => index + 1).map(page => <button key={page} className={currentPage === page ? "active" : ""} onClick={() => setCurrentPage(page)}>{page}</button>)}{totalPages > 4 && <button disabled>…</button>}<button disabled={currentPage === totalPages} onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}>›</button></nav></footer>
                </div>

                {selectedDetail && <aside className={`pending-detail-card ${editingDetail ? "is-editing" : ""}`}>
                    <header className="pending-detail-head"><div className="pending-detail-title"><h2>{editingDetail ? "Sửa báo cáo" : "Chi tiết báo cáo"}</h2><span className="pending-detail-status">Chờ duyệt</span></div><span className="pending-detail-code">Mã báo cáo: {reportCode(selectedDetail)}</span><button type="button" className="pending-detail-close" aria-label="Đóng chi tiết" onClick={() => { if (!editSaving) { setSelectedDetail(null); cancelInlineEdit(); } }}>×</button></header>
                    {detailLoading ? <div className="pending-detail-loading">Đang tải chi tiết...</div> : detail ? <>
                        <div className="pending-detail-body">
                            <section className="pending-detail-section"><h3>Thông tin chung</h3>{editingDetail ? <div className="pending-edit-grid"><label><span>Ngày báo cáo</span><input type="date" value={String(detail.work_date || "").slice(0, 10)} onChange={e => updateEditField("work_date", e.target.value)} /></label><label><span>Ca làm việc</span><select value={detail.shift || ""} onChange={e => updateEditField("shift", e.target.value)}><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option></select></label><label><span>Máy móc</span><input value={detail.machine_no || ""} onChange={e => updateEditField("machine_no", e.target.value)} /></label><label><span>Sản phẩm</span><input value={detail.product_name || ""} onChange={e => updateEditField("product_name", e.target.value)} /></label><label><span>Giờ làm thực tế</span><input type="number" min="0" max="24" step="1" value={editHours} onChange={e => setEditHours(e.target.value.replace(/\D/g, ""))} /></label><label><span>Phút làm thực tế</span><input type="number" min="0" max="59" step="1" value={editMinutes} onChange={e => setEditMinutes(e.target.value.replace(/\D/g, ""))} /></label><label><span>TT OK</span><input type="number" min="0" step="1" value={Number(detail.tt_ok || 0)} onChange={e => updateEditField("tt_ok", Math.max(0, Number(e.target.value) || 0))} /></label><label><span>Ghi chú</span><input value={detail.note || ""} onChange={e => updateEditField("note", e.target.value)} /></label></div> : <div className="pending-detail-grid"><div className="pending-detail-field"><span>Công nhân</span><strong>{text(detail.full_name)} ({text(detail.worker_code)})</strong></div><div className="pending-detail-field"><span>Ngày báo cáo</span><strong>{formatDate(detail.work_date)}</strong></div><div className="pending-detail-field"><span>Công đoạn</span><strong>{text(detail.process_name)}</strong></div><div className="pending-detail-field"><span>Thời gian làm việc</span><strong>{timeRange(detail)} ({number(detail.total_time)}h)</strong></div><div className="pending-detail-field"><span>Máy móc</span><strong>{text(detail.machine_no)}</strong></div><div className="pending-detail-field"><span>Sản phẩm</span><strong>{text(detail.product_name)}</strong></div><div className="pending-detail-field"><span>Ca làm việc</span><strong>{text(detail.shift)}</strong></div><div className="pending-detail-field"><span>Học việc</span><strong>{number(detail.training_percent ?? 100)}%</strong></div></div>}</section>
                            <section className="pending-detail-section"><h3>Kết quả sản xuất</h3><div className="pending-result-grid"><div className="pending-result-item"><span>Sản lượng OK</span><strong>{number(detailOk)}</strong></div><div className="pending-result-item ng"><span>Sản lượng NG</span><strong>{number(detailNg)}</strong></div><div className="pending-result-item total"><span>Tổng sản lượng</span><strong>{number(detailTotal)}</strong></div><div className="pending-result-item rate"><span>Tỷ lệ OK</span><strong>{detailRate.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%</strong></div></div></section>
                            <section className="pending-detail-section"><h3>Thông tin chi tiết</h3><div className="pending-detail-info-grid"><div><div className="pending-detail-field"><span>Trừ giờ</span><strong>{number(detail.deduction_time)} giờ</strong></div>{detailDeductions.length > 0 && <div className="pending-defect-list">{detailDeductions.map(item => <span className="pending-defect" key={item.id || item.deduction_code}>{item.deduction_name}: {number(item.hours)}h</span>)}</div>}</div><div><div className="pending-detail-field"><span>Lý do NG</span><strong>{detailDefects.length ? detailDefects.map(item => `${item.defect_name}: ${number(item.quantity)}`).join(", ") : "---"}</strong></div></div></div><div className="pending-detail-field" style={{ marginTop: 12 }}><span>Ghi chú</span><strong>{text(detail.note)}</strong></div></section>
                            <section className="pending-detail-section"><h3>Lịch sử duyệt</h3><div className="pending-history-empty">◷ &nbsp; Chưa có lịch sử duyệt</div></section>
                        </div>
                        <footer className="pending-detail-actions">
                            {editingDetail ? <><button type="button" className="pending-detail-cancel" onClick={cancelInlineEdit} disabled={editSaving}>Hủy</button><button type="button" className="pending-detail-save" onClick={() => void saveInlineEdit()} disabled={editSaving}>{editSaving ? "Đang lưu..." : "Lưu thay đổi"}</button></> : <>
                                {isLead && <button type="button" className="pending-detail-proposal" onClick={openProposal} disabled={proposalSending}>Đề xuất sửa</button>}
                                {!isLead && canDirectEdit && <button type="button" className="pending-detail-edit" onClick={startInlineEdit}>Sửa</button>}
                                <button type="button" className="pending-detail-reject" onClick={() => { setSelectedIds([Number(selectedDetail.id)]); setRejectOpen(true); }}>Từ chối</button>
                                <button type="button" className="pending-detail-approve" onClick={() => void approveOne(selectedDetail)} disabled={actionLoading}>Duyệt</button>
                            </>}
                        </footer>
                    </> : null}
                </aside>}
            </section>

            {proposalOpen && <div className="pending-modal-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) setProposalOpen(false); }}><div className="pending-modal" role="dialog" aria-modal="true" aria-labelledby="proposal-title"><h2 id="proposal-title">Đề xuất sửa báo cáo</h2><p className="pending-modal-description">Nội dung này sẽ được gửi cho công nhân để kiểm tra và sửa lại báo cáo.</p><label><span>Nội dung đề xuất</span><textarea value={proposalReason} onChange={event => setProposalReason(event.target.value)} rows={5} maxLength={1000} placeholder="Ví dụ: Kiểm tra lại sản lượng OK và thời gian làm việc..." /></label><div className="pending-modal-actions"><button type="button" onClick={() => setProposalOpen(false)} disabled={proposalSending}>Hủy</button><button type="button" className="primary" onClick={() => void sendProposal()} disabled={proposalSending}>{proposalSending ? "Đang gửi..." : "Gửi đề xuất"}</button></div></div></div>}

            {rejectOpen && <div className="pending-modal-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) setRejectOpen(false); }}><div className="pending-modal" role="dialog" aria-modal="true" aria-labelledby="reject-title"><h2 id="reject-title">Từ chối báo cáo</h2><label><span>Lý do</span><select value={rejectReason} onChange={event => setRejectReason(event.target.value)}>{REJECT_REASONS.map(reason => <option key={reason}>{reason}</option>)}</select></label><label><span>Chi tiết</span><textarea value={rejectDetail} onChange={event => setRejectDetail(event.target.value)} rows={4} /></label><div className="pending-modal-actions"><button type="button" onClick={() => setRejectOpen(false)}>Hủy</button><button type="button" className="danger" onClick={() => void rejectSelected()} disabled={actionLoading}>Từ chối</button></div></div></div>}
        </div>
    );
}

export default Reports;
