import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

import {
    exportSelectedApprovedExcel,
    getApprovedReports
} from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import { useToast } from "../../components/feedback/toastContext";
import { getAccessToken, getStoredUser } from "../../utils/authStorage";
import { usePermissions } from "../../hooks/usePermissions";
import {
    getDateRangeForMode,
    getToday,
    type DateFilterMode,
} from "./managerReportDateLogic";
import { getManagerReportDuplicateKey as duplicateKey } from "./managerReportSearchLogic";
import { getManagerReportRowNumber } from "./managerReportPagination";
import {
    getValidReportIds,
    reconcileSelectedReportIds,
    toggleCurrentPageIds,
    toggleReportId,
} from "./managerReportSelection";
import {
    isRetryableManagerReportLoadError,
    waitForManagerReportRetry,
} from "./managerReportRetry";
const getAxiosErrorMessage = async (error: unknown): Promise<string | null> => {
    if (!axios.isAxiosError(error)) return null;
    const responseData = error.response?.data;
    if (responseData instanceof Blob) {
        try {
            const text = await responseData.text();
            if (text) {
                const parsed = JSON.parse(text) as { message?: string; error?: string };
                return parsed.message || parsed.error || null;
            }
        } catch {
            return null;
        }
    }
    if (responseData && typeof responseData === "object" && "message" in responseData) {
        return String(responseData.message || "");
    }
    return null;
};

export default function ApprovedReports() {
    const { can } = usePermissions();
    const canExport = can("REPORT_EXPORT");
    const canExcelDbSync = can("EXCEL_DB_SYNC");
    const { showToast } = useToast();
    const navigate = useNavigate();

    const [dateMode, setDateMode] = useState<DateFilterMode>("today");
    const [selectedMonth, setSelectedMonth] = useState("");
    const [dateFrom, setDateFrom] = useState(getToday());
    const [dateTo, setDateTo] = useState(getToday());
    const [excelMonth, setExcelMonth] = useState(getToday().slice(0, 7));

    const [reports, setReports] = useState<ProductionReport[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [excelDbSyncing, setExcelDbSyncing] = useState(false);
    const [excelDbBaselineMonth, setExcelDbBaselineMonth] = useState(() => sessionStorage.getItem("ktc:excel-db-baseline-month") || "");
    const [excelDbPreview, setExcelDbPreview] = useState<DesktopExcelDbSyncPreview | null>(null);
    const [reportImportPreview, setReportImportPreview] = useState<DesktopReportImportPreview | null>(null);
    const [reportImporting, setReportImporting] = useState(false);
    const [error, setError] = useState("");
    const [searchKeyword, setSearchKeyword] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedShift, setSelectedShift] = useState("");
    const [selectedProcess, setSelectedProcess] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const reportLoadSeqRef = useRef(0);
    const [reloadNonce, setReloadNonce] = useState(0);
    useEffect(() => {
        const timer = window.setTimeout(() => {
            setSearchQuery(searchKeyword.trim());
        }, 250);
        return () => window.clearTimeout(timer);
    }, [searchKeyword]);


    const activeDateRange = useMemo(
        () => getDateRangeForMode(dateMode, selectedMonth, dateFrom, dateTo),
        [dateMode, selectedMonth, dateFrom, dateTo]
    );

    const loadReports = useCallback(async () => {
        const requestSeq = ++reportLoadSeqRef.current;
        const isCurrentRequest = () => reportLoadSeqRef.current === requestSeq;
        try {
            setLoading(true);
            setError("");
            const load = () => getApprovedReports({
                dateFrom: activeDateRange.dateFrom,
                dateTo: activeDateRange.dateTo,
                shift: selectedShift || undefined,
                processName: selectedProcess || undefined,
                search: searchQuery || undefined,
                page: currentPage,
                pageSize: 20,
            });
            let result;
            try { result = await load(); } catch (firstError) {
                if (!isRetryableManagerReportLoadError(firstError)) throw firstError;
                await waitForManagerReportRetry();
                result = await load();
            }
            if (!isCurrentRequest()) return;
            setReports(result.data);
            setTotalCount(result.pagination.total);
            setTotalPages(result.pagination.total_pages);
            setSelectedIds(previous => reconcileSelectedReportIds(previous, result.data));
        } catch (err: unknown) {
            if (!isCurrentRequest()) return;
            console.error("GET APPROVED REPORTS ERROR:", err);
            setError(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể tải báo cáo đã duyệt" : "Không thể tải báo cáo đã duyệt");
            setReports([]); setTotalCount(0); setTotalPages(1); setSelectedIds([]);
        } finally {
            if (isCurrentRequest()) setLoading(false);
        }
    }, [activeDateRange.dateFrom, activeDateRange.dateTo, selectedShift, selectedProcess, searchQuery, currentPage]);

    useEffect(() => {
        const reload = () => setReloadNonce(value => value + 1);
        window.addEventListener("ktc:connection-restored", reload);
        return () => window.removeEventListener("ktc:connection-restored", reload);
    }, []);

    useEffect(() => {
        queueMicrotask(() => {
            setSelectedIds([]);
            void loadReports();
        });
    }, [loadReports, reloadNonce]);

    const processes = useMemo(
        () => Array.from(new Set(reports.map(item => item.process_name).filter(Boolean))).sort(),
        [reports]
    );

    const duplicateCounts = useMemo(() => {
        const counts = new Map<string, number>();
        reports.forEach(report => {
            if (!report.worker_code || !report.machine_no || !report.product_name) return;
            const key = duplicateKey(report);
            counts.set(key, (counts.get(key) ?? 0) + 1);
        });
        return counts;
    }, [reports]);

    useEffect(() => {
        queueMicrotask(() => { setCurrentPage(1); setSelectedIds([]); });
    }, [selectedShift, selectedProcess, dateMode, selectedMonth, dateFrom, dateTo, searchQuery]);

    const paginatedReports = reports;
    const currentPageIds = useMemo(
        () => getValidReportIds(paginatedReports),
        [paginatedReports]
    );
    const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const selectedOnCurrentPageCount = currentPageIds.filter(id => selectedIdSet.has(id)).length;
    const isAllCurrentPageSelected = currentPageIds.length > 0 && selectedOnCurrentPageCount === currentPageIds.length;
    const isSomeCurrentPageSelected = selectedOnCurrentPageCount > 0 && !isAllCurrentPageSelected;

    const toggleSelectReport = (reportId: number) => {
        setSelectedIds((previous) =>
            toggleReportId(previous, reportId)
        );
    };

    const toggleSelectCurrentPage = () => {
        setSelectedIds((previous) =>
            toggleCurrentPageIds(
                previous,
                currentPageIds,
                isAllCurrentPageSelected
            )
        );
    };

    const selectQuickDate = (mode: DateFilterMode) => {
        setDateMode(mode);
        setSelectedMonth("");
        if (mode !== "range") {
            const range = getDateRangeForMode(mode, "", dateFrom, dateTo);
            setDateFrom(range.dateFrom || "");
            setDateTo(range.dateTo || "");
        }
    };

    const handleViewSelectedDetails = () => {
        if (!selectedIds.length) {
            showToast("Vui lòng chọn ít nhất một báo cáo");
            return;
        }
        sessionStorage.setItem("selectedApprovedReportIds", JSON.stringify(selectedIds));
        const role = getStoredUser()?.role;
        const basePath = role === "lead" ? "/lead" : role === "admin" ? "/admin" : "/manager";
        navigate(`${basePath}/reports/review?source=approved`);
    };

    const handleExportExcel = async () => {
        if (exporting || !excelMonth) return;
        try {
            setExporting(true);
            const result = await exportSelectedApprovedExcel(`${excelMonth}-01`);
            if (result?.success) {
                sessionStorage.setItem("ktc:excel-db-baseline-month", excelMonth);
                setExcelDbBaselineMonth(excelMonth);
                setExcelDbPreview(null);
                showToast(result.message || `Bước 1 hoàn tất: Excel đã được cập nhật từ DB tháng ${excelMonth}. Bây giờ có thể sửa Excel rồi dùng Bước 2 để cập nhật lại DB.`);
            }
        } catch (err: unknown) {
            console.error("EXPORT APPROVED EXCEL ERROR:", err);
            if (axios.isAxiosError(err)) {
                if (err.response?.status === 401) {
                    showToast("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
                    return;
                }
                if (err.response?.status === 403) {
                    showToast("Tài khoản không có quyền cập nhật Excel.");
                    return;
                }
                showToast((await getAxiosErrorMessage(err)) || err.message || "Không thể cập nhật Excel");
                return;
            }
            showToast(err instanceof Error ? err.message : "Không thể cập nhật Excel");
        } finally {
            setExporting(false);
        }
    };

    const formatPreviewValue = (value: unknown): string => {
        if (value === null || value === undefined || value === "") return "—";
        if (Array.isArray(value) || typeof value === "object") {
            try { return JSON.stringify(value); } catch { return String(value); }
        }
        return String(value);
    };

    const handlePreviewExcelDbSync = async () => {
        if (excelDbSyncing || !excelMonth) return;
        if (excelDbBaselineMonth !== excelMonth) {
            showToast(`Hãy thực hiện Bước 1: Cập nhật Excel từ DB cho tháng ${excelMonth} trước khi cập nhật DB từ Excel.`, "warning");
            return;
        }
        if (!window.ktcDesktop?.isDesktop || typeof window.ktcDesktop.previewExcelDbSync !== "function") {
            showToast("Cập nhật DB từ Excel chỉ khả dụng trên ứng dụng Desktop.", "warning");
            return;
        }
        const token = getAccessToken() || "";
        if (!token) {
            showToast("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", "warning");
            return;
        }
        try {
            setExcelDbSyncing(true);
            const preview = await window.ktcDesktop.previewExcelDbSync(token, excelMonth);
            setExcelDbPreview(preview);
            if (preview.helperUpdateErrors?.length) {
                showToast(`Không thể tự bổ sung sheet TAY MÁY CẮT LỒNG cho ${preview.helperUpdateErrors.length} file. Hãy đóng Excel rồi thử lại.`, "warning");
            } else if (preview.helperUpdatedFiles?.length) {
                showToast(`Đã tự bổ sung dòng mới vào sheet TAY MÁY CẮT LỒNG. Hãy điền các thông tin còn thiếu rồi lưu file.`, "warning");
            } else if (!preview.detected) {
                showToast(`Không phát hiện thay đổi Excel trong tháng ${excelMonth}.`, "success");
            }
        } catch (err) {
            showToast(err instanceof Error ? err.message : "Không thể đọc thay đổi từ Excel", "error");
        } finally {
            setExcelDbSyncing(false);
        }
    };

    const handleApplyExcelDbSync = async () => {
        if (excelDbSyncing || !excelDbPreview?.detected) return;
        if (!window.ktcDesktop?.isDesktop || typeof window.ktcDesktop.applyExcelDbSync !== "function") return;
        const token = getAccessToken() || "";
        if (!token) return;
        try {
            setExcelDbSyncing(true);
            const result = await window.ktcDesktop.applyExcelDbSync(token, excelMonth);
            setExcelDbPreview(null);
            if (result.failed === 0) {
                sessionStorage.setItem("ktc:excel-db-baseline-month", excelMonth);
                setExcelDbBaselineMonth(excelMonth);
            }
            if (result.failed > 0) {
                showToast(`Excel → DB: ${result.succeeded} dòng thành công, ${result.failed} dòng cần kiểm tra.`, "warning");
            } else {
                showToast(`Đã cập nhật ${result.succeeded} báo cáo từ Excel vào DB.`, "success");
            }
            setReloadNonce(value => value + 1);
        } catch (err) {
            showToast(err instanceof Error ? err.message : "Không thể cập nhật DB từ Excel", "error");
        } finally {
            setExcelDbSyncing(false);
        }
    };


    const handlePreviewReportImport = async () => {
        if (reportImporting) return;
        if (!window.ktcDesktop?.isDesktop || typeof window.ktcDesktop.previewReportImport !== "function") {
            showToast("Import báo cáo chỉ khả dụng trên ứng dụng Desktop.", "warning");
            return;
        }
        const token = getAccessToken() || "";
        if (!token) {
            showToast("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", "warning");
            return;
        }
        try {
            setReportImporting(true);
            const preview = await window.ktcDesktop.previewReportImport(token);
            if (preview.canceled) return;
            setReportImportPreview(preview);
            if (!preview.detected) showToast("File không có dòng mới hoặc thay đổi cần import.", "success");
        } catch (err) {
            showToast(err instanceof Error ? err.message : "Không thể đọc file import", "error");
        } finally {
            setReportImporting(false);
        }
    };

    const handleApplyReportImport = async () => {
        if (reportImporting || !reportImportPreview?.detected || !reportImportPreview.filePath) return;
        if (!window.ktcDesktop?.isDesktop || typeof window.ktcDesktop.applyReportImport !== "function") return;
        const token = getAccessToken() || "";
        if (!token) return;
        try {
            setReportImporting(true);
            const result = await window.ktcDesktop.applyReportImport(token, reportImportPreview.filePath);
            setReportImportPreview(null);
            if (result.failed > 0) showToast(`Import: ${result.succeeded} dòng thành công, ${result.failed} dòng lỗi.`, "warning");
            else showToast(`Import thành công ${result.succeeded} báo cáo. DB là nguồn dữ liệu chính thức và Excel đã được dựng lại từ DB.`, "success");
            setReloadNonce(value => value + 1);
        } catch (err) {
            showToast(err instanceof Error ? err.message : "Không thể import báo cáo", "error");
        } finally {
            setReportImporting(false);
        }
    };

    const clearFilters = () => {
        setDateMode("today");
        setSelectedMonth("");
        setDateFrom(getToday());
        setDateTo(getToday());
        setSearchKeyword("");
        setSelectedShift("");
        setSelectedProcess("");
    };

    return (
        <div className="management-report-page poketto-manager-page">
            <div className="management-report-header">
                <div>
                    <h1>Báo cáo đã duyệt</h1>
                    <p>Lọc theo ngày, tháng hoặc khoảng thời gian. Phạm vi hiển thị không ảnh hưởng dữ liệu Excel tháng.</p>
                </div>
                <div className="management-report-count">
                    <strong>{totalCount}</strong>
                    <span>báo cáo</span>
                </div>
            </div>

            <div className="management-filter-card approved-filter-card">
                <div className="management-search-box">
                    <span>⌕</span>
                    <input
                        value={searchKeyword}
                        onChange={event => setSearchKeyword(event.target.value)}
                        aria-label="Tìm báo cáo đã duyệt"
                        placeholder="Tìm mã, tên công nhân, máy, sản phẩm..."
                    />
                </div>

                <div className="management-date-presets management-date-presets-full">
                    {[
                        ["today", "Hôm nay"],
                        ["yesterday", "Hôm qua"],
                        ["week", "Tuần này"],
                        ["currentMonth", "Tháng này"],
                        ["all", "Tất cả ngày"]
                    ].map(([mode, label]) => (
                        <button
                            key={mode}
                            type="button"
                            className={dateMode === mode ? "active" : ""}
                            onClick={() => selectQuickDate(mode as DateFilterMode)}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <label className="management-filter-field">
                    <span>Chọn tháng hiển thị</span>
                    <input
                        type="month"
                        value={selectedMonth}
                        onChange={event => {
                            setSelectedMonth(event.target.value);
                            setDateMode("month");
                            setDateFrom("");
                            setDateTo("");
                        }}
                    />
                </label>

                <label className="management-filter-field">
                    <span>Từ ngày</span>
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={event => {
                            setDateFrom(event.target.value);
                            setSelectedMonth("");
                            setDateMode("range");
                        }}
                    />
                </label>

                <label className="management-filter-field">
                    <span>Đến ngày</span>
                    <input
                        type="date"
                        min={dateFrom || undefined}
                        value={dateTo}
                        onChange={event => {
                            setDateTo(event.target.value);
                            setSelectedMonth("");
                            setDateMode("range");
                        }}
                    />
                </label>

                <label className="management-filter-field">
                    <span>Ca</span>
                    <select value={selectedShift} onChange={event => setSelectedShift(event.target.value)}>
                        <option value="">Tất cả ca</option>
                        <option value="A">Ca A</option>
                        <option value="B">Ca B</option>
                        <option value="C">Ca C</option>
                    </select>
                </label>

                <label className="management-filter-field">
                    <span>Công đoạn</span>
                    <select value={selectedProcess} onChange={event => setSelectedProcess(event.target.value)}>
                        <option value="">Tất cả công đoạn</option>
                        {processes.map(process => <option key={process} value={process}>{process}</option>)}
                    </select>
                </label>

                <div className="management-excel-month-panel">
                    <label className="management-filter-field management-month-filter">
                        <span>Tháng cập nhật Excel</span>
                        <input type="month" value={excelMonth} onChange={event => setExcelMonth(event.target.value)} />
                    </label>
                    <small>
                        Excel luôn lấy toàn bộ báo cáo <strong>đã duyệt</strong> trong tháng này, không phụ thuộc phạm vi dữ liệu đang hiển thị.
                    </small>
                </div>

                <div className="management-filter-actions">
                    <button type="button" className="management-clear-button" onClick={clearFilters}>Đặt lại bộ lọc</button>
                    <button
                        type="button"
                        className="management-view-selected-button"
                        onClick={handleViewSelectedDetails}
                        disabled={!selectedIds.length || loading || exporting}
                    >
                        Xem chi tiết ({selectedIds.length})
                    </button>
                    {canExport && (
                        <button
                            type="button"
                            className="management-export-button"
                            onClick={() => void handleExportExcel()}
                            disabled={loading || exporting || !excelMonth}
                        >
                            {exporting ? "Đang cập nhật Excel từ DB..." : `1. Cập nhật Excel từ DB · ${excelMonth || "theo tháng"}`}
                        </button>
                    )}
                    {canExcelDbSync && window.ktcDesktop?.isDesktop && (
                        <button
                            type="button"
                            className="management-db-sync-button"
                            onClick={() => void handlePreviewExcelDbSync()}
                            disabled={loading || exporting || excelDbSyncing || !excelMonth || excelDbBaselineMonth !== excelMonth}
                            title={excelDbBaselineMonth === excelMonth
                                ? "Bước 2: đọc các ô đã sửa trong Excel, xem trước thay đổi rồi cập nhật DB"
                                : `Cần hoàn tất Bước 1: Cập nhật Excel từ DB cho tháng ${excelMonth} trước`}
                        >
                            {excelDbSyncing ? "Đang kiểm tra Excel..." : "2. Cập nhật DB từ Excel"}
                        </button>
                    )}
                    {canExcelDbSync && window.ktcDesktop?.isDesktop && (
                        <button
                            type="button"
                            className="management-import-button"
                            onClick={() => void handlePreviewReportImport()}
                            disabled={loading || exporting || excelDbSyncing || reportImporting}
                            title="Chọn workbook KTC để xem trước rồi import báo cáo vào DB"
                        >
                            {reportImporting ? "Đang đọc file..." : "Import báo cáo Excel"}
                        </button>
                    )}
                </div>
            </div>

            {excelDbPreview && excelDbPreview.detected > 0 && (
                <div className="excel-db-preview-backdrop" role="presentation" onMouseDown={() => !excelDbSyncing && setExcelDbPreview(null)}>
                    <section className="excel-db-preview-modal" role="dialog" aria-modal="true" aria-label="Xem trước cập nhật DB từ Excel" onMouseDown={event => event.stopPropagation()}>
                        <header>
                            <div>
                                <h2>Xem trước cập nhật DB từ Excel</h2>
                                <p>Phát hiện <strong>{excelDbPreview.detected}</strong> dòng cần tạo/cập nhật trong tháng {excelMonth}. DB chưa bị thay đổi ở bước này.</p>
                            </div>
                            <button type="button" className="excel-db-preview-close" onClick={() => setExcelDbPreview(null)} disabled={excelDbSyncing}>×</button>
                        </header>
                        <div className="excel-db-preview-list">
                            {excelDbPreview.changes.map(change => (
                                <article key={`${change.source?.file || "file"}-${change.id ?? `new-${change.row || change.source?.row || 0}`}`} className={`excel-db-preview-item ${change.invalid ? "is-invalid" : ""}`}>
                                    <div className="excel-db-preview-item-head">
                                        <strong>{change.create ? `Báo cáo mới · dòng ${change.row || change.source?.row || "?"}` : `Báo cáo #${change.id}`}</strong>
                                        <span>{change.source?.process_code || "—"} · {change.source?.sheet || "—"}</span>
                                        <small>{change.source?.file || "Không rõ file"}</small>
                                        {change.invalid && <small className="excel-db-preview-error">{change.error || "Dòng mới chưa đủ dữ liệu"}</small>}
                                    </div>
                                    <div className="excel-db-diff-table">
                                        {(change.preview || []).map(diff => (
                                            <div className="excel-db-diff-row" key={`${change.id}-${diff.field}`}>
                                                <strong>{diff.label}</strong>
                                                <span className="excel-db-before">{formatPreviewValue(diff.before)}</span>
                                                <span className="excel-db-arrow">→</span>
                                                <span className="excel-db-after">{formatPreviewValue(diff.after)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </article>
                            ))}
                        </div>
                        <footer>
                            <button type="button" className="management-clear-button" onClick={() => setExcelDbPreview(null)} disabled={excelDbSyncing}>Hủy</button>
                            <button type="button" className="management-db-sync-button" onClick={() => void handleApplyExcelDbSync()} disabled={excelDbSyncing || excelDbPreview.changes.some(change => change.invalid)}>
                                {excelDbSyncing ? "Đang cập nhật DB..." : `Xác nhận ${excelDbPreview.detected} dòng`}
                            </button>
                        </footer>
                    </section>
                </div>
            )}

            {reportImportPreview && reportImportPreview.detected > 0 && (
                <div className="excel-db-preview-backdrop" role="presentation" onMouseDown={() => !reportImporting && setReportImportPreview(null)}>
                    <section className="excel-db-preview-modal" role="dialog" aria-modal="true" aria-label="Xem trước import báo cáo" onMouseDown={event => event.stopPropagation()}>
                        <header>
                            <div>
                                <h2>Import báo cáo vào DB</h2>
                                <p><strong>{reportImportPreview.fileName || "Workbook KTC"}</strong> · {reportImportPreview.creates || 0} tạo mới · {reportImportPreview.updates || 0} cập nhật. Chưa có dữ liệu nào bị ghi vào DB.</p>
                            </div>
                            <button type="button" className="excel-db-preview-close" onClick={() => setReportImportPreview(null)} disabled={reportImporting}>×</button>
                        </header>
                        <div className="excel-db-preview-list">
                            {reportImportPreview.changes.map(change => (
                                <article key={`import-${change.source?.file || "file"}-${change.id ?? `new-${change.row || change.source?.row || 0}`}`} className={`excel-db-preview-item ${change.invalid ? "is-invalid" : ""}`}>
                                    <div className="excel-db-preview-item-head">
                                        <strong>{change.create ? `Tạo mới · dòng ${change.row || change.source?.row || "?"}` : `Cập nhật báo cáo #${change.id}`}</strong>
                                        <span>{change.source?.process_code || "—"} · {change.source?.sheet || "—"}</span>
                                        {change.invalid && <small className="excel-db-preview-error">{change.error || "Dòng chưa hợp lệ"}</small>}
                                    </div>
                                    <div className="excel-db-diff-table">
                                        {(change.preview || []).map(diff => (
                                            <div className="excel-db-diff-row" key={`import-${change.id}-${diff.field}`}>
                                                <strong>{diff.label}</strong>
                                                <span className="excel-db-before">{formatPreviewValue(diff.before)}</span>
                                                <span className="excel-db-arrow">→</span>
                                                <span className="excel-db-after">{formatPreviewValue(diff.after)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </article>
                            ))}
                        </div>
                        <footer>
                            <button type="button" className="management-clear-button" onClick={() => setReportImportPreview(null)} disabled={reportImporting}>Hủy</button>
                            <button type="button" className="management-import-button" onClick={() => void handleApplyReportImport()} disabled={reportImporting || reportImportPreview.changes.some(change => change.invalid)}>
                                {reportImporting ? "Đang import..." : `Xác nhận import ${reportImportPreview.detected} dòng`}
                            </button>
                        </footer>
                    </section>
                </div>
            )}

            {selectedIds.length > 0 && (
                <div className="management-selected-info">
                    Đã chọn <strong>{selectedIds.length}</strong> báo cáo.
                    <button type="button" onClick={() => setSelectedIds([])} disabled={exporting}>Bỏ chọn tất cả</button>
                </div>
            )}

            {error && (
                <div className="management-error" role="alert">
                    <strong>Không thể tải đầy đủ dữ liệu.</strong>
                    <span>{error}</span>
                    <button type="button" onClick={() => void loadReports()}>Thử lại</button>
                </div>
            )}

            <div className="management-report-card">
                {loading ? (
                    <div className="management-empty">Đang tải...</div>
                ) : paginatedReports.length === 0 ? (
                    <div className="management-empty">Không có báo cáo phù hợp</div>
                ) : (
                    <div className="management-table-container">
                        <table className="management-report-table">
                            <thead>
                                <tr>
                                    <th className="management-checkbox-column">
                                        <input
                                            type="checkbox"
                                            checked={isAllCurrentPageSelected}
                                            ref={input => { if (input) input.indeterminate = isSomeCurrentPageSelected; }}
                                            onChange={toggleSelectCurrentPage}
                                            disabled={!currentPageIds.length || loading || exporting}
                                            aria-label="Chọn tất cả báo cáo trang hiện tại"
                                        />
                                    </th>
                                    <th>STT</th>
                                    <th>Mã NV</th>
                                    <th>Họ tên</th>
                                    <th>Công đoạn</th>
                                    <th>Ca</th>
                                    <th>Mã máy</th>
                                    <th>Mã sản phẩm</th>
                                    <th>Ngày</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedReports.map((report, index) => {
                                    const reportId = Number(report.id);
                                    const validReportId = Number.isInteger(reportId) && reportId > 0;
                                    const selected = validReportId && selectedIdSet.has(reportId);
                                    const duplicate = (duplicateCounts.get(duplicateKey(report)) ?? 0) > 1;
                                    return (
                                        <tr
                                            key={report.id ?? `${report.worker_code}-${index}`}
                                            className={[duplicate ? "duplicate-report-row" : "", selected ? "selected-report-row" : ""].filter(Boolean).join(" ")}
                                        >
                                            <td className="management-checkbox-column">
                                                <input
                                                    type="checkbox"
                                                    checked={selected}
                                                    disabled={!validReportId || exporting}
                                                    onChange={() => toggleSelectReport(reportId)}
                                                    aria-label={`Chọn báo cáo ${report.worker_code || reportId}`}
                                                />
                                            </td>
                                            <td>{getManagerReportRowNumber(currentPage, index)}</td>
                                            <td><strong>{report.worker_code || "---"}</strong></td>
                                            <td>{report.full_name || "---"}</td>
                                            <td>{report.process_name || "---"}</td>
                                            <td>{report.shift || "---"}</td>
                                            <td>{report.machine_no || "---"}</td>
                                            <td>{report.product_name || "---"}</td>
                                            <td>{String(report.work_date || "").slice(0, 10) || "---"}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {totalPages > 1 && (
                <nav className="management-pagination" aria-label="Phân trang báo cáo">
                    <button aria-label="Trang trước" disabled={currentPage === 1} onClick={() => setCurrentPage(page => page - 1)}>‹ Trước</button>
                    <span role="status">Trang {currentPage}/{totalPages}</span>
                    <button aria-label="Trang sau" disabled={currentPage === totalPages} onClick={() => setCurrentPage(page => page + 1)}>Sau ›</button>
                </nav>
            )}

            <div className="duplicate-note">
                <span /> Hàng màu đỏ: có từ hai báo cáo trùng đồng thời ngày, mã nhân viên, mã máy và mã sản phẩm.
            </div>
        </div>
    );
}
