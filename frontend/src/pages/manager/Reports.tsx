import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { approveSelectedTempReports, getPendingReports, rejectSelectedTempReports } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import { useToast } from "../../components/feedback/toastContext";
import { getStoredUser } from "../../utils/authStorage";
import { usePermissions } from "../../hooks/usePermissions";
import { getDateRangeForMode, getToday, type DateFilterMode } from "./managerReportDateLogic";
import { getManagerReportDuplicateKey as duplicateKey } from "./managerReportSearchLogic";
import { getManagerReportRowNumber } from "./managerReportPagination";
import { getValidReportIds, reconcileSelectedReportIds, toggleCurrentPageIds, toggleReportId } from "./managerReportSelection";

const REJECT_REASONS = ["Báo cáo trùng", "Sai sản lượng", "Sai thời gian", "Sai máy hoặc sản phẩm", "Thiếu dữ liệu", "Lý do khác"];

type Extra = Record<string, string | number | boolean | null | undefined>;

function text(v: unknown, fallback = "---") {
    return v === undefined || v === null || v === "" ? fallback : String(v);
}

function reportCode(report: ProductionReport, index: number) {
    const date = String(report.work_date || "").slice(0, 10).replace(/-/g, "");
    const worker = report.worker_code || String(report.id || index + 1).padStart(4, "0");
    return `PR${date || "REPORT"}-${worker}`;
}

function teamName(report: ProductionReport) {
    const extra = (report.extra_data || {}) as Extra;
    return text(extra.team_name ?? extra.team ?? extra.group_name ?? extra.group ?? "Tổ 1", "Tổ 1");
}

function timeRange(report: ProductionReport) {
    const extra = (report.extra_data || {}) as Extra;
    const start = extra.start_time ?? extra.startTime ?? extra.from_time ?? extra.fromTime;
    const end = extra.end_time ?? extra.endTime ?? extra.to_time ?? extra.toTime;
    return start && end ? `${start} - ${end}` : "07:30 - 15:30";
}

function statusOf(report: ProductionReport) {
    if (report.status === "need_fix") return "Chờ duyệt lại";
    return "Chờ duyệt lần đầu";
}

function Reports() {
    const { can } = usePermissions();
    const canReview = can("REPORT_APPROVE");
    const { showToast } = useToast();
    const navigate = useNavigate();
    const currentUser = getStoredUser();
    const basePath = currentUser?.role === "admin" ? "/admin" : currentUser?.role === "lead" ? "/lead" : "/manager";

    const [dateMode, setDateMode] = useState<DateFilterMode>("today");
    const [selectedMonth, setSelectedMonth] = useState("");
    const [dateFrom, setDateFrom] = useState(getToday());
    const [dateTo, setDateTo] = useState(getToday());
    const [reports, setReports] = useState<ProductionReport[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState("");
    const [rejectOpen, setRejectOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
    const [rejectDetail, setRejectDetail] = useState("");
    const [searchKeyword, setSearchKeyword] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedShift, setSelectedShift] = useState("");
    const [selectedProcess, setSelectedProcess] = useState("");
    const [selectedStatus, setSelectedStatus] = useState("");
    const [selectedTeam, setSelectedTeam] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const reportLoadSeqRef = useRef(0);
    const actionLockRef = useRef(false);

    useEffect(() => {
        const timer = window.setTimeout(() => setSearchQuery(searchKeyword.trim()), 250);
        return () => window.clearTimeout(timer);
    }, [searchKeyword]);

    const activeDateRange = useMemo(() => getDateRangeForMode(dateMode, selectedMonth, dateFrom, dateTo), [dateMode, selectedMonth, dateFrom, dateTo]);

    const loadReports = useCallback(async () => {
        const requestSeq = ++reportLoadSeqRef.current;
        const current = () => reportLoadSeqRef.current === requestSeq;
        try {
            setLoading(true);
            setError("");
            const result = await getPendingReports({
                dateFrom: activeDateRange.dateFrom,
                dateTo: activeDateRange.dateTo,
                shift: selectedShift || undefined,
                processName: selectedProcess || undefined,
                search: searchQuery || undefined,
                page: currentPage,
                pageSize: 8,
            });
            if (!current()) return;
            setReports(result.data);
            setTotalCount(result.pagination.total);
            setTotalPages(result.pagination.total_pages);
            setSelectedIds(previous => reconcileSelectedReportIds(previous, result.data));
        } catch (err: unknown) {
            if (!current()) return;
            const message = axios.isAxiosError(err) ? err.response?.data?.message || "Không thể tải báo cáo chờ duyệt" : "Không thể tải báo cáo chờ duyệt";
            setError(message);
            setReports([]);
            setTotalCount(0);
            setTotalPages(1);
            setSelectedIds([]);
        } finally {
            if (current()) setLoading(false);
        }
    }, [activeDateRange.dateFrom, activeDateRange.dateTo, selectedShift, selectedProcess, searchQuery, currentPage]);

    useEffect(() => { void loadReports(); }, [loadReports]);
    useEffect(() => { setCurrentPage(1); setSelectedIds([]); }, [selectedShift, selectedProcess, selectedStatus, selectedTeam, dateMode, selectedMonth, dateFrom, dateTo, searchQuery]);

    const processes = useMemo(() => Array.from(new Set(reports.map(r => r.process_name).filter(Boolean) as string[])).sort(), [reports]);
    const teams = useMemo(() => Array.from(new Set(reports.map(teamName))).sort(), [reports]);
    const duplicateCounts = useMemo(() => {
        const map = new Map<string, number>();
        reports.forEach(report => map.set(duplicateKey(report), (map.get(duplicateKey(report)) ?? 0) + 1));
        return map;
    }, [reports]);

    const visibleReports = useMemo(() => reports.filter(report => {
        const statusOk = !selectedStatus || statusOf(report) === selectedStatus;
        const teamOk = !selectedTeam || teamName(report) === selectedTeam;
        return statusOk && teamOk;
    }), [reports, selectedStatus, selectedTeam]);

    const currentPageIds = useMemo(() => getValidReportIds(visibleReports), [visibleReports]);
    const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const selectedReviewTargets = useMemo(() => reports.filter(r => selectedIdSet.has(Number(r.id))).map(r => ({ id: Number(r.id), expected_updated_at: r.updated_at || null })), [reports, selectedIdSet]);
    const selectedOnCurrentPageCount = currentPageIds.filter(id => selectedIdSet.has(id)).length;
    const isAllCurrentPageSelected = currentPageIds.length > 0 && selectedOnCurrentPageCount === currentPageIds.length;
    const isSomeCurrentPageSelected = selectedOnCurrentPageCount > 0 && !isAllCurrentPageSelected;

    const firstPendingCount = reports.filter(r => r.status !== "need_fix").length;
    const reviewAgainCount = reports.filter(r => r.status === "need_fix").length;
    const overdueCount = reports.filter(r => String(r.work_date || "").slice(0, 10) < getToday()).length;
    const approvedToday = 0;

    const toggleSelectReport = (id: number) => setSelectedIds(previous => toggleReportId(previous, id));
    const toggleSelectCurrentPage = () => setSelectedIds(previous => toggleCurrentPageIds(previous, currentPageIds, isAllCurrentPageSelected));

    const handleViewReport = (id: number) => {
        sessionStorage.setItem("selectedPendingReportIds", JSON.stringify([id]));
        navigate(`${basePath}/reports/review`);
    };

    const handleViewSelectedDetails = () => {
        if (!selectedIds.length) return showToast("Vui lòng chọn ít nhất một báo cáo");
        sessionStorage.setItem("selectedPendingReportIds", JSON.stringify(selectedIds));
        navigate(`${basePath}/reports/review`);
    };

    const handleApproveSelected = async () => {
        if (actionLockRef.current || actionLoading) return;
        if (!selectedIds.length) return showToast("Vui lòng chọn ít nhất một báo cáo");
        if (!window.confirm(`Duyệt ${selectedIds.length} báo cáo đã chọn?`)) return;
        actionLockRef.current = true;
        try {
            setActionLoading(true);
            await approveSelectedTempReports(selectedReviewTargets);
            showToast(`Đã duyệt ${selectedIds.length} báo cáo`, "success");
            setSelectedIds([]);
            sessionStorage.removeItem("selectedPendingReportIds");
            await loadReports();
        } catch (err: unknown) {
            const message = axios.isAxiosError(err) ? err.response?.data?.message || "Duyệt báo cáo thất bại" : "Duyệt báo cáo thất bại";
            showToast(message);
            await loadReports();
        } finally { actionLockRef.current = false; setActionLoading(false); }
    };

    const handleApproveOne = async (report: ProductionReport) => {
        const id = Number(report.id);
        if (!canReview || !id || actionLockRef.current || actionLoading) return;
        if (!window.confirm(`Duyệt báo cáo ${reportCode(report, 0)}?`)) return;
        actionLockRef.current = true;
        try {
            setActionLoading(true);
            await approveSelectedTempReports([{ id, expected_updated_at: report.updated_at || null }]);
            showToast("Đã duyệt báo cáo", "success");
            setSelectedIds(previous => previous.filter(item => item !== id));
            await loadReports();
        } catch (err: unknown) {
            const message = axios.isAxiosError(err) ? err.response?.data?.message || "Duyệt báo cáo thất bại" : "Duyệt báo cáo thất bại";
            showToast(message);
        } finally { actionLockRef.current = false; setActionLoading(false); }
    };

    const handleRejectSelected = async () => {
        if (actionLockRef.current || actionLoading || !selectedIds.length) return;
        const reason = rejectReason === "Lý do khác" ? rejectDetail.trim() : [rejectReason, rejectDetail.trim()].filter(Boolean).join(": ");
        if (!reason) return showToast("Vui lòng nhập lý do từ chối");
        actionLockRef.current = true;
        try {
            setActionLoading(true);
            await rejectSelectedTempReports(selectedReviewTargets, reason);
            showToast(`Đã từ chối ${selectedIds.length} báo cáo`, "success");
            setRejectOpen(false); setRejectDetail(""); setSelectedIds([]);
            await loadReports();
        } catch (err: unknown) {
            const message = axios.isAxiosError(err) ? err.response?.data?.message || "Từ chối báo cáo thất bại" : "Từ chối báo cáo thất bại";
            showToast(message);
        } finally { actionLockRef.current = false; setActionLoading(false); }
    };

    const clearFilters = () => {
        setSearchKeyword(""); setSelectedShift(""); setSelectedProcess(""); setSelectedStatus(""); setSelectedTeam("");
        setDateMode("today"); setSelectedMonth(""); setDateFrom(getToday()); setDateTo(getToday());
    };

    const selectQuickDate = (mode: DateFilterMode) => {
        setDateMode(mode); setSelectedMonth("");
        if (mode !== "range") { setDateFrom(""); setDateTo(""); }
    };

    return <div className="management-report-page manager-page pending-reference-page">
        <header className="pending-page-title">
            <div><h1>Chờ duyệt</h1><p>Danh sách báo cáo sản xuất chờ duyệt</p></div>
        </header>

        <nav className="pending-tabs" aria-label="Loại báo cáo">
            <button className="active" type="button">Tất cả</button>
            <button type="button">Chờ duyệt lần đầu</button>
            <button type="button">Chờ duyệt lại</button>
        </nav>

        <section className="pending-filter-card">
            <div className="pending-search"><span>⌕</span><input value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)} placeholder="Tìm kiếm theo mã báo cáo, công nhân..." /></div>
            <label><span>Ngày báo cáo</span><input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setDateMode("range"); }} /></label>
            <label><span>Quy trình</span><select value={selectedProcess} onChange={e => setSelectedProcess(e.target.value)}><option value="">Tất cả</option>{processes.map(p => <option key={p}>{p}</option>)}</select></label>
            <label><span>Tổ/Nhóm</span><select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)}><option value="">Tất cả</option>{teams.map(t => <option key={t}>{t}</option>)}</select></label>
            <label><span>Trạng thái</span><select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}><option value="">Tất cả</option><option value="Chờ duyệt lần đầu">Chờ duyệt lần đầu</option><option value="Chờ duyệt lại">Chờ duyệt lại</option></select></label>
            <button className="pending-refresh" type="button" onClick={() => void loadReports()}>⟳ <span>Làm mới</span></button>
        </section>

        <section className="pending-kpis">
            <div className="pending-kpi kpi-blue"><span>Tổng số báo cáo</span><strong>{totalCount}</strong><small>Báo cáo</small></div>
            <div className="pending-kpi kpi-orange"><span>Chờ duyệt lần đầu</span><strong>{firstPendingCount}</strong><small>Báo cáo</small></div>
            <div className="pending-kpi kpi-red"><span>Chờ duyệt lại</span><strong>{reviewAgainCount}</strong><small>Báo cáo</small></div>
            <div className="pending-kpi kpi-slate"><span>Quá hạn duyệt</span><strong>{overdueCount}</strong><small>Báo cáo</small></div>
            <div className="pending-kpi kpi-green"><span>Đã duyệt hôm nay</span><strong>{approvedToday}</strong><small>Báo cáo</small></div>
        </section>

        {error && <div className="management-error">{error}</div>}
        {selectedIds.length > 0 && <div className="management-selected-info"><strong>Đã chọn {selectedIds.length} báo cáo.</strong><button type="button" onClick={() => setSelectedIds([])}>Bỏ chọn</button></div>}

        <section className="pending-table-card">
            {loading ? <div className="management-empty">Đang tải...</div> : visibleReports.length === 0 ? <div className="management-empty">Không có báo cáo phù hợp</div> : <div className="pending-table-wrap">
                <table className="pending-reference-table">
                    <thead><tr>
                        <th className="select-col"><input type="checkbox" checked={isAllCurrentPageSelected} ref={input => { if (input) input.indeterminate = isSomeCurrentPageSelected; }} onChange={toggleSelectCurrentPage} /></th>
                        <th>STT</th><th>Mã báo cáo</th><th>Công nhân</th><th>Quy trình</th><th>Tổ/Nhóm</th><th>Ngày báo cáo</th><th>Trạng thái</th><th>Thao tác</th>
                    </tr></thead>
                    <tbody>{visibleReports.map((report, index) => {
                        const id = Number(report.id); const selected = selectedIdSet.has(id); const duplicate = (duplicateCounts.get(duplicateKey(report)) ?? 0) > 1; const status = statusOf(report);
                        return <tr key={report.id ?? index} className={`${selected ? "is-selected" : ""} ${duplicate ? "is-duplicate" : ""}`}>
                            <td className="select-col"><input type="checkbox" checked={selected} disabled={!id || actionLoading} onChange={() => toggleSelectReport(id)} /></td>
                            <td>{getManagerReportRowNumber(currentPage, index)}</td>
                            <td className="report-code">{reportCode(report, index)}</td>
                            <td><div className="worker-cell">{text(report.full_name)}<small>({text(report.worker_code, "---")})</small></div></td>
                            <td>{text(report.process_name)}</td>
                            <td>{teamName(report)}</td>
                            <td><div className="date-cell">{String(report.work_date || "").slice(0, 10)}<small>{timeRange(report)}</small></div></td>
                            <td><span className={`status-pill ${status === "Chờ duyệt lại" ? "status-red" : "status-orange"}`}>{status}</span></td>
                            <td className="actions-cell"><button type="button" className="icon-action view" title="Xem chi tiết" onClick={() => handleViewReport(id)}>◉</button>{canReview && <button type="button" className="icon-action approve" title="Duyệt báo cáo" onClick={() => void handleApproveOne(report)}>✓</button>}</td>
                        </tr>;
                    })}</tbody>
                </table>
            </div>}
            <footer className="pending-table-footer">
                <span>Hiển thị {visibleReports.length ? ((currentPage - 1) * 8 + 1) : 0} đến {Math.min(currentPage * 8, totalCount)} của {totalCount} báo cáo</span>
                <nav className="pending-pagination" aria-label="Phân trang">
                    <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>‹</button>
                    {Array.from({ length: Math.min(totalPages, 4) }, (_, i) => i + 1).map(page => <button key={page} className={currentPage === page ? "active" : ""} onClick={() => setCurrentPage(page)}>{page}</button>)}
                    {totalPages > 4 && <button>…</button>}
                    <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>›</button>
                </nav>
            </footer>
        </section>

        {selectedIds.length > 0 && <div className="pending-bulk-actions"><button type="button" onClick={handleViewSelectedDetails}>Xem chi tiết</button>{canReview && <><button type="button" className="reject" onClick={() => setRejectOpen(true)}>Từ chối</button><button type="button" className="approve" onClick={() => void handleApproveSelected}>{actionLoading ? "Đang xử lý..." : "Duyệt"}</button></>}</div>}

        {rejectOpen && canReview && <div className="management-modal-backdrop" onMouseDown={() => !actionLoading && setRejectOpen(false)}><div className="management-modal" onMouseDown={e => e.stopPropagation()}><h2>Từ chối báo cáo</h2><p>{selectedIds.length} báo cáo sẽ rời danh sách chờ.</p><label>Lý do<select value={rejectReason} onChange={e => setRejectReason(e.target.value)}>{REJECT_REASONS.map(reason => <option key={reason}>{reason}</option>)}</select></label><label>Chi tiết<textarea value={rejectDetail} onChange={e => setRejectDetail(e.target.value)} rows={3} /></label><div className="management-modal-actions"><button type="button" onClick={() => setRejectOpen(false)}>Hủy</button><button type="button" className="management-reject-button" onClick={() => void handleRejectSelected}>{actionLoading ? "Đang xử lý..." : "Xác nhận từ chối"}</button></div></div></div>}
    </div>;
}

export default Reports;
