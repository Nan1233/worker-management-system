import {
    useEffect,
    useMemo,
    useState
} from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

import {
    exportSelectedApprovedExcel,
    getApprovedReportsByDate
} from "../../services/productionService";
import type { ProductionReport } from "../../types/production";

import { useToast } from "../../components/feedback/toastContext";

import "./Reports.css";

const ITEMS_PER_PAGE = 20;

const getToday = (): string => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    return new Date(now.getTime() - offset * 60_000)
        .toISOString()
        .split("T")[0];
};



const normalizeText = (value?: string): string =>
    String(value ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d");

const duplicateKey = (
    report: ProductionReport
): string =>
    [
        report.worker_code,
        report.shift,
        report.machine_no,
        report.product_name
    ]
        .map(normalizeText)
        .join("|");

function ApprovedReports() {
    const { showToast } = useToast();
    const navigate = useNavigate();

    const [date, setDate] =
        useState(getToday());

    const [reports, setReports] =
        useState<ProductionReport[]>([]);

    const [selectedIds, setSelectedIds] =
        useState<number[]>([]);

    const [loading, setLoading] =
        useState(true);

    const [exporting, setExporting] =
        useState(false);

    const [error, setError] =
        useState("");

    const [searchKeyword, setSearchKeyword] =
        useState("");

    const [selectedShift, setSelectedShift] =
        useState("");

    const [selectedProcess, setSelectedProcess] =
        useState("");

    const [currentPage, setCurrentPage] =
        useState(1);

    useEffect(() => {
    const loadReports = async () => {
        try {
            setLoading(true);
            setError("");

            const data =
                await getApprovedReportsByDate(
                    date
                );

            const normalizedReports =
                Array.isArray(data)
                    ? data
                    : [];

            setReports(normalizedReports);

            setSelectedIds(previousIds => {
                const availableIds =
                    new Set(
                        normalizedReports
                            .map(item =>
                                Number(item.id)
                            )
                            .filter(
                                id =>
                                    Number.isInteger(id) &&
                                    id > 0
                            )
                    );

                return previousIds.filter(
                    id =>
                        availableIds.has(id)
                );
            });
        } catch (err: unknown) {
            console.error(
                "GET APPROVED REPORTS ERROR:",
                err
            );

            const message =
                axios.isAxiosError(err)
                    ? err.response?.data?.message ||
                      "Không thể tải báo cáo đã duyệt"
                    : "Không thể tải báo cáo đã duyệt";

            setError(message);
            setReports([]);
            setSelectedIds([]);
        } finally {
            setLoading(false);
        }
    };

    queueMicrotask(() => setSelectedIds([]));

    void loadReports();
}, [date]);

    const processes = useMemo(
        () => Array.from(new Set(reports.map(item => item.process_name).filter(Boolean))).sort(),
        [reports]
    );

const duplicateCounts = useMemo(() => {
    const counts = new Map<string, number>();

    reports.forEach(report => {
        if (
            !report.worker_code ||
            !report.shift ||
            !report.machine_no ||
            !report.product_name
        ) {
            return;
        }

        const key = duplicateKey(report);

        counts.set(
            key,
            (counts.get(key) ?? 0) + 1
        );
    });

    return counts;
}, [reports]);

    const filteredReports = useMemo(() => {
        const keyword = normalizeText(searchKeyword);
        return reports.filter(report => {
            const searchableText = normalizeText([
                report.worker_code,
                report.full_name,
                report.machine_no,
                report.product_name,
                report.process_name,
                report.shift
            ].join(" "));

            return (
                (!keyword || searchableText.includes(keyword)) &&
                (!selectedShift || report.shift === selectedShift) &&
                (!selectedProcess || report.process_name === selectedProcess)
            );
        });
    }, [reports, searchKeyword, selectedShift, selectedProcess]);

    useEffect(() => {
        queueMicrotask(() => setCurrentPage(1));
    }, [date, searchKeyword, selectedShift, selectedProcess]);

    const totalPages = Math.max(1, Math.ceil(filteredReports.length / ITEMS_PER_PAGE));
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
// =====================================================
// DANH SÁCH ID TRANG HIỆN TẠI
// =====================================================

const currentPageIds = useMemo(
    () =>
        paginatedReports
            .map(report =>
                Number(report.id)
            )
            .filter(
                id =>
                    Number.isInteger(id) &&
                    id > 0
            ),
    [paginatedReports]
);


// =====================================================
// SET ID ĐÃ CHỌN
// =====================================================

const selectedIdSet = useMemo(
    () => new Set(selectedIds),
    [selectedIds]
);


// =====================================================
// KIỂM TRA CHECKBOX CHỌN TẤT CẢ
// =====================================================

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
// CHỌN TẤT CẢ BÁO CÁO TRANG HIỆN TẠI
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
const handleViewSelectedDetails = () => {
    if (selectedIds.length === 0) {
        showToast("Vui lòng chọn ít nhất một báo cáo");
        return;
    }

    sessionStorage.setItem(
        "selectedApprovedReportIds",
        JSON.stringify(selectedIds)
    );

    const savedUser = localStorage.getItem("user");
    let basePath = "/manager";

    try {
        const savedRole = savedUser
            ? JSON.parse(savedUser)?.role
            : null;

        if (savedRole === "lead") {
            basePath = "/lead";
        }
    } catch {
        // Giữ đường dẫn manager khi localStorage không hợp lệ.
    }

    navigate(`${basePath}/reports/review?source=approved`);
};

const handleExportExcel = async () => {
    try {
        setExporting(true);

        await exportSelectedApprovedExcel(
            date
        );
    } catch (err: unknown) {
        console.error(
            "EXPORT SELECTED EXCEL ERROR:",
            err
        );

        const message =
            axios.isAxiosError(err)
                ? err.response?.data?.message ||
                  "Không thể tải file Excel"
                : "Không thể tải file Excel";

        showToast(message);
    } finally {
        setExporting(false);
    }
};
    const clearFilters = () => {
        setSearchKeyword("");
        setSelectedShift("");
        setSelectedProcess("");
    };

    return (
        <div className="management-report-page">
            <div className="management-report-header">
                <div>
                    <h1>Báo cáo đã duyệt</h1>
                    <p>Xem danh sách báo cáo của toàn bộ công nhân.</p>
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

                <label className="management-filter-field">
                    <span>Ngày báo cáo</span>
                    <input type="date" value={date} onChange={event => setDate(event.target.value)} />
                </label>

                <label className="management-filter-field">
                    <span>Ca</span>
                    <select value={selectedShift} onChange={event => setSelectedShift(event.target.value)}>
                        <option value="">Tất cả ca</option>
                        <option value="Ca 1">Ca 1</option>
                        <option value="Ca 2">Ca 2</option>
                        <option value="Ca 3">Ca 3</option>
                    </select>
                </label>

                <label className="management-filter-field">
                    <span>Công đoạn</span>
                    <select value={selectedProcess} onChange={event => setSelectedProcess(event.target.value)}>
                        <option value="">Tất cả công đoạn</option>
                        {processes.map(process => <option key={process} value={process}>{process}</option>)}
                    </select>
                </label>

                <button
                    className="management-clear-button"
                    onClick={clearFilters}
                    disabled={!searchKeyword && !selectedShift && !selectedProcess}
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
                        exporting
                    }
                >
                    👁 Xem chi tiết ({selectedIds.length})
                </button>
                <button
    type="button"
    className="management-export-button"
    onClick={handleExportExcel}
    disabled={
        loading ||
        exporting
    }
>
    {exporting
        ? "Đang cập nhật file tháng..."
        : "⇩ Tải Excel theo ngày"
    }
</button>
            </div>
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
            disabled={exporting}
        >
            Bỏ chọn tất cả
        </button>
    </div>
)}
            {error && <div className="management-error">{error}</div>}

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
            disabled={
                loading ||
                exporting ||
                currentPageIds.length === 0
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
                Number(report.id);

            const validReportId =
                Number.isInteger(reportId) &&
                reportId > 0;

            const isSelected =
                validReportId &&
                selectedIdSet.has(
                    reportId
                );

            const isDuplicate =
                (
                    duplicateCounts.get(
                        duplicateKey(report)
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
                >
                    <td className="management-checkbox-column">
                        <input
                            type="checkbox"
                            checked={
                                isSelected
                            }
                            disabled={
                                !validReportId ||
                                exporting
                            }
                            onChange={() =>
                                toggleSelectReport(
                                    reportId
                                )
                            }
                            aria-label={
                                `Chọn báo cáo của ${
                                    report.worker_code ||
                                    reportId
                                }`
                            }
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
                    <button disabled={currentPage === 1} onClick={() => setCurrentPage(page => page - 1)}>‹ Trước</button>
                    <span>Trang {currentPage}/{totalPages}</span>
                    <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(page => page + 1)}>Sau ›</button>
                </div>
            )}

            <div className="duplicate-note">
    <span />

    Hàng màu đỏ: cùng một nhân viên có từ hai báo cáo
    trùng đồng thời ca, mã máy và mã sản phẩm trong ngày đang xem.
</div>
        </div>
    );
}

export default ApprovedReports;