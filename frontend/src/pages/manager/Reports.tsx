import {
    useEffect,
    useMemo,
    useState
} from "react";

import {
    useNavigate
} from "react-router-dom";

import axios from "axios";

import {
    approveSelectedTempReports,
    getPendingReports
} from "../../services/productionService";

import type {
    ProductionReport
} from "../../types/production";

import { useToast } from "../../components/feedback/toastContext";

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

const getDateRangeForMode = (
    mode: DateFilterMode,
    selectedMonth: string,
    dateFrom: string,
    dateTo: string
): { dateFrom?: string; dateTo?: string } => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (mode === "all") return {};
    if (mode === "range") return { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined };

    if (mode === "month" && selectedMonth) {
        const [year, month] = selectedMonth.split("-").map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        return {
            dateFrom: `${selectedMonth}-01`,
            dateTo: `${selectedMonth}-${String(lastDay).padStart(2, "0")}`
        };
    }

    if (mode === "yesterday") {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const value = toLocalDateString(yesterday);
        return { dateFrom: value, dateTo: value };
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

    const value = toLocalDateString(today);
    return { dateFrom: value, dateTo: value };
};


// =====================================================
// LẤY NGÀY HIỆN TẠI THEO MÚI GIỜ LOCAL
// =====================================================

const getToday = (): string => {
    const now = new Date();

    const offset = now.getTimezoneOffset();

    return new Date(
        now.getTime() - offset * 60_000
    )
        .toISOString()
        .split("T")[0];
};


// =====================================================
// ĐỊNH DẠNG NGÀY
// =====================================================



// =====================================================
// CHUẨN HÓA CHUỖI TÌM KIẾM
// =====================================================

const normalizeText = (
    value?: string | number | null
): string =>
    String(value ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .replace(
            /đ/g,
            "d"
        );


// =====================================================
// TẠO KHÓA KIỂM TRA BÁO CÁO TRÙNG
// =====================================================

const duplicateKey = (
    report: ProductionReport
): string =>
    [
        String(report.work_date || "").slice(0, 10),
        report.worker_code,
        report.machine_no,
        report.product_name
    ]
        .map(normalizeText)
        .join("|");


function Reports() {
    const { showToast } = useToast();
    const navigate = useNavigate();

    const savedUser =
        localStorage.getItem("user");

    const currentUser = savedUser
        ? JSON.parse(savedUser)
        : null;

    const basePath =
        currentUser?.role === "lead"
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

    const [
        searchKeyword,
        setSearchKeyword
    ] = useState("");

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


    // =====================================================
    // TẢI BÁO CÁO CHỜ DUYỆT THEO NGÀY HOẶC TOÀN BỘ
    // =====================================================

    const activeDateRange = useMemo(
        () => getDateRangeForMode(dateMode, selectedMonth, dateFrom, dateTo),
        [dateMode, selectedMonth, dateFrom, dateTo]
    );

    const loadReports = async () => {
        try {
            setLoading(true);
            setError("");

            const data = await getPendingReports({
                dateFrom: activeDateRange.dateFrom,
                dateTo: activeDateRange.dateTo
            });

            const normalizedReports = Array.isArray(data) ? data : [];
            setReports(normalizedReports);

            setSelectedIds(previousIds => {
                const availableIds = new Set(
                    normalizedReports
                        .map(item => Number(item.id))
                        .filter(id => Number.isInteger(id) && id > 0)
                );
                return previousIds.filter(id => availableIds.has(id));
            });
        } catch (err: unknown) {
            console.error("GET PENDING REPORTS ERROR:", err);
            const message = axios.isAxiosError(err)
                ? err.response?.data?.message || "Không thể tải báo cáo chờ duyệt"
                : "Không thể tải báo cáo chờ duyệt";
            setError(message);
            setReports([]);
            setSelectedIds([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        queueMicrotask(() => {
            setSelectedIds([]);
            void loadReports();
        });
    }, [activeDateRange.dateFrom, activeDateRange.dateTo]);

    const previousDateCount = useMemo(() => {
        if (dateMode !== "all") return 0;
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


    // =====================================================
    // LỌC BÁO CÁO
    // =====================================================

    const filteredReports = useMemo(() => {
        const keyword =
            normalizeText(searchKeyword);

        return reports.filter(report => {
            const searchableText =
                normalizeText(
                    [
                        report.worker_code,
                        report.full_name,
                        report.machine_no,
                        report.product_name,
                        report.process_name,
                        report.shift
                    ].join(" ")
                );

            const matchesKeyword =
                !keyword ||
                searchableText.includes(keyword);

            const matchesShift =
                !selectedShift ||
                report.shift === selectedShift;

            const matchesProcess =
                !selectedProcess ||
                report.process_name ===
                    selectedProcess;

            return (
                matchesKeyword &&
                matchesShift &&
                matchesProcess
            );
        });
    }, [
        reports,
        searchKeyword,
        selectedShift,
        selectedProcess
    ]);


    useEffect(() => {
        queueMicrotask(() => setCurrentPage(1));
    }, [
        searchKeyword,
        selectedShift,
        selectedProcess,
        dateMode,
        selectedMonth,
        dateFrom,
        dateTo
    ]);


    // =====================================================
    // PHÂN TRANG
    // =====================================================

    const totalPages = Math.max(
        1,
        Math.ceil(
            filteredReports.length /
                ITEMS_PER_PAGE
        )
    );


    useEffect(() => {
        if (currentPage > totalPages) {
            queueMicrotask(() => setCurrentPage(totalPages));
        }
    }, [
        currentPage,
        totalPages
    ]);


    const paginatedReports = useMemo(
        () =>
            filteredReports.slice(
                (
                    currentPage - 1
                ) * ITEMS_PER_PAGE,
                currentPage * ITEMS_PER_PAGE
            ),
        [
            filteredReports,
            currentPage
        ]
    );


    const currentPageIds = useMemo(
        () =>
            paginatedReports
                .map(
                    report =>
                        Number(report.id)
                )
                .filter(
                    id =>
                        Number.isInteger(id) &&
                        id > 0
                ),
        [paginatedReports]
    );


    const selectedIdSet = useMemo(
        () => new Set(selectedIds),
        [selectedIds]
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

    const toggleSelectReport = (
        reportId: number
    ) => {
        if (
            !Number.isInteger(reportId) ||
            reportId <= 0
        ) {
            return;
        }

        setSelectedIds(previousIds => {
            if (
                previousIds.includes(reportId)
            ) {
                return previousIds.filter(
                    id => id !== reportId
                );
            }

            return [
                ...previousIds,
                reportId
            ];
        });
    };


    // =====================================================
    // CHỌN TOÀN BỘ BÁO CÁO TRANG HIỆN TẠI
    // =====================================================

    const toggleSelectCurrentPage = () => {
        setSelectedIds(previousIds => {
            const previousSet =
                new Set(previousIds);

            if (isAllCurrentPageSelected) {
                currentPageIds.forEach(
                    id => previousSet.delete(id)
                );
            } else {
                currentPageIds.forEach(
                    id => previousSet.add(id)
                );
            }

            return Array.from(previousSet);
        });
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

        try {
            setActionLoading(true);

            await approveSelectedTempReports(
                selectedIds
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

            const message =
                axios.isAxiosError(err)
                    ? err.response?.data?.message ||
                      "Duyệt báo cáo thất bại"
                    : "Duyệt báo cáo thất bại";

            showToast(message);
        } finally {
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
        <div className="management-report-page">
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
                        {filteredReports.length}
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


                <button
                    type="button"
                    className="management-clear-button"
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


                <div className="management-filter-actions">
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

                    <button
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
                    </button>
                </div>
            </div>


            {dateMode === "all" && previousDateCount > 0 && (
                <div className="management-backlog-alert">
                    <strong>Còn {previousDateCount} báo cáo của ngày trước chưa được xử lý.</strong>
                    <span>Danh sách hiện đang hiển thị toàn bộ ngày để tránh bỏ sót.</span>
                </div>
            )}

            {selectedIds.length > 0 && (
                <div className="management-selected-info">
                    Đã chọn{" "}

                    <strong>
                        {selectedIds.length}
                    </strong>

                    {" "}báo cáo.

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
                                                        (
                                                            currentPage -
                                                            1
                                                        ) *
                                                            ITEMS_PER_PAGE +
                                                        index +
                                                        1
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
                <div className="management-pagination">
                    <button
                        type="button"
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

                    <span>
                        Trang {currentPage}/
                        {totalPages}
                    </span>

                    <button
                        type="button"
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