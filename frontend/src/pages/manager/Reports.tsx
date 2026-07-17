import {
    useEffect,
    useMemo,
    useState
} from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import {
    approveTempByDate,
    getTempReportsByDate
} from "../../services/productionService";
import type { ProductionReport } from "../../types/production";

import "./Reports.css";

const ITEMS_PER_PAGE = 20;

const getToday = (): string => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    return new Date(now.getTime() - offset * 60_000)
        .toISOString()
        .split("T")[0];
};

const formatDate = (value?: string): string => {
    if (!value) return "---";
    const [year, month, day] = value.split("T")[0].split("-");
    return year && month && day ? `${day}/${month}/${year}` : value;
};

const normalizeText = (value?: string): string =>
    String(value ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d");

const duplicateKey = (report: ProductionReport): string =>
    [
        report.worker_code,
        report.shift,
        report.machine_no,
        report.product_name
    ]
        .map(normalizeText)
        .join("|");

function Reports() {
    const navigate = useNavigate();

    const savedUser = localStorage.getItem("user");
    const currentUser = savedUser ? JSON.parse(savedUser) : null;
    const basePath = currentUser?.role === "lead" ? "/lead" : "/manager";

    const [date, setDate] = useState(getToday());
    const [reports, setReports] = useState<ProductionReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchKeyword, setSearchKeyword] = useState("");
    const [selectedShift, setSelectedShift] = useState("");
    const [selectedProcess, setSelectedProcess] = useState("");
    const [currentPage, setCurrentPage] = useState(1);

    const loadReports = async (selectedDate: string) => {
        try {
            setLoading(true);
            setError("");
            const data = await getTempReportsByDate(selectedDate);
            setReports(Array.isArray(data) ? data : []);
        } catch (err: unknown) {
            console.error("GET PENDING REPORTS ERROR:", err);
            const message = axios.isAxiosError(err)
                ? err.response?.data?.message || "Không thể tải báo cáo chờ duyệt"
                : "Không thể tải báo cáo chờ duyệt";
            setError(message);
            setReports([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadReports(date);
    }, [date]);

    const processes = useMemo(
        () => Array.from(
            new Set(reports.map(item => item.process_name).filter(Boolean))
        ).sort(),
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
            counts.set(key, (counts.get(key) ?? 0) + 1);
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
        setCurrentPage(1);
    }, [searchKeyword, selectedShift, selectedProcess, date]);

    const totalPages = Math.max(1, Math.ceil(filteredReports.length / ITEMS_PER_PAGE));
    const paginatedReports = filteredReports.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    const handleApprove = async () => {
        if (reports.length === 0) return;
        if (!window.confirm(`Duyệt toàn bộ báo cáo ngày ${formatDate(date)}?`)) return;

        try {
            await approveTempByDate(date);
            alert("Duyệt thành công");
            await loadReports(date);
        } catch (err) {
            console.error(err);
            alert("Duyệt thất bại");
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
                    <h1>📋 Báo cáo chờ duyệt</h1>
                    <p>Xem từng báo cáo của toàn bộ công nhân trước khi duyệt.</p>
                </div>
                <div className="management-report-count">
                    <strong>{filteredReports.length}</strong>
                    <span>báo cáo</span>
                </div>
            </div>

            <div className="management-filter-card">
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
                    <input
                        type="date"
                        value={date}
                        onChange={event => setDate(event.target.value)}
                    />
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
                        {processes.map(process => (
                            <option key={process} value={process}>{process}</option>
                        ))}
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
                    className="management-approve-button"
                    onClick={handleApprove}
                    disabled={reports.length === 0 || loading}
                >
                    ✓ Duyệt ngày
                </button>
            </div>

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
                                    <th>STT</th>
                                    <th>Mã NV</th>
                                    <th>Họ tên</th>
                                    <th>Ngày</th>
                                    <th>Công đoạn</th>
                                    <th>Ca</th>
                                    <th>Mã máy</th>
                                    <th>Mã sản phẩm</th>
                                    <th>Tổng giờ</th>
                                    <th>Giờ thực tế</th>
                                    <th>Định mức</th>
                                    <th>Thực tế</th>
                                    <th>TT OK</th>
                                    <th>TT NG</th>
                                    <th>Chi tiết</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedReports.map((report, index) => {
                                    const isDuplicate = (duplicateCounts.get(duplicateKey(report)) ?? 0) > 1;
                                    return (
                                        <tr
                                            key={report.id}
                                            className={isDuplicate ? "duplicate-report-row" : ""}
                                            title={isDuplicate ? "Cùng nhân viên bị trùng ca, mã máy và mã sản phẩm" : undefined}
                                        >
                                            <td>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</td>
                                            <td><strong>{report.worker_code || "---"}</strong></td>
                                            <td>{report.full_name || "---"}</td>
                                            <td>{formatDate(report.work_date)}</td>
                                            <td>{report.process_name || "---"}</td>
                                            <td>{report.shift || "---"}</td>
                                            <td>{report.machine_no || "---"}</td>
                                            <td>{report.product_name || "---"}</td>
                                            <td>{Number(report.total_time ?? 0)}</td>
                                            <td>{Number(report.actual_time ?? 0)}</td>
                                            <td>{Number(report.standard_output ?? 0).toLocaleString("vi-VN")}</td>
                                            <td>{Number(report.actual_output ?? 0).toLocaleString("vi-VN")}</td>
                                            <td>{Number(report.tt_ok ?? 0).toLocaleString("vi-VN")}</td>
                                            <td>{Number(report.tt_ng ?? 0).toLocaleString("vi-VN")}</td>
                                            <td>
                                                <button
                                                    className="management-detail-button"
                                                    onClick={() => navigate(`${basePath}/report/${report.id}?source=pending`)}
                                                >
                                                    Xem
                                                </button>
                                            </td>
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
                <span /> Hàng màu đỏ: cùng một nhân viên có từ hai báo cáo trùng đồng thời ca, mã máy và mã sản phẩm trong ngày đang xem.
            </div>
        </div>
    );
}

export default Reports;