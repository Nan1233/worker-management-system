import { useCallback, useEffect, useMemo, useState } from "react";
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
import "./Reports.css";

const ITEMS_PER_PAGE = 20;

type DateFilterMode =
    | "today"
    | "yesterday"
    | "week"
    | "currentMonth"
    | "month"
    | "range"
    | "all";

const toLocalDateString = (value: Date): string => {
    const offset = value.getTimezoneOffset();
    return new Date(value.getTime() - offset * 60_000)
        .toISOString()
        .split("T")[0];
};

const getToday = (): string => toLocalDateString(new Date());

const getDateRangeForMode = (
    mode: DateFilterMode,
    selectedMonth: string,
    dateFrom: string,
    dateTo: string
): { dateFrom?: string; dateTo?: string } => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (mode === "all") return {};
    if (mode === "range") {
        return {
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined
        };
    }
    if (mode === "month" && selectedMonth) {
        const [year, month] = selectedMonth.split("-").map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        return {
            dateFrom: `${selectedMonth}-01`,
            dateTo: `${selectedMonth}-${String(lastDay).padStart(2, "0")}`
        };
    }
    if (mode === "yesterday") {
        const value = new Date(today);
        value.setDate(value.getDate() - 1);
        const day = toLocalDateString(value);
        return { dateFrom: day, dateTo: day };
    }
    if (mode === "week") {
        const start = new Date(today);
        const day = start.getDay() || 7;
        start.setDate(start.getDate() - day + 1);
        return { dateFrom: toLocalDateString(start), dateTo: toLocalDateString(today) };
    }
    if (mode === "currentMonth") {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        return { dateFrom: toLocalDateString(start), dateTo: toLocalDateString(end) };
    }
    const day = toLocalDateString(today);
    return { dateFrom: day, dateTo: day };
};

const normalizeText = (value?: string | number | null): string =>
    String(value ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d");

const duplicateKey = (report: ProductionReport): string =>
    [
        String(report.work_date || "").slice(0, 10),
        report.worker_code,
        report.machine_no,
        report.product_name
    ]
        .map(normalizeText)
        .join("|");

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
    const [excelDbPreview, setExcelDbPreview] = useState<DesktopExcelDbSyncPreview | null>(null);
    const [error, setError] = useState("");
    const [searchKeyword, setSearchKeyword] = useState("");
    const [selectedShift, setSelectedShift] = useState("");
    const [selectedProcess, setSelectedProcess] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [reloadNonce, setReloadNonce] = useState(0);

    const activeDateRange = useMemo(
        () => getDateRangeForMode(dateMode, selectedMonth, dateFrom, dateTo),
        [dateMode, selectedMonth, dateFrom, dateTo]
    );

    const loadReports = useCallback(async () => {
        try {
            setLoading(true);
            setError("");
            const load = () => getApprovedReports({
                dateFrom: activeDateRange.dateFrom,
                dateTo: activeDateRange.dateTo
            });
            let data: ProductionReport[];
            try {
                data = await load();
            } catch (firstError) {
                const retryable = !axios.isAxiosError(firstError)
                    || !firstError.response
                    || firstError.response.status === 401
                    || firstError.response.status >= 500;
                if (!retryable) throw firstError;
                await new Promise(resolve => window.setTimeout(resolve, 800));
                data = await load();
            }
            const normalized = Array.isArray(data) ? data : [];
            setReports(normalized);
            setSelectedIds(previous => {
                const available = new Set(normalized.map(item => Number(item.id)).filter(id => id > 0));
                return previous.filter(id => available.has(id));
            });
        } catch (err: unknown) {
            console.error("GET APPROVED REPORTS ERROR:", err);
            setError(
                axios.isAxiosError(err)
                    ? err.response?.data?.message || "Không thể tải báo cáo đã duyệt"
                    : "Không thể tải báo cáo đã duyệt"
            );
            setReports([]);
            setSelectedIds([]);
        } finally {
            setLoading(false);
        }
    }, [activeDateRange.dateFrom, activeDateRange.dateTo]);

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

    const filteredReports = useMemo(() => {
        const keyword = normalizeText(searchKeyword);
        return reports.filter(report => {
            const searchable = normalizeText([
                report.worker_code,
                report.full_name,
                report.machine_no,
                report.product_name,
                report.process_name,
                report.shift
            ].join(" "));
            return (!keyword || searchable.includes(keyword))
                && (!selectedShift || report.shift === selectedShift)
                && (!selectedProcess || report.process_name === selectedProcess);
        });
    }, [reports, searchKeyword, selectedShift, selectedProcess]);

    useEffect(() => {
        queueMicrotask(() => setCurrentPage(1));
    }, [dateMode, selectedMonth, dateFrom, dateTo, searchKeyword, selectedShift, selectedProcess]);

    const totalPages = Math.max(1, Math.ceil(filteredReports.length / ITEMS_PER_PAGE));
    useEffect(() => {
        if (currentPage > totalPages) queueMicrotask(() => setCurrentPage(totalPages));
    }, [currentPage, totalPages]);

    const paginatedReports = useMemo(
        () => filteredReports.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
        [filteredReports, currentPage]
    );
    const currentPageIds = useMemo(
        () => paginatedReports.map(report => Number(report.id)).filter(id => Number.isInteger(id) && id > 0),
        [paginatedReports]
    );
    const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const selectedOnCurrentPageCount = currentPageIds.filter(id => selectedIdSet.has(id)).length;
    const isAllCurrentPageSelected = currentPageIds.length > 0 && selectedOnCurrentPageCount === currentPageIds.length;
    const isSomeCurrentPageSelected = selectedOnCurrentPageCount > 0 && !isAllCurrentPageSelected;

    const toggleSelectReport = (reportId: number) => {
        if (!Number.isInteger(reportId) || reportId <= 0) return;
        setSelectedIds(previous => previous.includes(reportId)
            ? previous.filter(id => id !== reportId)
            : [...previous, reportId]);
    };

    const toggleSelectCurrentPage = () => {
        setSelectedIds(previous => {
            const set = new Set(previous);
            if (isAllCurrentPageSelected) currentPageIds.forEach(id => set.delete(id));
            else currentPageIds.forEach(id => set.add(id));
            return Array.from(set);
        });
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
                showToast(result.message || `Đã cập nhật Excel toàn bộ báo cáo đã duyệt tháng ${excelMonth}.`);
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
            if (!preview.detected) showToast(`Không phát hiện thay đổi Excel trong tháng ${excelMonth}.`, "success");
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
        <div className="management-report-page">
            <div className="management-report-header">
                <div>
                    <h1>Báo cáo đã duyệt</h1>
                    <p>Lọc theo ngày, tháng hoặc khoảng thời gian. Phạm vi hiển thị không ảnh hưởng dữ liệu Excel tháng.</p>
                </div>
                <div className="management-report-count">
                    <strong>{filteredReports.length}</strong>
                    <span>báo cáo</span>
                </div>
            </div>

            <div className="management-filter-card approved-filter-card">
                <div className="management-search-box">
                    <span>⌕</span>
                    <input
                        value={searchKeyword}
                        onChange={event => setSearchKeyword(event.target.value)}
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
                            {exporting ? "Đang cập nhật Excel..." : `Cập nhật Excel ${excelMonth || "theo tháng"}`}
                        </button>
                    )}
                    {canExcelDbSync && window.ktcDesktop?.isDesktop && (
                        <button
                            type="button"
                            className="management-db-sync-button"
                            onClick={() => void handlePreviewExcelDbSync()}
                            disabled={loading || exporting || excelDbSyncing || !excelMonth}
                            title="Đọc các ô đã sửa trong Excel, xem trước thay đổi rồi cập nhật DB"
                        >
                            {excelDbSyncing ? "Đang kiểm tra Excel..." : "Cập nhật DB từ Excel"}
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
                                <p>Phát hiện <strong>{excelDbPreview.detected}</strong> báo cáo thay đổi trong tháng {excelMonth}. DB chưa bị thay đổi ở bước này.</p>
                            </div>
                            <button type="button" className="excel-db-preview-close" onClick={() => setExcelDbPreview(null)} disabled={excelDbSyncing}>×</button>
                        </header>
                        <div className="excel-db-preview-list">
                            {excelDbPreview.changes.map(change => (
                                <article key={`${change.source?.file || "file"}-${change.id}`} className="excel-db-preview-item">
                                    <div className="excel-db-preview-item-head">
                                        <strong>Báo cáo #{change.id}</strong>
                                        <span>{change.source?.process_code || "—"} · {change.source?.sheet || "—"}</span>
                                        <small>{change.source?.file || "Không rõ file"}</small>
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
                            <button type="button" className="management-db-sync-button" onClick={() => void handleApplyExcelDbSync()} disabled={excelDbSyncing}>
                                {excelDbSyncing ? "Đang cập nhật DB..." : `Xác nhận cập nhật ${excelDbPreview.detected} báo cáo`}
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
                                            <td>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</td>
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
                <div className="management-pagination">
                    <button disabled={currentPage === 1} onClick={() => setCurrentPage(page => page - 1)}>‹ Trước</button>
                    <span>Trang {currentPage}/{totalPages}</span>
                    <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(page => page + 1)}>Sau ›</button>
                </div>
            )}

            <div className="duplicate-note">
                <span /> Hàng màu đỏ: có từ hai báo cáo trùng đồng thời ngày, mã nhân viên, mã máy và mã sản phẩm.
            </div>
        </div>
    );
}
