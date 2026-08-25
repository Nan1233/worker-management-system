import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
    approveSelectedTempReports,
    getDeductionOptionsByProcess,
    getDefectOptionsByProcess,
    getPendingReports,
    getTempReportDetail,
    rejectSelectedTempReports,
    updateReport,
} from "../../services/productionService";
import api from "../../services/api";
import type { ProductionDeduction, ProductionDefect, ProductionReport } from "../../types/production";
import { useToast } from "../../components/feedback/toastContext";
import { usePermissions } from "../../hooks/usePermissions";
import { getToday } from "./managerReportDateLogic";
import { getValidReportIds, reconcileSelectedReportIds, toggleCurrentPageIds, toggleReportId } from "./managerReportSelection";
import { getStoredUser } from "../../utils/authStorage";
import "./ReportsSplitReference.css";

const REJECT_REASONS = ["Báo cáo trùng", "Sai sản lượng", "Sai thời gian", "Sai máy hoặc sản phẩm", "Thiếu dữ liệu", "Lý do khác"];
const text = (value: unknown, fallback = "---") => value === undefined || value === null || value === "" ? fallback : String(value);
const reportCode = (report: ProductionReport, index = 0) => `PR${String(report.work_date || "REPORT").slice(0, 10).replace(/-/g, "")}-${report.worker_code || String(report.id || index + 1).padStart(4, "0")}`;
const formatDate = (value?: string | null) => { if (!value) return "---"; const raw = String(value).slice(0, 10); const [year, month, day] = raw.split("-"); return year && month && day ? `${day}/${month}/${year}` : raw; };
const number = (value: unknown) => Number(value || 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const minutesOf = (hours: unknown) => Math.round(Math.max(0, Number(hours) || 0) * 60);
const timeRange = (report: ProductionReport) => { const extra = report.extra_data || {}; return extra.start_time && extra.end_time ? `${extra.start_time} - ${extra.end_time}` : "07:30 - 15:30"; };
const toDate = (value: string) => new Date(`${value}T00:00:00`);
const dateString = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
const rangeFor = (value: string, type: "year" | "month" | "week" | "day") => { const base = toDate(value); const start = new Date(base); const end = new Date(base); if (type === "year") { start.setMonth(0, 1); end.setMonth(11, 31); } else if (type === "month") { start.setDate(1); end.setMonth(end.getMonth() + 1, 0); } else if (type === "week") { const offset = (start.getDay() + 6) % 7; start.setDate(start.getDate() - offset); end.setTime(start.getTime()); end.setDate(start.getDate() + 6); } return { dateFrom: dateString(start), dateTo: dateString(end) }; };

function Reports() {
    const { can } = usePermissions();
    const { showToast } = useToast();
    const role = String(getStoredUser()?.role || "").toLowerCase();
    const isLead = role === "lead";
    const canReview = can("REPORT_APPROVE");
    const canDirectEdit = !isLead && can("REPORT_PENDING_EDIT");

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
    const [currentPage, setCurrentPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [dayCount, setDayCount] = useState(0);
    const [weekCount, setWeekCount] = useState(0);
    const [monthCount, setMonthCount] = useState(0);
    const [yearCount, setYearCount] = useState(0);
    const [defectOptions, setDefectOptions] = useState<ProductionDefect[]>([]);
    const [deductionOptions, setDeductionOptions] = useState<ProductionDeduction[]>([]);
    const seq = useRef(0);
    const lock = useRef(false);

    useEffect(() => { const timer = window.setTimeout(() => setSearchQuery(searchKeyword.trim()), 250); return () => window.clearTimeout(timer); }, [searchKeyword]);

    const loadReports = useCallback(async () => {
        const request = ++seq.current;
        try {
            setLoading(true); setError("");
            const filters = { processName: selectedProcess || undefined, shift: selectedShift || undefined, search: searchQuery || undefined };
            const listRange = dateRange || { dateFrom: date, dateTo: date };
            const result = await getPendingReports({ ...listRange, ...filters, page: currentPage, pageSize: 8 });
            if (request !== seq.current) return;
            setReports(result.data || []); setTotalCount(result.pagination?.total || 0); setTotalPages(result.pagination?.total_pages || 1);
            const ranges = { day: rangeFor(date, "day"), week: rangeFor(date, "week"), month: rangeFor(date, "month"), year: rangeFor(date, "year") };
            const [day, week, month, year] = await Promise.all([
                getPendingReports({ ...ranges.day, ...filters, page: 1, pageSize: 1 }),
                getPendingReports({ ...ranges.week, ...filters, page: 1, pageSize: 1 }),
                getPendingReports({ ...ranges.month, ...filters, page: 1, pageSize: 1 }),
                getPendingReports({ ...ranges.year, ...filters, page: 1, pageSize: 1 }),
            ]);
            if (request !== seq.current) return;
            setDayCount(day.pagination?.total || 0); setWeekCount(week.pagination?.total || 0); setMonthCount(month.pagination?.total || 0); setYearCount(year.pagination?.total || 0);
            setSelectedIds(previous => reconcileSelectedReportIds(previous, result.data || []));
        } catch (err: unknown) {
            if (request !== seq.current) return;
            setError(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể tải báo cáo chờ duyệt" : "Không thể tải báo cáo chờ duyệt");
            setReports([]); setTotalCount(0); setTotalPages(1); setSelectedIds([]);
        } finally { if (request === seq.current) setLoading(false); }
    }, [date, dateRange, selectedProcess, selectedShift, searchQuery, currentPage]);

    useEffect(() => { void loadReports(); }, [loadReports]);
    useEffect(() => { setCurrentPage(1); setSelectedIds([]); setSelectedDetail(null); setEditDraft(null); setEditingDetail(false); }, [date, dateRange, selectedProcess, selectedShift, searchQuery]);

    const processes = useMemo(() => Array.from(new Set(reports.map(report => report.process_name).filter(Boolean) as string[])).sort(), [reports]);
    const shifts = useMemo(() => Array.from(new Set(reports.map(report => report.shift).filter(Boolean))).sort(), [reports]);
    const pageIds = useMemo(() => getValidReportIds(reports), [reports]);
    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const targets = useMemo(() => reports.filter(report => selectedSet.has(Number(report.id))).map(report => ({ id: Number(report.id), expected_updated_at: report.updated_at || null })), [reports, selectedSet]);
    const allSelected = pageIds.length > 0 && pageIds.every(id => selectedSet.has(id));
    const someSelected = pageIds.some(id => selectedSet.has(id)) && !allSelected;

    const openDetail = async (report: ProductionReport) => {
        const id = Number(report.id); if (!id) return;
        setSelectedDetail(report); setEditDraft(null); setEditingDetail(false); setDetailLoading(true);
        try { setSelectedDetail(await getTempReportDetail(id)); }
        catch (err) { showToast(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể tải chi tiết báo cáo" : "Không thể tải chi tiết báo cáo"); }
        finally { setDetailLoading(false); }
    };

    const prepareEditDraft = async (report: ProductionReport) => {
        const actual = Math.max(0, Number(report.actual_time) || 0);
        setEditDraft({ ...report, defects: [...(report.defects || [])], deductions: [...(report.deductions || [])] });
        setEditHours(String(Math.floor(actual)));
        setEditMinutes(String(Math.min(59, Math.round((actual - Math.floor(actual)) * 60))));
        const processId = Number(report.process_id);
        try {
            const [defects, deductions] = await Promise.all([
                processId > 0 ? getDefectOptionsByProcess(processId) : Promise.resolve([]),
                processId > 0 ? getDeductionOptionsByProcess(processId) : Promise.resolve([]),
            ]);
            setDefectOptions(defects); setDeductionOptions(deductions);
        } catch (err) {
            console.error("LOAD EDIT OPTIONS ERROR", err);
            setDefectOptions([]); setDeductionOptions([]);
        }
    };

    const startInlineEdit = async () => { if (!selectedDetail || !canDirectEdit) return; await prepareEditDraft(selectedDetail); setEditingDetail(true); };
    const openProposal = async () => { if (!selectedDetail || !isLead) return; await prepareEditDraft(selectedDetail); setEditingDetail(true); };
    const cancelInlineEdit = () => { setEditDraft(null); setEditingDetail(false); };
    const updateEditField = (field: keyof ProductionReport, value: string | number) => setEditDraft(current => current ? { ...current, [field]: value } : current);

    const updateDefect = (index: number, quantity: number) => setEditDraft(current => {
        if (!current) return current;
        const defects = [...(current.defects || [])]; if (!defects[index]) return current;
        defects[index] = { ...defects[index], quantity: Math.max(0, Math.trunc(quantity || 0)) };
        const ttNg = defects.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
        return { ...current, defects, tt_ng: ttNg, actual_output: Math.max(0, Number(current.tt_ok) || 0) + ttNg };
    });

    const removeDefect = (index: number) => setEditDraft(current => {
        if (!current) return current;
        const defects = (current.defects || []).filter((_, itemIndex) => itemIndex !== index);
        const ttNg = defects.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
        return { ...current, defects, tt_ng: ttNg, actual_output: Math.max(0, Number(current.tt_ok) || 0) + ttNg };
    });

    const addDefect = (typeId: number) => setEditDraft(current => {
        if (!current || !typeId) return current;
        if ((current.defects || []).some(item => Number(item.defect_type_id || item.id) === typeId)) return current;
        const option = defectOptions.find(item => Number(item.defect_type_id || item.id) === typeId); if (!option) return current;
        return { ...current, defects: [...(current.defects || []), { ...option, defect_type_id: typeId, quantity: 0 }] };
    });

    const updateDeduction = (index: number, minutes: number) => setEditDraft(current => {
        if (!current) return current;
        const deductions = [...(current.deductions || [])]; if (!deductions[index]) return current;
        deductions[index] = { ...deductions[index], hours: Math.max(0, Math.min(1440, minutes || 0)) / 60 };
        const deductionTime = deductions.reduce((sum, item) => sum + Math.max(0, Number(item.hours) || 0), 0);
        const actualTime = Math.max(0, Number(editHours) || 0) + Math.min(59, Math.max(0, Number(editMinutes) || 0)) / 60;
        return { ...current, deductions, deduction_time: deductionTime, actual_time: actualTime, total_time: actualTime + deductionTime };
    });

    const removeDeduction = (index: number) => setEditDraft(current => {
        if (!current) return current;
        const deductions = (current.deductions || []).filter((_, itemIndex) => itemIndex !== index);
        const deductionTime = deductions.reduce((sum, item) => sum + Math.max(0, Number(item.hours) || 0), 0);
        const actualTime = Math.max(0, Number(editHours) || 0) + Math.min(59, Math.max(0, Number(editMinutes) || 0)) / 60;
        return { ...current, deductions, deduction_time: deductionTime, actual_time: actualTime, total_time: actualTime + deductionTime };
    });

    const addDeduction = (typeId: number) => setEditDraft(current => {
        if (!current || !typeId) return current;
        if ((current.deductions || []).some(item => Number(item.deduction_type_id || item.id) === typeId)) return current;
        const option = deductionOptions.find(item => Number(item.deduction_type_id || item.id) === typeId); if (!option) return current;
        return { ...current, deductions: [...(current.deductions || []), { ...option, deduction_type_id: typeId, hours: 0 }] };
    });

    const buildEditPayload = () => {
        if (!editDraft) return null;
        const actualHours = Math.max(0, Number(editHours) || 0);
        const actualMinutes = Math.min(59, Math.max(0, Number(editMinutes) || 0));
        const actualTime = actualHours + actualMinutes / 60;
        const defects = (editDraft.defects || []).map(item => ({ ...item, quantity: Math.max(0, Math.trunc(Number(item.quantity) || 0)) }));
        const deductions = (editDraft.deductions || []).filter(item => Number(item.hours) > 0).map(item => ({ ...item, hours: Math.max(0, Number(item.hours) || 0) }));
        const deductionTime = deductions.reduce((sum, item) => sum + item.hours, 0);
        const ttNg = defects.reduce((sum, item) => sum + item.quantity, 0);
        const ok = Math.max(0, Number(editDraft.tt_ok) || 0);
        return { ...editDraft, work_date: String(editDraft.work_date || "").slice(0, 10), actual_time: actualTime, deduction_time: deductionTime, total_time: actualTime + deductionTime, tt_ok: ok, tt_ng: ttNg, actual_output: ok + ttNg, defects, deductions };
    };

    const saveInlineEdit = async (approveAfterSave = false) => {
        if (!editDraft?.id || editSaving) return;
        const nextDraft = buildEditPayload(); if (!nextDraft) return;
        try {
            setEditSaving(true);
            let result;
            if (isLead) {
                const reason = String(nextDraft.note || "").trim() || "Tổ trưởng chỉnh sửa báo cáo";
                result = await api.put(`/production-temp/${Number(editDraft.id)}`, { ...nextDraft, reason });
            } else {
                result = await updateReport(Number(editDraft.id), nextDraft, "pending");
            }
            const updated = result?.data?.data || result?.data?.report || result?.data || result;
            const merged = { ...nextDraft, ...(updated && typeof updated === "object" ? updated : {}) } as ProductionReport;
            setSelectedDetail(merged); setReports(current => current.map(item => Number(item.id) === Number(merged.id) ? { ...item, ...merged } : item));
            setEditDraft(null); setEditingDetail(false);
            showToast(approveAfterSave ? "Đã sửa báo cáo và chuyển sang đã duyệt" : isLead ? "Đã sửa báo cáo, báo cáo vẫn chờ duyệt" : "Đã cập nhật báo cáo", "success");
            if (approveAfterSave) await approveTargets([Number(merged.id)], [{ id: Number(merged.id), expected_updated_at: merged.updated_at || null }]);
            else await loadReports();
        } catch (err: unknown) {
            showToast(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể cập nhật báo cáo" : "Không thể cập nhật báo cáo");
        } finally { setEditSaving(false); }
    };

    const togglePage = () => setSelectedIds(previous => toggleCurrentPageIds(previous, pageIds, allSelected));
    const toggleOne = (id: number) => setSelectedIds(previous => toggleReportId(previous, id));
    const approveTargets = async (ids: number[], items: { id: number; expected_updated_at: string | null }[]) => {
        if (lock.current || actionLoading || !ids.length || !canReview) return;
        if (!window.confirm(`Duyệt ${ids.length} báo cáo đã chọn?`)) return;
        lock.current = true; setActionLoading(true);
        try { await approveSelectedTempReports(items); showToast(`Đã duyệt ${ids.length} báo cáo`, "success"); setSelectedIds(previous => previous.filter(id => !ids.includes(id))); if (selectedDetail && ids.includes(Number(selectedDetail.id))) setSelectedDetail(null); await loadReports(); }
        catch (err: unknown) { showToast(axios.isAxiosError(err) ? err.response?.data?.message || "Duyệt báo cáo thất bại" : "Duyệt báo cáo thất bại"); }
        finally { lock.current = false; setActionLoading(false); }
    };
    const approveSelected = () => approveTargets(selectedIds, targets);
    const openRejectForSelected = () => { if (selectedIds.length && canReview) setRejectOpen(true); };
    const rejectSelected = async () => {
        if (lock.current || actionLoading || !selectedIds.length || !canReview) return;
        const reason = rejectReason === "Lý do khác" ? rejectDetail.trim() : [rejectReason, rejectDetail.trim()].filter(Boolean).join(": ");
        if (!reason) return showToast("Vui lòng nhập lý do từ chối");
        lock.current = true; setActionLoading(true);
        try { await rejectSelectedTempReports(targets, reason); showToast(`Đã từ chối ${selectedIds.length} báo cáo`, "success"); setRejectOpen(false); setRejectDetail(""); setSelectedIds([]); setSelectedDetail(null); await loadReports(); }
        catch (err: unknown) { showToast(axios.isAxiosError(err) ? err.response?.data?.message || "Từ chối báo cáo thất bại" : "Từ chối báo cáo thất bại"); }
        finally { lock.current = false; setActionLoading(false); }
    };

    const detail = editingDetail && editDraft ? editDraft : selectedDetail;
    const detailDefects = (detail?.defects || []).filter(item => Number(item.quantity) > 0);
    const detailDeductions = (detail?.deductions || []).filter(item => Number(item.hours) > 0);
    const detailTotal = Number(detail?.actual_output || 0);
    const detailOk = Number(detail?.tt_ok || 0);
    const detailNg = Number(detail?.tt_ng || 0);
    const detailRate = detailTotal > 0 ? (detailOk / detailTotal) * 100 : 0;
    const availableDefectOptions = defectOptions.filter(item => !(editDraft?.defects || []).some(saved => Number(saved.defect_type_id || saved.id) === Number(item.defect_type_id || item.id)));
    const availableDeductionOptions = deductionOptions.filter(item => !(editDraft?.deductions || []).some(saved => Number(saved.deduction_type_id || saved.id) === Number(item.deduction_type_id || item.id)));
    const rangeIsActive = (type: "year" | "month" | "week" | "day") => { const range = rangeFor(date, type); const current = dateRange || { dateFrom: date, dateTo: date }; return current.dateFrom === range.dateFrom && current.dateTo === range.dateTo; };

    const selectDay = () => { setDate(getToday()); setDateRange(null); };
    const selectMonth = () => setDateRange(rangeFor(date, "month"));
    const selectWeek = () => setDateRange(rangeFor(date, "week"));
    const selectYear = () => setDateRange(rangeFor(date, "year"));

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
            <section className="pending-kpis"><div role="button" tabIndex={0} className={`pending-kpi kpi-orange ${rangeIsActive("day") ? "is-active" : ""}`} onClick={selectDay}><span>Hôm nay</span><strong>{dayCount}</strong><small>Báo cáo chờ duyệt · Bấm để xem</small></div><div role="button" tabIndex={0} className={`pending-kpi kpi-slate ${rangeIsActive("week") ? "is-active" : ""}`} onClick={selectWeek}><span>Tuần này</span><strong>{weekCount}</strong><small>Báo cáo chờ duyệt · Bấm để xem</small></div><div role="button" tabIndex={0} className={`pending-kpi kpi-green ${rangeIsActive("month") ? "is-active" : ""}`} onClick={selectMonth}><span>Tháng này</span><strong>{monthCount}</strong><small>Báo cáo chờ duyệt · Bấm để xem</small></div><div role="button" tabIndex={0} className={`pending-kpi kpi-blue ${rangeIsActive("year") ? "is-active" : ""}`} onClick={selectYear}><span>Năm này</span><strong>{yearCount}</strong><small>Báo cáo chờ duyệt · Bấm để xem</small></div></section>
            {error && <div className="management-error">{error}</div>}
            <section className={`pending-workspace ${selectedDetail ? "detail-open" : "list-only"}`}>
                <div className="pending-list-card">
                    <div className="pending-list-tabs"><button type="button" className="pending-list-tab active">Danh sách báo cáo ({totalCount})</button></div>
                    {selectedIds.length > 0 && <div className="management-selected-info"><strong>Đã chọn {selectedIds.length} báo cáo.</strong><div className="management-selected-actions"><button type="button" onClick={() => setSelectedIds([])}>Bỏ chọn</button>{canReview && <><button type="button" className="selected-reject-action" onClick={openRejectForSelected} disabled={actionLoading}>Từ chối</button><button type="button" className="selected-approve-action" onClick={() => void approveSelected()} disabled={actionLoading}>Duyệt</button></>}</div></div>}
                    {loading ? <div className="management-empty">Đang tải...</div> : !reports.length ? <div className="pending-overdue-empty">Không có báo cáo phù hợp</div> : <div className="pending-table-wrap"><table className="pending-reference-table"><thead><tr><th className="select-col"><input type="checkbox" checked={allSelected} ref={element => { if (element) element.indeterminate = someSelected; }} onChange={togglePage} /></th><th>STT</th><th>Mã báo cáo</th><th>Công nhân</th><th>Công đoạn</th><th>Ca</th><th>Thời gian</th><th>Trạng thái</th></tr></thead><tbody>{reports.map((report, index) => { const id = Number(report.id); const selected = selectedSet.has(id); const active = Number(selectedDetail?.id) === id; return <tr key={report.id ?? index} className={`${selected ? "is-selected" : ""} ${active ? "pending-row-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => void openDetail(report)} title="Chọn báo cáo để xem chi tiết"><td className="select-col" onClick={event => event.stopPropagation()}><input type="checkbox" checked={selected} disabled={!id || actionLoading} onChange={() => toggleOne(id)} /></td><td>{(currentPage - 1) * 8 + index + 1}</td><td className="report-code">{reportCode(report, index)}</td><td><div className="worker-cell">{text(report.full_name)}<small>({text(report.worker_code)})</small></div></td><td>{text(report.process_name)}</td><td><span className="shift-chip">{text(report.shift)}</span></td><td><div className="date-cell"><strong>{formatDate(report.work_date)}</strong><small>{timeRange(report)}</small></div></td><td><span className="status-pill status-orange">Chờ duyệt</span></td></tr>; })}</tbody></table></div>}
                    <footer className="pending-table-footer"><span>Hiển thị {reports.length ? (currentPage - 1) * 8 + 1 : 0} đến {Math.min(currentPage * 8, totalCount)} của {totalCount} báo cáo</span><nav className="pending-pagination"><button disabled={currentPage === 1} onClick={() => setCurrentPage(page => Math.max(1, page - 1))}>‹</button>{Array.from({ length: Math.min(totalPages, 4) }, (_, index) => index + 1).map(page => <button key={page} className={currentPage === page ? "active" : ""} onClick={() => setCurrentPage(page)}>{page}</button>)}{totalPages > 4 && <button disabled>…</button>}<button disabled={currentPage === totalPages} onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}>›</button></nav></footer>
                </div>
                {selectedDetail && <aside className={`pending-detail-card ${editingDetail ? "is-editing" : ""}`}>
                    <header className="pending-detail-head"><div className="pending-detail-title"><h2>{editingDetail ? "Sửa báo cáo" : "Chi tiết báo cáo"}</h2><span className="pending-detail-status">Chờ duyệt</span></div><span className="pending-detail-code">Mã báo cáo: {reportCode(selectedDetail)}</span><button type="button" className="pending-detail-close" aria-label="Đóng chi tiết" onClick={() => { if (!editSaving) { setSelectedDetail(null); cancelInlineEdit(); } }}>×</button></header>
                    {detailLoading ? <div className="pending-detail-loading">Đang tải chi tiết...</div> : detail ? <>
                        <div className="pending-detail-body">
                            <section className="pending-detail-section"><h3>Thông tin chung</h3>{editingDetail ? <div className="pending-edit-grid"><label><span>Ngày báo cáo</span><input type="date" value={String(detail.work_date || "").slice(0, 10)} onChange={e => updateEditField("work_date", e.target.value)} /></label><label><span>Ca làm việc</span><select value={detail.shift || ""} onChange={e => updateEditField("shift", e.target.value)}><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option></select></label><label><span>Máy móc</span><input value={detail.machine_no || ""} onChange={e => updateEditField("machine_no", e.target.value)} /></label><label><span>Sản phẩm</span><input value={detail.product_name || ""} onChange={e => updateEditField("product_name", e.target.value)} /></label><label><span>Giờ làm thực tế</span><input type="number" min="0" max="24" step="1" value={editHours} onChange={e => { const value = e.target.value.replace(/\D/g, ""); setEditHours(value); }} /></label><label><span>Phút làm thực tế</span><input type="number" min="0" max="59" step="1" value={editMinutes} onChange={e => { const value = e.target.value.replace(/\D/g, ""); setEditMinutes(value); }} /></label><label><span>TT OK</span><input type="number" min="0" step="1" value={Number(detail.tt_ok || 0)} onChange={e => updateEditField("tt_ok", Math.max(0, Number(e.target.value) || 0))} /></label><label><span>TT NG</span><input type="number" value={(detail.defects || []).reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0)} readOnly /></label><label className="pending-edit-note"><span>Ghi chú</span><textarea value={detail.note || ""} onChange={e => updateEditField("note", e.target.value)} rows={3} placeholder="Ghi chú nếu có..." /></label></div> : <div className="pending-detail-grid"><div className="pending-detail-field"><span>Công nhân</span><strong>{text(detail.full_name)} ({text(detail.worker_code)})</strong></div><div className="pending-detail-field"><span>Ngày báo cáo</span><strong>{formatDate(detail.work_date)}</strong></div><div className="pending-detail-field"><span>Công đoạn</span><strong>{text(detail.process_name)}</strong></div><div className="pending-detail-field"><span>Thời gian làm việc</span><strong>{timeRange(detail)} ({number(detail.total_time)}h)</strong></div><div className="pending-detail-field"><span>Máy móc</span><strong>{text(detail.machine_no)}</strong></div><div className="pending-detail-field"><span>Sản phẩm</span><strong>{text(detail.product_name)}</strong></div><div className="pending-detail-field"><span>Ca làm việc</span><strong>{text(detail.shift)}</strong></div><div className="pending-detail-field"><span>Học việc</span><strong>{number(detail.training_percent ?? 100)}%</strong></div></div>}</section>
                            <section className="pending-detail-section"><h3>Kết quả sản xuất</h3><div className="pending-result-grid"><div className="pending-result-item"><span>Sản lượng OK</span><strong>{number(detailOk)}</strong></div><div className="pending-result-item ng"><span>Sản lượng NG</span><strong>{number(detailNg)}</strong></div><div className="pending-result-item total"><span>Tổng sản lượng</span><strong>{number(detailTotal)}</strong></div><div className="pending-result-item rate"><span>Tỷ lệ OK</span><strong>{detailRate.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%</strong></div></div></section>
                            <section className="pending-detail-section"><h3>Thông tin chi tiết</h3>{editingDetail ? <div className="pending-detail-edit-details">
                                <div className="pending-detail-edit-block"><div className="pending-detail-edit-heading"><strong>Chi tiết thời gian trừ</strong><span>{number((detail.deductions || []).reduce((sum, item) => sum + Number(item.hours || 0), 0) * 60)} phút</span></div>
                                    {editableDeductions.length ? <div className="pending-edit-grid">{editableDeductions.map((item, index) => <div className="pending-edit-detail-row" key={item.id || item.deduction_type_id || item.deduction_code || index}><label><span>{item.deduction_name || item.deduction_code || "Thời gian trừ"}</span><div className="pending-edit-number-with-unit"><input type="number" min="0" max="1440" step="1" value={minutesOf(item.hours)} onChange={e => updateDeduction(index, Number(e.target.value) || 0)} /><small>phút</small></div></label><button type="button" className="pending-detail-remove" onClick={() => removeDeduction(index)} title="Xóa khoản trừ">×</button></div>)}</div> : <p className="pending-history-empty">Chưa có khoản thời gian trừ.</p>}
                                    {availableDeductionOptions.length > 0 && <div className="pending-detail-add-row"><select defaultValue="" onChange={e => { addDeduction(Number(e.target.value)); e.currentTarget.value = ""; }}><option value="">+ Thêm khoản trừ</option>{availableDeductionOptions.map(item => <option key={Number(item.deduction_type_id || item.id)} value={Number(item.deduction_type_id || item.id)}>{item.deduction_name || item.deduction_code || "Khoản trừ"}</option>)}</select></div>}
                                </div>
                                <div className="pending-detail-edit-block"><div className="pending-detail-edit-heading"><strong>Chi tiết lỗi NG</strong><span>{number((detail.defects || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0))}</span></div>
                                    {editableDefects.length ? <div className="pending-edit-grid">{editableDefects.map((item, index) => <div className="pending-edit-detail-row" key={item.id || item.defect_type_id || item.defect_code || index}><label><span>{item.defect_name || item.defect_code || "Lỗi NG"}</span><input type="number" min="0" step="1" value={Number(item.quantity || 0)} onChange={e => updateDefect(index, Number(e.target.value) || 0)} /></label><button type="button" className="pending-detail-remove" onClick={() => removeDefect(index)} title="Xóa lỗi NG">×</button></div>)}</div> : <p className="pending-history-empty">Chưa có lỗi NG.</p>}
                                    {availableDefectOptions.length > 0 && <div className="pending-detail-add-row"><select defaultValue="" onChange={e => { addDefect(Number(e.target.value)); e.currentTarget.value = ""; }}><option value="">+ Thêm lỗi NG</option>{availableDefectOptions.map(item => <option key={Number(item.defect_type_id || item.id)} value={Number(item.defect_type_id || item.id)}>{item.defect_name || item.defect_code || "Lỗi NG"}</option>)}</select></div>}
                                </div>
                            </div> : <div className="pending-detail-info-grid"><div><div className="pending-detail-field"><span>Trừ giờ</span><strong>{number(detail.deduction_time)} giờ</strong></div>{detailDeductions.length > 0 && <div className="pending-defect-list">{detailDeductions.map(item => <span className="pending-defect" key={item.id || item.deduction_type_id || item.deduction_code}>{item.deduction_name}: {number(item.hours)}h</span>)}</div>}</div><div><div className="pending-detail-field"><span>Lý do NG</span><strong>{detailDefects.length ? detailDefects.map(item => `${item.defect_name}: ${number(item.quantity)}`).join(", ") : "---"}</strong></div></div></div>}{!editingDetail && <div className="pending-detail-field" style={{ marginTop: 12 }}><span>Ghi chú</span><strong>{text(detail.note)}</strong></div>}</section>
                            <section className="pending-detail-section"><h3>Lịch sử duyệt</h3><div className="pending-history-empty">◷ &nbsp; Chưa có lịch sử duyệt</div></section>
                        </div>
                        <footer className="pending-detail-actions" style={{ gridTemplateColumns: editingDetail ? (isLead ? "1fr 1.15fr 1.15fr" : "1fr 1fr") : isLead ? "1.35fr 1fr 1fr" : "1fr 1fr 1fr" }}>
                            {editingDetail ? isLead ? <><button type="button" className="pending-detail-cancel" onClick={cancelInlineEdit} disabled={editSaving}>Hủy</button><button type="button" className="pending-detail-save" onClick={() => void saveInlineEdit(false)} disabled={editSaving}>{editSaving ? "Đang lưu..." : "Lưu, chờ duyệt"}</button><button type="button" className="pending-detail-approve" onClick={() => void saveInlineEdit(true)} disabled={editSaving}>{editSaving ? "Đang xử lý..." : "Lưu & duyệt"}</button></> : <><button type="button" className="pending-detail-cancel" onClick={cancelInlineEdit} disabled={editSaving}>Hủy</button><button type="button" className="pending-detail-save" onClick={() => void saveInlineEdit(false)} disabled={editSaving}>{editSaving ? "Đang lưu..." : "Lưu thay đổi"}</button></> : <>{isLead && <button type="button" className="pending-detail-edit" onClick={() => void openProposal()} disabled={editSaving}>Đề xuất sửa</button>}{!isLead && canDirectEdit && <button type="button" className="pending-detail-edit" onClick={() => void startInlineEdit()} disabled={editSaving}>Sửa</button>}{canReview && <><button type="button" className="pending-detail-reject" onClick={() => { setSelectedIds([Number(selectedDetail.id)]); setRejectOpen(true); }} disabled={actionLoading}>Từ chối</button><button type="button" className="pending-detail-approve" onClick={() => void approveTargets([Number(selectedDetail.id)], [{ id: Number(selectedDetail.id), expected_updated_at: selectedDetail.updated_at || null }])} disabled={actionLoading}>Duyệt</button></>}</>}
                        </footer>
                    </> : null}
                </aside>}
            </section>
            {rejectOpen && <div className="selected-reject-backdrop" role="presentation" onMouseDown={() => !actionLoading && setRejectOpen(false)}><div className="selected-reject-modal" role="dialog" aria-modal="true" onMouseDown={event => event.stopPropagation}><h2>Từ chối báo cáo</h2><p>Báo cáo sẽ được trả lại cho công nhân kèm lý do.</p><label>Lý do<select value={rejectReason} onChange={event => setRejectReason(event.target.value)}>{REJECT_REASONS.map(reason => <option key={reason}>{reason}</option>)}</select></label><label>Chi tiết<textarea value={rejectDetail} onChange={event => setRejectDetail(event.target.value)} placeholder="Nội dung công nhân cần kiểm tra và sửa" rows={3} /></label><div className="selected-reject-actions"><button type="button" disabled={actionLoading} onClick={() => setRejectOpen(false)}>Hủy</button><button type="button" className="selected-review-reject" disabled={actionLoading} onClick={() => void rejectSelected()}>{actionLoading ? "Đang xử lý..." : "Xác nhận từ chối"}</button></div></div></div>}
        </div>
    );
}

export default Reports;
