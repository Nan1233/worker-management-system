import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
    approveSelectedTempReports,
    getPendingReports,
    getTempReportDetail,
    rejectSelectedTempReports,
} from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import { useToast } from "../../components/feedback/toastContext";
import { usePermissions } from "../../hooks/usePermissions";
import { getToday } from "./managerReportDateLogic";
import { getValidReportIds, reconcileSelectedReportIds, toggleCurrentPageIds, toggleReportId } from "./managerReportSelection";
import "./ReportsSplitReference.css";

const REJECT_REASONS = ["Báo cáo trùng", "Sai sản lượng", "Sai thời gian", "Sai máy hoặc sản phẩm", "Thiếu dữ liệu", "Lý do khác"];
const text = (value: unknown, fallback = "---") => value === undefined || value === null || value === "" ? fallback : String(value);
const reportCode = (report: ProductionReport, index: number) => `PR${String(report.work_date || "REPORT").slice(0, 10).replace(/-/g, "")}-${report.worker_code || String(report.id || index + 1).padStart(4, "0")}`;
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

function Reports() {
    const { can } = usePermissions();
    const canReview = can("REPORT_APPROVE");
    const { showToast } = useToast();

    const [date, setDate] = useState(getToday());
    const [searchKeyword, setSearchKeyword] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedProcess, setSelectedProcess] = useState("");
    const [selectedShift, setSelectedShift] = useState("");
    const [statusFilter] = useState("Chờ duyệt");
    const [tab, setTab] = useState<"all" | "overdue">("all");
    const [reports, setReports] = useState<ProductionReport[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [selectedDetail, setSelectedDetail] = useState<ProductionReport | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState("");
    const [rejectOpen, setRejectOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
    const [rejectDetail, setRejectDetail] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [overdueCount, setOverdueCount] = useState(0);
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
            setLoading(true);
            setError("");
            const result = await getPendingReports({
                dateFrom: date || undefined,
                dateTo: date || undefined,
                processName: selectedProcess || undefined,
                shift: selectedShift || undefined,
                search: searchQuery || undefined,
                page: currentPage,
                pageSize: 8,
            });
            if (request !== seq.current) return;
            setReports(result.data);
            setTotalCount(result.pagination.total);
            setTotalPages(result.pagination.total_pages);
            setOverdueCount(Number(result.previous_count || 0));
            setSelectedIds(previous => reconcileSelectedReportIds(previous, result.data));
        } catch (err: unknown) {
            if (request !== seq.current) return;
            setError(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể tải báo cáo chờ duyệt" : "Không thể tải báo cáo chờ duyệt");
            setReports([]);
            setTotalCount(0);
            setTotalPages(1);
            setOverdueCount(0);
            setSelectedIds([]);
        } finally {
            if (request === seq.current) setLoading(false);
        }
    }, [date, selectedProcess, selectedShift, searchQuery, currentPage]);

    useEffect(() => { void loadReports(); }, [loadReports]);
    useEffect(() => {
        setCurrentPage(1);
        setSelectedIds([]);
        setSelectedDetail(null);
    }, [date, selectedProcess, selectedShift, searchQuery]);

    const processes = useMemo(() => Array.from(new Set(reports.map(report => report.process_name).filter(Boolean) as string[])).sort(), [reports]);
    const shifts = useMemo(() => Array.from(new Set(reports.map(report => report.shift).filter(Boolean))).sort(), [reports]);
    const overdueOnPage = useMemo(() => reports.filter(report => String(report.work_date || "").slice(0, 10) < getToday()), [reports]);
    const visibleReports = tab === "overdue" ? overdueOnPage : reports;
    const pageIds = useMemo(() => getValidReportIds(visibleReports), [visibleReports]);
    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const targets = useMemo(() => reports.filter(report => selectedSet.has(Number(report.id))).map(report => ({ id: Number(report.id), expected_updated_at: report.updated_at || null })), [reports, selectedSet]);
    const allSelected = pageIds.length > 0 && pageIds.every(id => selectedSet.has(id));
    const someSelected = pageIds.some(id => selectedSet.has(id)) && !allSelected;

    const openDetail = async (report: ProductionReport) => {
        const id = Number(report.id);
        if (!id) return;
        setSelectedDetail(report);
        setDetailLoading(true);
        try {
            const detail = await getTempReportDetail(id);
            setSelectedDetail(detail);
        } catch (err) {
            showToast(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể tải chi tiết báo cáo" : "Không thể tải chi tiết báo cáo");
        } finally {
            setDetailLoading(false);
        }
    };

    const togglePage = () => setSelectedIds(previous => toggleCurrentPageIds(previous, pageIds, allSelected));
    const toggleOne = (id: number) => setSelectedIds(previous => toggleReportId(previous, id));

    const approveTargets = async (ids: number[], items: { id: number; expected_updated_at: string | null }[]) => {
        if (lock.current || actionLoading || !ids.length) return;
        if (!window.confirm(`Duyệt ${ids.length} báo cáo đã chọn?`)) return;
        lock.current = true;
        setActionLoading(true);
        try {
            await approveSelectedTempReports(items);
            showToast(`Đã duyệt ${ids.length} báo cáo`, "success");
            setSelectedIds(previous => previous.filter(id => !ids.includes(id)));
            if (selectedDetail && ids.includes(Number(selectedDetail.id))) setSelectedDetail(null);
            await loadReports();
        } catch (err: unknown) {
            showToast(axios.isAxiosError(err) ? err.response?.data?.message || "Duyệt báo cáo thất bại" : "Duyệt báo cáo thất bại");
        } finally {
            lock.current = false;
            setActionLoading(false);
        }
    };

    const approveOne = (report: ProductionReport) => approveTargets([Number(report.id)], [{ id: Number(report.id), expected_updated_at: report.updated_at || null }]);
    const approveSelected = () => approveTargets(selectedIds, targets);

    const rejectSelected = async () => {
        if (lock.current || actionLoading || !selectedIds.length) return;
        const reason = rejectReason === "Lý do khác" ? rejectDetail.trim() : [rejectReason, rejectDetail.trim()].filter(Boolean).join(": ");
        if (!reason) return showToast("Vui lòng nhập lý do từ chối");
        lock.current = true;
        setActionLoading(true);
        try {
            await rejectSelectedTempReports(targets, reason);
            showToast(`Đã từ chối ${selectedIds.length} báo cáo`, "success");
            setRejectOpen(false);
            setRejectDetail("");
            setSelectedIds([]);
            setSelectedDetail(null);
            await loadReports();
        } catch (err: unknown) {
            showToast(axios.isAxiosError(err) ? err.response?.data?.message || "Từ chối báo cáo thất bại" : "Từ chối báo cáo thất bại");
        } finally {
            lock.current = false;
            setActionLoading(false);
        }
    };

    const detailDefects = (selectedDetail?.defects || []).filter(item => Number(item.quantity) > 0);
    const detailDeductions = (selectedDetail?.deductions || []).filter(item => Number(item.hours) > 0);
    const detailTotal = Number(selectedDetail?.actual_output || 0);
    const detailOk = Number(selectedDetail?.tt_ok || 0);
    const detailNg = Number(selectedDetail?.tt_ng || 0);
    const detailRate = detailTotal > 0 ? (detailOk / detailTotal) * 100 : 0;

    return (
        <div className="management-report-page manager-page pending-reference-page">
            <header className="pending-page-title">
                <div>
                    <h1>Chờ duyệt báo cáo</h1>
                    <p>Xem chi tiết và duyệt các báo cáo sản xuất từ công nhân.</p>
                </div>
            </header>

            <section className="pending-filter-card">
                <div className="pending-search">
                    <span>⌕</span>
                    <input value={searchKeyword} onChange={event => setSearchKeyword(event.target.value)} placeholder="Tìm kiếm mã báo cáo, công nhân..." />
                </div>
                <label>
                    <span>Ngày báo cáo</span>
                    <input type="date" value={date} onChange={event => setDate(event.target.value)} />
                </label>
                <label>
                    <span>Công đoạn</span>
                    <select value={selectedProcess} onChange={event => setSelectedProcess(event.target.value)}>
                        <option value="">Tất cả</option>
                        {processes.map(process => <option key={process} value={process}>{process}</option>)}
                    </select>
                </label>
                <label>
                    <span>Ca làm việc</span>
                    <select value={selectedShift} onChange={event => setSelectedShift(event.target.value)}>
                        <option value="">Tất cả</option>
                        {shifts.map(shift => <option key={shift} value={shift}>{shift}</option>)}
                    </select>
                </label>
                <label>
                    <span>Trạng thái</span>
                    <select value={statusFilter} aria-label="Trạng thái" disabled>
                        <option value="Chờ duyệt">Chờ duyệt</option>
                    </select>
                </label>
                <button className="pending-refresh" type="button" onClick={() => void loadReports()}>⟳ <span>Làm mới</span></button>
            </section>

            <section className="pending-kpis">
                <div className="pending-kpi kpi-blue"><span>Tổng số báo cáo</span><strong>{totalCount}</strong><small>Báo cáo</small></div>
                <div className="pending-kpi kpi-slate"><span>Quá hạn duyệt</span><strong>{overdueCount}</strong><small>Báo cáo</small></div>
                <div className="pending-kpi kpi-green"><span>Đã duyệt hôm nay</span><strong>—</strong><small>Báo cáo</small></div>
            </section>

            {error && <div className="management-error">{error}</div>}

            <section className="pending-workspace">
                <div className="pending-list-card">
                    <div className="pending-list-tabs">
                        <button type="button" className={`pending-list-tab ${tab === "all" ? "active" : ""}`} onClick={() => setTab("all")}>Danh sách báo cáo ({totalCount})</button>
                        <button type="button" className={`pending-list-tab ${tab === "overdue" ? "active" : ""}`} onClick={() => setTab("overdue")}>Báo cáo quá hạn ({overdueCount}) <span className="tab-badge">{overdueCount}</span></button>
                    </div>

                    {selectedIds.length > 0 && (
                        <div className="management-selected-info"><strong>Đã chọn {selectedIds.length} báo cáo.</strong><button type="button" onClick={() => setSelectedIds([])}>Bỏ chọn</button></div>
                    )}

                    {loading ? <div className="management-empty">Đang tải...</div> : !visibleReports.length ? <div className="pending-overdue-empty">Không có báo cáo phù hợp</div> : (
                        <div className="pending-table-wrap">
                            <table className="pending-reference-table">
                                <thead><tr>
                                    <th className="select-col"><input type="checkbox" checked={allSelected} ref={element => { if (element) element.indeterminate = someSelected; }} onChange={togglePage} /></th>
                                    <th>STT</th><th>Mã báo cáo</th><th>Công nhân</th><th>Công đoạn</th><th>Ca</th><th>Thời gian</th><th>Trạng thái</th><th>Thao tác</th>
                                </tr></thead>
                                <tbody>
                                    {visibleReports.map((report, index) => {
                                        const id = Number(report.id);
                                        const selected = selectedSet.has(id);
                                        const active = Number(selectedDetail?.id) === id;
                                        return <tr key={report.id ?? index} className={`${selected ? "is-selected" : ""} ${active ? "pending-row-active" : ""}`}>
                                            <td className="select-col"><input type="checkbox" checked={selected} disabled={!id || actionLoading} onChange={() => toggleOne(id)} /></td>
                                            <td>{(currentPage - 1) * 8 + index + 1}</td>
                                            <td className="report-code">{reportCode(report, index)}</td>
                                            <td><div className="worker-cell">{text(report.full_name)}<small>({text(report.worker_code)})</small></div></td>
                                            <td>{text(report.process_name)}</td>
                                            <td><span className="shift-chip">{text(report.shift)}</span></td>
                                            <td><div className="date-cell"><strong>{formatDate(report.work_date)}</strong><small>{timeRange(report)}</small></div></td>
                                            <td><span className="status-pill status-orange">Chờ duyệt</span></td>
                                            <td className="actions-cell"><button type="button" className="icon-action view" title="Xem chi tiết" onClick={() => void openDetail(report)}>◉</button>{canReview && <button type="button" className="icon-action approve" title="Duyệt báo cáo" onClick={() => void approveOne(report)}>✓</button>}</td>
                                        </tr>;
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <footer className="pending-table-footer">
                        <span>Hiển thị {visibleReports.length ? (currentPage - 1) * 8 + 1 : 0} đến {Math.min(currentPage * 8, totalCount)} của {totalCount} báo cáo</span>
                        <nav className="pending-pagination">
                            <button disabled={currentPage === 1} onClick={() => setCurrentPage(page => Math.max(1, page - 1))}>‹</button>
                            {Array.from({ length: Math.min(totalPages, 4) }, (_, index) => index + 1).map(page => <button key={page} className={currentPage === page ? "active" : ""} onClick={() => setCurrentPage(page)}>{page}</button>)}
                            {totalPages > 4 && <button disabled>…</button>}
                            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}>›</button>
                        </nav>
                    </footer>
                </div>

                <aside className="pending-detail-card">
                    {!selectedDetail ? <div className="pending-detail-empty">Chọn một báo cáo trong danh sách để xem chi tiết.</div> : <>
                        <header className="pending-detail-head">
                            <div className="pending-detail-title"><h2>Chi tiết báo cáo</h2><span className="pending-detail-status">Chờ duyệt</span></div>
                            <span className="pending-detail-code">Mã báo cáo: {reportCode(selectedDetail, 0)}</span>
                            <button type="button" className="pending-detail-close" aria-label="Đóng chi tiết" onClick={() => setSelectedDetail(null)}>×</button>
                        </header>
                        {detailLoading ? <div className="pending-detail-loading">Đang tải chi tiết...</div> : <>
                            <div className="pending-detail-body">
                                <section className="pending-detail-section">
                                    <h3>Thông tin chung</h3>
                                    <div className="pending-detail-grid">
                                        <div className="pending-detail-field"><span>Công nhân</span><strong>{text(selectedDetail.full_name)} ({text(selectedDetail.worker_code)})</strong></div>
                                        <div className="pending-detail-field"><span>Ngày báo cáo</span><strong>{formatDate(selectedDetail.work_date)}</strong></div>
                                        <div className="pending-detail-field"><span>Công đoạn</span><strong>{text(selectedDetail.process_name)}</strong></div>
                                        <div className="pending-detail-field"><span>Thời gian làm việc</span><strong>{timeRange(selectedDetail)} ({number(selectedDetail.total_time)}h)</strong></div>
                                        <div className="pending-detail-field"><span>Máy móc</span><strong>{text(selectedDetail.machine_no)}</strong></div>
                                        <div className="pending-detail-field"><span>Sản phẩm</span><strong>{text(selectedDetail.product_name)}</strong></div>
                                        <div className="pending-detail-field"><span>Ca làm việc</span><strong>{text(selectedDetail.shift)}</strong></div>
                                        <div className="pending-detail-field"><span>Học việc</span><strong>{number(selectedDetail.training_percent ?? 100)}%</strong></div>
                                    </div>
                                </section>

                                <section className="pending-detail-section">
                                    <h3>Kết quả sản xuất</h3>
                                    <div className="pending-result-grid">
                                        <div className="pending-result-item"><span>Sản lượng OK</span><strong>{number(detailOk)}</strong></div>
                                        <div className="pending-result-item ng"><span>Sản lượng NG</span><strong>{number(detailNg)}</strong></div>
                                        <div className="pending-result-item total"><span>Tổng sản lượng</span><strong>{number(detailTotal)}</strong></div>
                                        <div className="pending-result-item rate"><span>Tỷ lệ OK</span><strong>{detailRate.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%</strong></div>
                                    </div>
                                </section>

                                <section className="pending-detail-section">
                                    <h3>Thông tin chi tiết</h3>
                                    <div className="pending-detail-info-grid">
                                        <div><div className="pending-detail-field"><span>Trừ giờ</span><strong>{number(selectedDetail.deduction_time)} giờ</strong></div>{detailDeductions.length > 0 && <div className="pending-defect-list">{detailDeductions.map(item => <span className="pending-defect" key={item.id || item.deduction_code}>{item.deduction_name}: {number(item.hours)}h</span>)}</div>}</div>
                                        <div><div className="pending-detail-field"><span>Lý do NG</span><strong>{detailDefects.length ? detailDefects.map(item => `${item.defect_name}: ${number(item.quantity)}`).join(", ") : "---"}</strong></div></div>
                                    </div>
                                    <div className="pending-detail-field" style={{ marginTop: 12 }}><span>Ghi chú</span><strong>{text(selectedDetail.note)}</strong></div>
                                </section>

                                <section className="pending-detail-section">
                                    <h3>Lịch sử duyệt</h3>
                                    <div className="pending-history-empty">◷ &nbsp; Chưa có lịch sử duyệt</div>
                                </section>
                            </div>
                            {canReview && <div className="pending-detail-actions"><button type="button" className="pending-detail-reject" onClick={() => { setSelectedIds([Number(selectedDetail.id)]); setRejectOpen(true); }}>× &nbsp; Từ chối</button><button type="button" className="pending-detail-approve" onClick={() => void approveOne(selectedDetail)}>✓ &nbsp; Duyệt báo cáo</button></div>}
                        </>}
                    </>}
                </aside>
            </section>

            {selectedIds.length > 1 && <div className="pending-bulk-actions"><button type="button" onClick={() => void approveSelected()} className="approve">Duyệt {selectedIds.length} báo cáo</button></div>}

            {rejectOpen && canReview && <div className="management-modal-backdrop" onMouseDown={() => !actionLoading && setRejectOpen(false)}><div className="management-modal" onMouseDown={event => event.stopPropagation()}><h2>Từ chối báo cáo</h2><p>{selectedIds.length} báo cáo sẽ được trả lại cho công nhân kèm lý do.</p><label>Lý do<select value={rejectReason} onChange={event => setRejectReason(event.target.value)}>{REJECT_REASONS.map(reason => <option key={reason}>{reason}</option>)}</select></label><label>Chi tiết<textarea value={rejectDetail} onChange={event => setRejectDetail(event.target.value)} rows={3} /></label><div className="management-modal-actions"><button type="button" onClick={() => setRejectOpen(false)}>Hủy</button><button type="button" className="management-reject-button" onClick={() => void rejectSelected()}>{actionLoading ? "Đang xử lý..." : "Xác nhận từ chối"}</button></div></div></div>}
        </div>
    );
}

export default Reports;
