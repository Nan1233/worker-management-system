import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { getMyTempReports } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";

const ITEMS_PER_PAGE = 10;

const formatDate = (value?: string): string => {
    if (!value) return "---";
    const [year, month, day] = value.split("T")[0].split("-");
    return year && month && day ? `${day}/${month}/${year}` : value;
};

const formatNumber = (value?: number | null): string =>
    new Intl.NumberFormat("vi-VN").format(Number(value ?? 0));

const normalizeText = (value?: string): string =>
    String(value ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d");

const getStatusInfo = (status?: string) => {
    switch (status) {
        case "approved": return { label: "Đã duyệt", className: "approved" };
        case "need_fix": return { label: "Cần sửa", className: "need-fix" };
        case "rejected": return { label: "Từ chối", className: "rejected" };
        default: return { label: "Chờ duyệt", className: "pending" };
    }
};

function ProductionHistory() {
    const navigate = useNavigate();
    const [reports, setReports] = useState<ProductionReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchKeyword, setSearchKeyword] = useState("");
    const [selectedDate, setSelectedDate] = useState("");
    const [selectedShift, setSelectedShift] = useState("");
    const [selectedStatus, setSelectedStatus] = useState("");
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        const loadReports = async () => {
            try {
                setLoading(true);
                setError("");
                const data = await getMyTempReports();
                setReports(Array.isArray(data) ? data : []);
            } catch (err: unknown) {
                console.error("Lỗi lấy lịch sử:", err);
                const message = axios.isAxiosError(err)
                    ? err.response?.data?.message || "Không thể tải lịch sử báo cáo"
                    : "Không thể tải lịch sử báo cáo";
                setError(message);
            } finally {
                setLoading(false);
            }
        };
        void loadReports();
    }, []);

    const filteredReports = useMemo(() => {
        const keyword = normalizeText(searchKeyword);
        return reports.filter((item) => {
            const itemDate = item.work_date?.split("T")[0] || "";
            const searchableText = normalizeText([
                item.machine_no,
                item.product_name,
                item.process_name,
                item.shift,
            ].join(" "));
            return (
                (!keyword || searchableText.includes(keyword)) &&
                (!selectedDate || itemDate === selectedDate) &&
                (!selectedShift || item.shift === selectedShift) &&
                (!selectedStatus || item.status === selectedStatus)
            );
        });
    }, [reports, searchKeyword, selectedDate, selectedShift, selectedStatus]);

    useEffect(() => setCurrentPage(1), [searchKeyword, selectedDate, selectedShift, selectedStatus]);

    const totalPages = Math.max(1, Math.ceil(filteredReports.length / ITEMS_PER_PAGE));
    const paginatedReports = filteredReports.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE,
    );

    const hasActiveFilter = Boolean(searchKeyword || selectedDate || selectedShift || selectedStatus);

    const clearFilters = () => {
        setSearchKeyword("");
        setSelectedDate("");
        setSelectedShift("");
        setSelectedStatus("");
        setCurrentPage(1);
    };

    const openDetail = (item: ProductionReport) => {
        if (!item.id) return;
        const source = item.source || (item.status === "approved" ? "approved" : "pending");
        navigate(`/worker/history/${item.id}?source=${source}`);
    };

    if (loading) {
        return (
            <main className="history-page production-page">
                <div className="history-state-card"><strong>Đang tải dữ liệu...</strong></div>
            </main>
        );
    }

    return (
        <main className="history-page">
            <style>{`
                .history-mobile-fix { width:100%; }
                @media (max-width:600px) {
                    .history-page .history-shell { width:100% !important; max-width:none !important; }
                    .history-page .history-header {
                        justify-content:flex-start !important;
                        align-items:flex-start !important;
                        gap:10px !important;
                        margin:0 0 12px !important;
                        padding:0 !important;
                    }
                    .history-page .history-title-group {
                        justify-content:flex-start !important;
                        align-items:center !important;
                        width:auto !important;
                        margin:0 !important;
                    }
                    .history-page .history-title-group > div { text-align:left !important; }
                    .history-page .history-title-group h1 {
                        margin:0 !important;
                        font-size:19px !important;
                        line-height:1.2 !important;
                        white-space:nowrap !important;
                    }
                    .history-page .history-title-group p { display:none !important; }
                    .history-page .history-back-button {
                        width:36px !important;
                        height:36px !important;
                        min-width:36px !important;
                        padding:0 !important;
                    }
                    .history-page .history-count {
                        margin-left:auto !important;
                        align-self:center !important;
                        padding:6px 9px !important;
                        font-size:10px !important;
                    }
                    .history-page .history-count strong { font-size:12px !important; }
                    .history-page .history-count span { font-size:9px !important; }
                    .history-page .history-filter-card {
                        padding:10px !important;
                        margin-bottom:10px !important;
                    }
                    .history-page .history-search-box input,
                    .history-page .history-filter-field input,
                    .history-page .history-filter-field select {
                        min-height:36px !important;
                        height:36px !important;
                        font-size:12px !important;
                    }
                    .history-page .history-filter-field > span { font-size:10px !important; }
                    .history-page .history-clear-button { min-height:34px !important; }
                    .history-page .report-card { padding:0 !important; background:transparent !important; border:0 !important; }
                    .history-page .table-container {
                        overflow:visible !important;
                        border:0 !important;
                        background:transparent !important;
                        box-shadow:none !important;
                    }
                    .history-page .history-table,
                    .history-page .history-table tbody { display:block !important; width:100% !important; }
                    .history-page .history-table thead { display:none !important; }
                    .history-page .history-table tbody tr {
                        display:grid !important;
                        grid-template-columns:34px minmax(0,1fr) auto !important;
                        grid-template-areas:
                            "index date status"
                            "index shift product"
                            "index machine ok"
                            "index ng action" !important;
                        gap:0 8px !important;
                        align-items:center !important;
                        width:100% !important;
                        min-height:112px !important;
                        margin:0 0 8px !important;
                        padding:10px 10px !important;
                        border:1px solid #dfe7f0 !important;
                        border-radius:10px !important;
                        background:#fff !important;
                        box-shadow:0 1px 2px rgba(16,34,58,.04) !important;
                    }
                    .history-page .history-table tbody td {
                        display:block !important;
                        width:auto !important;
                        min-width:0 !important;
                        padding:3px 0 !important;
                        border:0 !important;
                        font-size:11px !important;
                        line-height:1.25 !important;
                        text-align:left !important;
                        overflow:hidden !important;
                        white-space:nowrap !important;
                        text-overflow:ellipsis !important;
                    }
                    .history-page .history-table tbody td::before { display:none !important; }
                    .history-page .history-table .column-index { grid-area:index; align-self:start; text-align:center !important; color:#58708b !important; font-weight:700 !important; padding-top:4px !important; }
                    .history-page .history-table .date-cell { grid-area:date; font-weight:700 !important; color:#20334c !important; }
                    .history-page .history-table .shift-cell { grid-area:shift; }
                    .history-page .history-table .machine-cell { grid-area:machine; color:#536a82 !important; }
                    .history-page .history-table .product-cell { grid-area:product; color:#536a82 !important; font-weight:600 !important; }
                    .history-page .history-table .ok-column { grid-area:ok; color:#16845b !important; font-weight:700 !important; text-align:right !important; }
                    .history-page .history-table .ng-column { grid-area:ng; color:#d0444f !important; font-weight:700 !important; text-align:right !important; }
                    .history-page .history-table .status-cell { grid-area:status; text-align:right !important; overflow:visible !important; }
                    .history-page .history-table .status-cell .history-status { font-size:9px !important; white-space:nowrap !important; }
                    .history-page .history-table .action-column { grid-area:action; text-align:right !important; overflow:visible !important; }
                    .history-page .history-table .detail-btn { min-height:28px !important; padding:0 9px !important; font-size:10px !important; }
                    .history-page .shift-badge { font-size:9px !important; }
                    .history-page .pagination { margin-top:8px !important; }
                }
            `}</style>

            <div className="history-shell history-mobile-fix">
                <header className="history-header">
                    <div className="history-title-group">
                        <button
                            type="button"
                            className="history-back-button"
                            onClick={() => navigate("/worker")}
                            aria-label="Quay lại"
                        >←</button>
                        <div>
                            <h1>Báo cáo của tôi</h1>
                            <p>Theo dõi các báo cáo sản xuất đã gửi</p>
                        </div>
                    </div>
                    <div className="history-count">
                        <strong>{filteredReports.length}</strong>
                        <span>/ {reports.length} báo cáo</span>
                    </div>
                </header>

                <section className="history-filter-card">
                    <div className="history-search-box">
                        <span>⌕</span>
                        <input
                            type="search"
                            value={searchKeyword}
                            onChange={(event) => setSearchKeyword(event.target.value)}
                            placeholder="Tìm máy, sản phẩm, công đoạn..."
                            autoComplete="off"
                        />
                    </div>
                    <div className="history-filter-grid">
                        <label className="history-filter-field">
                            <span>Ngày</span>
                            <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
                        </label>
                        <label className="history-filter-field">
                            <span>Ca</span>
                            <select value={selectedShift} onChange={(event) => setSelectedShift(event.target.value)}>
                                <option value="">Tất cả</option>
                                <option value="A">A</option>
                                <option value="B">B</option>
                                <option value="C">C</option>
                                <option value="D">D</option>
                            </select>
                        </label>
                        <label className="history-filter-field">
                            <span>Trạng thái</span>
                            <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)}>
                                <option value="">Tất cả</option>
                                <option value="pending">Chờ duyệt</option>
                                <option value="approved">Đã duyệt</option>
                                <option value="need_fix">Cần sửa</option>
                                <option value="rejected">Từ chối</option>
                            </select>
                        </label>
                        <button type="button" className="history-clear-button" onClick={clearFilters} disabled={!hasActiveFilter}>Xóa lọc</button>
                    </div>
                </section>

                {error && <div className="history-error">{error}</div>}

                {filteredReports.length === 0 ? (
                    <div className="history-empty">
                        <strong>Không tìm thấy báo cáo</strong>
                        <p>Thử thay đổi từ khóa hoặc bộ lọc.</p>
                    </div>
                ) : (
                    <section className="report-card">
                        <div className="table-container">
                            <table className="history-table">
                                <thead>
                                    <tr>
                                        <th className="column-index">STT</th>
                                        <th>Ngày</th>
                                        <th>Ca</th>
                                        <th>Máy</th>
                                        <th>Sản phẩm</th>
                                        <th className="numeric-column ok-column">OK</th>
                                        <th className="numeric-column ng-column">NG</th>
                                        <th>Trạng thái</th>
                                        <th className="action-column">Chi tiết</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedReports.map((item, index) => {
                                        const statusInfo = getStatusInfo(item.status);
                                        const rowNumber = (currentPage - 1) * ITEMS_PER_PAGE + index + 1;
                                        return (
                                            <tr key={item.id ?? `${item.work_date}-${index}`}>
                                                <td data-label="STT" className="column-index">{rowNumber}</td>
                                                <td data-label="Ngày" className="date-cell">{formatDate(item.work_date)}</td>
                                                <td data-label="Ca" className="shift-cell"><span className="shift-badge">{item.shift || "---"}</span></td>
                                                <td data-label="Máy" className="machine-cell" title={item.machine_no}>{item.machine_no || "---"}</td>
                                                <td data-label="Sản phẩm" className="product-cell" title={item.product_name}>{item.product_name || "---"}</td>
                                                <td data-label="OK" className="numeric-column ok-column">OK {formatNumber(item.tt_ok)}</td>
                                                <td data-label="NG" className="numeric-column ng-column">NG {formatNumber(item.tt_ng)}</td>
                                                <td data-label="Trạng thái" className="status-cell"><span className={`history-status ${statusInfo.className}`}>{statusInfo.label}</span></td>
                                                <td data-label="Chi tiết" className="action-column">
                                                    <button type="button" className="detail-btn" onClick={() => openDetail(item)}>Xem <span>›</span></button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {totalPages > 1 && (
                                <div className="pagination">
                                    <button type="button" disabled={currentPage === 1} onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}>← Trước</button>
                                    {Array.from({ length: totalPages }).map((_, index) => {
                                        const page = index + 1;
                                        return <button key={page} type="button" className={currentPage === page ? "active" : ""} onClick={() => setCurrentPage(page)}>{page}</button>;
                                    })}
                                    <button type="button" disabled={currentPage === totalPages} onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}>Sau →</button>
                                </div>
                            )}
                        </div>
                    </section>
                )}
            </div>
        </main>
    );
}

export default ProductionHistory;
