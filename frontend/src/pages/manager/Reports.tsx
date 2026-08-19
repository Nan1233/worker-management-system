import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from "react";

import {
    useNavigate
} from "react-router-dom";

import axios from "axios";

import {
    approveSelectedTempReports,
    getPendingReports,
    rejectSelectedTempReports
} from "../../services/productionService";

import type {
    ProductionReport
} from "../../types/production";

import { useToast } from "../../components/feedback/toastContext";
import { getStoredUser } from "../../utils/authStorage";
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

const REJECT_REASONS = [
    "Báo cáo trùng",
    "Sai sản lượng",
    "Sai thời gian",
    "Sai máy hoặc sản phẩm",
    "Thiếu dữ liệu",
    "Lý do khác"
];

function Reports() {
    const { can } = usePermissions();
    const canReview = can("REPORT_APPROVE");

    const { showToast } = useToast();
    const navigate = useNavigate();

    const currentUser = getStoredUser();

    const basePath =
        currentUser?.role === "admin"
            ? "/admin"
            : currentUser?.role === "lead"
                ? "/lead"
                : "/manager";


    const [dateMode, setDateMode] = useState<DateFilterMode>("today");
    const [selectedMonth, setSelectedMonth] = useState("");
    const [dateFrom, setDateFrom] = useState(getToday());
    const [dateTo, setDateTo] = useState(getToday());

    const [
        reports,
        setReports
    ] = useState<ProductionReport[]>([]);

    const [
        selectedIds,
        setSelectedIds
    ] = useState<number[]>([]);

    const [
        loading,
        setLoading
    ] = useState(true);

    const [
        actionLoading,
        setActionLoading
    ] = useState(false);

    const [
        error,
        setError
    ] = useState("");

    const [rejectOpen, setRejectOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
    const [rejectDetail, setRejectDetail] = useState("");

    const [
        searchKeyword,
        setSearchKeyword
    ] = useState("");

    const [searchQuery, setSearchQuery] = useState("");

    const [
        selectedShift,
        setSelectedShift
    ] = useState("");

    const [
        selectedProcess,
        setSelectedProcess
    ] = useState("");

    const [
        currentPage,
        setCurrentPage
    ] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const reportLoadSeqRef = useRef(0);
    const actionLockRef = useRef(false);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setSearchQuery(searchKeyword.trim());
        }, 250);
        return () => window.clearTimeout(timer);
    }, [searchKeyword]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !actionLoading) {
                if (rejectOpen) setRejectOpen(false);
                else if (selectedIds.length) setSelectedIds([]);
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && canReview && selectedIds.length > 0 && !actionLoading) {
                event.preventDefault();
                void handleApproveSelected();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [actionLoading, canReview, rejectOpen, selectedIds.length]);


    // =====================================================
    // TẢI BÁO CÁO CHỜ DUYỆT THEO NGÀY HOẶC TOÀN BỘ
    // =====================================================

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
            const result = await getPendingReports({
                dateFrom: activeDateRange.dateFrom,
                dateTo: activeDateRange.dateTo,
                shift: selectedShift || undefined,
                processName: selectedProcess || undefined,
                search: searchQuery || undefined,
                page: currentPage,
                pageSize: 20,
            });
            if (!isCurrentRequest()) return;
            setReports(result.data);
            setTotalCount(result.pagination.total);
            setTotalPages(result.pagination.total_pages);
            setSelectedIds(previousIds => reconcileSelectedReportIds(previousIds, result.data));
        } catch (err: unknown) {
            if (!isCurrentRequest()) return;
            console.error("GET PENDING REPORTS ERROR:", err);
            const message = axios.isAxiosError(err)
                ? err.response?.data?.message || "Không thể tải báo cáo chờ duyệt"
                : "Không thể tải báo cáo chờ duyệt";
            setError(message);
            setReports([]);
            setTotalCount(0);
            setTotalPages(1);
            setSelectedIds([]);
        } finally {
            if (isCurrentRequest()) setLoading(false);
        }
    }, [activeDateRange.dateFrom, activeDateRange.dateTo, selectedShift, selectedProcess, searchQuery, currentPage]);

    useEffect(() => {
        queueMicrotask(() => {
            setSelectedIds([]);
            void loadReports();
        });
    }, [loadReports]);

    const previousDateCount = useMemo(() => {
        return reports.filter(report => String(report.work_date || "").slice(0, 10) < getToday()).length;
    }, [reports, dateMode]);

    // =====================================================
    // DANH SÁCH CÔNG ĐOẠN
    // =====================================================

    const processes = useMemo(
        () =>
            Array.from(
                new Set(
                    reports
                        .map(
                            item =>
                                item.process_name
                        )
                        .filter(
                            (
                                process
                            ): process is string =>
                                Boolean(process)
                        )
                )
            ).sort(),
        [reports]
    );


    // =====================================================
    // ĐẾM BÁO CÁO TRÙNG
    // NGÀY + MÃ NHÂN VIÊN + MÁY + SẢN PHẨM
    // =====================================================

    const duplicateCounts = useMemo(() => {
        const counts =
            new Map<string, number>();

        reports.forEach(report => {
            if (
                !report.worker_code ||
                !report.shift ||
                !report.machine_no ||
                !report.product_name
            ) {
                return;
            }

            const key =
                duplicateKey(report);

            counts.set(
                key,
                (counts.get(key) ?? 0) + 1
            );
        });

        return counts;
    }, [reports]);


    // Server đã áp dụng filter và pagination; trang chỉ render đúng snapshot trả về.
    useEffect(() => {
        queueMicrotask(() => {
            setCurrentPage(1);
            setSelectedIds([]);
        });
    }, [selectedShift, selectedProcess, dateMode, selectedMonth, dateFrom, dateTo, searchQuery]);

    const paginatedReports = reports;

    const currentPageIds = useMemo(
        () => getValidReportIds(paginatedReports),
        [paginatedReports]
    );


    const selectedIdSet = useMemo(
        () => new Set(selectedIds),
        [selectedIds]
    );

    const selectedReviewTargets = useMemo(
        () => reports
            .filter((report) => selectedIdSet.has(Number(report.id)))
            .map((report) => ({
                id: Number(report.id),
                expected_updated_at: report.updated_at || null
            })),
        [reports, selectedIdSet]
    );


    const selectedOnCurrentPageCount =
        currentPageIds.filter(
            id => selectedIdSet.has(id)
        ).length;


    const isAllCurrentPageSelected =
        currentPageIds.length > 0 &&
        selectedOnCurrentPageCount ===
            currentPageIds.length;


    const isSomeCurrentPageSelected =
        selectedOnCurrentPageCount > 0 &&
        !isAllCurrentPageSelected;


    // =====================================================
    // CHỌN MỘT BÁO CÁO
    // =====================================================

    const toggleSelectReport = (reportId: number) => {
        setSelectedIds((previousIds) =>
            toggleReportId(previousIds, reportId)
        );
    };


    // =====================================================
    // CHỌN TOÀN BỘ BÁO CÁO TRANG HIỆN TẠI
    // =====================================================

    const toggleSelectCurrentPage = () => {
        setSelectedIds((previousIds) =>
            toggleCurrentPageIds(
                previousIds,
                currentPageIds,
                isAllCurrentPageSelected
            )
        );
    };


    // =====================================================
    // XEM CHI TIẾT CÁC BÁO CÁO ĐÃ CHỌN
    // =====================================================

    const handleViewSelectedDetails = () => {
        if (selectedIds.length === 0) {
            showToast(
                "Vui lòng chọn ít nhất một báo cáo"
            );
            return;
        }

        sessionStorage.setItem(
            "selectedPendingReportIds",
            JSON.stringify(selectedIds)
        );

        navigate(
            `${basePath}/reports/review`
        );
    };


    // =====================================================
    // DUYỆT CÁC BÁO CÁO ĐÃ CHỌN
    // =====================================================

    const handleApproveSelected = async () => {
        if (actionLockRef.current || actionLoading) return;
        if (selectedIds.length === 0) {
            showToast(
                "Vui lòng chọn ít nhất một báo cáo"
            );
            return;
        }

        const confirmed =
            window.confirm(
                `Duyệt ${selectedIds.length} báo cáo đã chọn?`
            );

        if (!confirmed) {
            return;
        }

        actionLockRef.current = true;
        try {
            setActionLoading(true);

            await approveSelectedTempReports(
                selectedReviewTargets
            );

            showToast(`Đã duyệt ${selectedIds.length} báo cáo`, "success");

            setSelectedIds([]);

            sessionStorage.removeItem(
                "selectedPendingReportIds"
            );

            await loadReports();
        } catch (err: unknown) {
            console.error(
                "APPROVE SELECTED REPORTS ERROR:",
                err
            );

            const isStaleSelection =
                axios.isAxiosError(err) &&
                err.response?.status === 409 &&
                err.response?.data?.code === "APPROVAL_SELECTION_STALE";

            if (isStaleSelection) {
                setSelectedIds([]);
                sessionStorage.removeItem("selectedPendingReportIds");
                showToast("Danh sách chờ duyệt đã thay đổi. Đã tải lại, vui lòng chọn lại báo cáo.");
                await loadReports();
                return;
            }

            const message =
                axios.isAxiosError(err)
                    ? err.response?.data?.message ||
                      "Duyệt báo cáo thất bại"
                    : "Duyệt báo cáo thất bại";

            showToast(message);
        } finally {
            actionLockRef.current = false;
            setActionLoading(false);
        }
    };


    const handleRejectSelected = async () => {
        if (actionLockRef.current || actionLoading) return;
        if (selectedIds.length === 0) {
            showToast("Vui lòng chọn ít nhất một báo cáo");
            return;
        }

        const reason = rejectReason === "Lý do khác"
            ? rejectDetail.trim()
            : [rejectReason, rejectDetail.trim()].filter(Boolean).join(": ");

        if (!reason) {
            showToast("Vui lòng nhập lý do từ chối");
            return;
        }

        actionLockRef.current = true;
        try {
            setActionLoading(true);
            await rejectSelectedTempReports(selectedReviewTargets, reason);
            showToast(`Đã từ chối ${selectedIds.length} báo cáo`, "success");
            setRejectOpen(false);
            setRejectDetail("");
            setSelectedIds([]);
            sessionStorage.removeItem("selectedPendingReportIds");
            await loadReports();
        } catch (err: unknown) {
            console.error("REJECT SELECTED REPORTS ERROR:", err);
            const message = axios.isAxiosError(err)
                ? err.response?.data?.message || "Từ chối báo cáo thất bại"
                : "Từ chối báo cáo thất bại";
            showToast(message);
        } finally {
            actionLockRef.current = false;
            setActionLoading(false);
        }
    };

    // =====================================================
    // XÓA BỘ LỌC
    // =====================================================

    const clearFilters = () => {
        setSearchKeyword("");
        setSelectedShift("");
        setSelectedProcess("");
        setDateMode("today");
        setSelectedMonth("");
        setDateFrom(getToday());
        setDateTo(getToday());
    };

    const selectQuickDate = (mode: DateFilterMode) => {
        setDateMode(mode);
        setSelectedMonth("");
        if (mode !== "range") {
            setDateFrom("");
            setDateTo("");
        }
    };


    return (
        <div className="management-report-page poketto-manager-page">
            <div className="management-report-header">
                <div>
                    <h1>
                        Báo cáo chờ duyệt
                    </h1>

                    <p>
                        Chọn báo cáo để xem chi tiết,
                        sửa hoặc duyệt.
                    </p>
                </div>

                <div className="management-report-count">
                    <strong>
                        {totalCount}
                    </strong>

                    <span>
                        báo cáo
                    </span>
                </div>
            </div>


            <div className="management-filter-card">
                <div className="management-search-box">
                    <span>
                        ⌕
                    </span>

                    <input
                        value={searchKeyword}
                        onChange={event =>
                            setSearchKeyword(
                                event.target.value
                            )
                        }
                        aria-label="Tìm báo cáo chờ duyệt"
                        placeholder="Tìm mã, tên công nhân, máy, sản phẩm..."
                    />
                </div>


                <div className="management-date-presets">
                    {[ ["today", "Hôm nay"], ["yesterday", "Hôm qua"], ["week", "Tuần này"], ["currentMonth", "Tháng này"], ["all", "Tất cả ngày"] ].map(([mode, label]) => (
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
                    <span>Chọn tháng</span>
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
                        value={dateTo}
                        min={dateFrom || undefined}
                        onChange={event => {
                            setDateTo(event.target.value);
                            setSelectedMonth("");
                            setDateMode("range");
                        }}
                    />
                </label>


                <label className="management-filter-field">
                    <span>
                        Ca
                    </span>

                    <select
                        value={selectedShift}
                        onChange={event =>
                            setSelectedShift(
                                event.target.value
                            )
                        }
                    >
                        <option value="">
                            Tất cả ca
                        </option>

                        <option value="A">
                            Ca A
                        </option>

                        <option value="B">
                            Ca B
                        </option>

                        <option value="C">
                            Ca C
                        </option>
                        <option value="D">
                            Ca D
                        </option>
                    </select>
                </label>


                <label className="management-filter-field">
                    <span>
                        Công đoạn
                    </span>

                    <select
                        value={selectedProcess}
                        onChange={event =>
                            setSelectedProcess(
                                event.target.value
                            )
                        }
                    >
                        <option value="">
                            Tất cả công đoạn
                        </option>

                        {processes.map(
                            process => (
                                <option
                                    key={process}
                                    value={process}
                                >
                                    {process}
                                </option>
                            )
                        )}
                    </select>
                </label>


                <div className="management-filter-actions">
                    <button
                        type="button"
                        className="management-clear-button management-action-clear"
                        onClick={clearFilters}
                        disabled={
                            !searchKeyword &&
                            !selectedShift &&
                            !selectedProcess &&
                            dateMode === "today"
                        }
                    >
                        Xóa lọc
                    </button>
                    <button
                        type="button"
                        className="management-view-selected-button"
                        onClick={handleViewSelectedDetails}
                        disabled={
                            selectedIds.length === 0 ||
                            loading ||
                            actionLoading
                        }
                    >
                        Xem chi tiết ({selectedIds.length})
                    </button>

                    {canReview && <button
                        type="button"
                        className="management-reject-button"
                        onClick={() => setRejectOpen(true)}
                        disabled={
                            selectedIds.length === 0 ||
                            loading ||
                            actionLoading
                        }
                    >
                        Từ chối ({selectedIds.length})
                    </button>}

                    {canReview && <button
                        type="button"
                        className="management-approve-button"
                        onClick={handleApproveSelected}
                        disabled={
                            selectedIds.length === 0 ||
                            loading ||
                            actionLoading
                        }
                    >
                        {actionLoading ? "Đang xử lý..." : `Duyệt (${selectedIds.length})`}
                    </button>}
                </div>
            </div>


            {previousDateCount > 0 && (
                <div className="management-backlog-alert">
                    <strong>Còn {previousDateCount} báo cáo của ngày trước chưa được xử lý.</strong>
                    <span>Danh sách hiện đang hiển thị toàn bộ ngày để tránh bỏ sót.</span>
                </div>
            )}

            {selectedIds.length > 0 && (
                <div className="management-selected-info">
                    <span aria-live="polite">Đã chọn{" "}

                    <strong>
                        {selectedIds.length}
                    </strong>

                    {" "}báo cáo.</span>
                    <span className="management-shortcut-hint">Ctrl/⌘ + Enter: duyệt · Esc: bỏ chọn</span>

                    <button
                        type="button"
                        onClick={() =>
                            setSelectedIds([])
                        }
                    >
                        Bỏ chọn tất cả
                    </button>
                </div>
            )}


            {error && (
                <div className="management-error">
                    {error}
                </div>
            )}


            <div className="management-report-card">
                {loading ? (
                    <div className="management-empty">
                        Đang tải...
                    </div>
                ) : paginatedReports.length === 0 ? (
                    <div className="management-empty">
                        Không có báo cáo phù hợp
                    </div>
                ) : (
                    <div className="management-table-container">
                        <table className="management-report-table">
                            <thead>
                                <tr>
                                    <th className="management-checkbox-column">
                                        <input
                                            type="checkbox"
                                            checked={
                                                isAllCurrentPageSelected
                                            }
                                            ref={input => {
                                                if (input) {
                                                    input.indeterminate =
                                                        isSomeCurrentPageSelected;
                                                }
                                            }}
                                            onChange={
                                                toggleSelectCurrentPage
                                            }
                                            aria-label="Chọn tất cả báo cáo trang hiện tại"
                                            title="Chọn tất cả báo cáo trang hiện tại"
                                        />
                                    </th>

                                    <th>STT</th>
                                    <th>Mã NV</th>
                                    <th>Họ tên</th>
                                    <th>Công đoạn</th>
                                    <th>Ca</th>
                                    <th>Mã máy</th>
                                    <th>Mã sản phẩm</th>
                                </tr>
                            </thead>

                            <tbody>
                                {paginatedReports.map(
                                    (
                                        report,
                                        index
                                    ) => {
                                        const reportId =
                                            Number(
                                                report.id
                                            );

                                        const validReportId =
                                            Number.isInteger(
                                                reportId
                                            ) &&
                                            reportId > 0;

                                        const isSelected =
                                            validReportId &&
                                            selectedIdSet.has(
                                                reportId
                                            );

                                        const isDuplicate =
                                            (
                                                duplicateCounts.get(
                                                    duplicateKey(
                                                        report
                                                    )
                                                ) ?? 0
                                            ) > 1;

                                        const rowClassNames = [
                                            isDuplicate
                                                ? "duplicate-report-row"
                                                : "",
                                            isSelected
                                                ? "selected-report-row"
                                                : ""
                                        ]
                                            .filter(Boolean)
                                            .join(" ");

                                        return (
                                            <tr
                                                key={
                                                    report.id ??
                                                    `${report.worker_code}-${index}`
                                                }
                                                className={
                                                    rowClassNames
                                                }
                                                title={
                                                    isDuplicate
                                                        ? "Trùng ngày, mã nhân viên, mã máy và mã sản phẩm"
                                                        : undefined
                                                }
                                            >
                                                <td className="management-checkbox-column">
                                                    <input
                                                        type="checkbox"
                                                        checked={
                                                            isSelected
                                                        }
                                                        disabled={
                                                            !validReportId ||
                                                            actionLoading
                                                        }
                                                        onChange={() =>
                                                            toggleSelectReport(
                                                                reportId
                                                            )
                                                        }
                                                        aria-label={`Chọn báo cáo ${reportId}`}
                                                    />
                                                </td>

                                                <td>
                                                    {
                                                        getManagerReportRowNumber(
                                                            currentPage,
                                                            index
                                                        )
                                                    }
                                                </td>

                                                <td>
                                                    <strong>
                                                        {report.worker_code ||
                                                            "---"}
                                                    </strong>
                                                </td>

                                                <td>
                                                    {report.full_name ||
                                                        "---"}
                                                </td>

                                              
                                                <td>
                                                    {report.process_name ||
                                                        "---"}
                                                </td>

                                                <td>
                                                    {report.shift ||
                                                        "---"}
                                                </td>

                                                <td>
                                                    {report.machine_no ||
                                                        "---"}
                                                </td>

                                                <td>
                                                    {report.product_name ||
                                                        "---"}
                                                </td>
                                            </tr>
                                        );
                                    }
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>


            {totalPages > 1 && (
                <nav className="management-pagination" aria-label="Phân trang báo cáo">
                    <button
                        type="button"
                        aria-label="Trang trước"
                        disabled={
                            currentPage === 1
                        }
                        onClick={() =>
                            setCurrentPage(
                                page => page - 1
                            )
                        }
                    >
                        ‹ Trước
                    </button>

                    <span role="status">
                        Trang {currentPage}/
                        {totalPages}
                    </span>

                    <button
                        type="button"
                        aria-label="Trang sau"
                        disabled={
                            currentPage ===
                            totalPages
                        }
                        onClick={() =>
                            setCurrentPage(
                                page => page + 1
                            )
                        }
                    >
                        Sau ›
                    </button>
                </nav>
            )}


            {rejectOpen && canReview && (
                <div
                    className="management-modal-backdrop"
                    role="presentation"
                    onMouseDown={() => !actionLoading && setRejectOpen(false)}
                >
                    <div
                        className="management-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="reject-title"
                        onMouseDown={event => event.stopPropagation()}
                    >
                        <h2 id="reject-title">Từ chối báo cáo</h2>
                        <p>{selectedIds.length} báo cáo sẽ rời danh sách chờ và công nhân nhận được lý do.</p>
                        <label>
                            Lý do
                            <select
                                value={rejectReason}
                                onChange={event => setRejectReason(event.target.value)}
                            >
                                {REJECT_REASONS.map(reason => (
                                    <option key={reason} value={reason}>{reason}</option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Chi tiết
                            <textarea
                                value={rejectDetail}
                                onChange={event => setRejectDetail(event.target.value)}
                                placeholder="Có thể bổ sung nội dung công nhân cần sửa"
                                rows={3}
                            />
                        </label>
                        <div className="management-modal-actions">
                            <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => setRejectOpen(false)}
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                className="management-reject-button"
                                disabled={actionLoading}
                                onClick={() => void handleRejectSelected()}
                            >
                                {actionLoading ? "Đang xử lý..." : "Xác nhận từ chối"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="duplicate-note">
                <span />

                Hàng màu đỏ: có từ hai báo cáo trùng đồng thời ngày,
                mã nhân viên, mã máy và mã sản phẩm.
            </div>
        </div>
    );
}


export default Reports;