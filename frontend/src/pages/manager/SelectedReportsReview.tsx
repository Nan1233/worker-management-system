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
    getTempReportDetail
} from "../../services/productionService";

import type {
    ProductionReport
} from "../../types/production";

import "./SelectedReportsReview.css";


const formatDate = (
    value?: string
): string => {
    if (!value) {
        return "---";
    }

    const [year, month, day] = value
        .split("T")[0]
        .split("-");

    return year && month && day
        ? `${day}/${month}/${year}`
        : value;
};


const formatDateTime = (
    value?: string
): string => {
    if (!value) {
        return "---";
    }

    return new Date(value).toLocaleString("vi-VN");
};


const formatNumber = (
    value?: number | string | null
): string => {
    return Number(value ?? 0).toLocaleString("vi-VN", {
        maximumFractionDigits: 2
    });
};


function SelectedReportsReview() {
    const navigate = useNavigate();

    const savedUser = localStorage.getItem("user");
    const currentUser = savedUser
        ? JSON.parse(savedUser)
        : null;

    const isLead = currentUser?.role === "lead";
    const canEdit = ["admin", "manager"].includes(currentUser?.role);
    const basePath = isLead ? "/lead" : "/manager";

    const [reports, setReports] = useState<ProductionReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState("");


    const loadReports = async (
        ids: number[]
    ) => {
        try {
            setLoading(true);
            setError("");

            const results = await Promise.all(
                ids.map(async id => {
                    const response = await getTempReportDetail(id);
                    return response?.data ?? response;
                })
            );

            const validReports = results.filter(
                (report): report is ProductionReport => Boolean(report)
            );

            setReports(validReports);
        } catch (err: unknown) {
            console.error(
                "GET SELECTED REPORT DETAILS ERROR:",
                err
            );

            const message = axios.isAxiosError(err)
                ? err.response?.data?.message ||
                    "Không thể tải chi tiết báo cáo"
                : "Không thể tải chi tiết báo cáo";

            setError(message);
            setReports([]);
        } finally {
            setLoading(false);
        }
    };


    useEffect(() => {
        const savedIds = sessionStorage.getItem(
            "selectedPendingReportIds"
        );

        if (!savedIds) {
            setError("Không tìm thấy báo cáo đã chọn");
            setLoading(false);
            return;
        }

        try {
            const parsedIds: unknown = JSON.parse(savedIds);

            if (!Array.isArray(parsedIds) || parsedIds.length === 0) {
                setError("Không có báo cáo nào được chọn");
                setLoading(false);
                return;
            }

            const normalizedIds = parsedIds
                .map(Number)
                .filter(
                    id => Number.isInteger(id) && id > 0
                );

            if (normalizedIds.length === 0) {
                setError("Danh sách báo cáo đã chọn không hợp lệ");
                setLoading(false);
                return;
            }

            void loadReports(normalizedIds);
        } catch (err) {
            console.error(
                "PARSE SELECTED REPORT IDS ERROR:",
                err
            );

            setError("Danh sách báo cáo đã chọn không hợp lệ");
            setLoading(false);
        }
    }, []);


    const visibleIds = useMemo(
        () => reports
            .map(report => Number(report.id))
            .filter(id => Number.isInteger(id) && id > 0),
        [reports]
    );


    const handleApprove = async () => {
        if (visibleIds.length === 0) {
            alert("Không có báo cáo để duyệt");
            return;
        }

        const confirmed = window.confirm(
            `Duyệt ${visibleIds.length} báo cáo đang xem?`
        );

        if (!confirmed) {
            return;
        }

        try {
            setActionLoading(true);

            await approveSelectedTempReports(visibleIds);

            alert(`Đã duyệt ${visibleIds.length} báo cáo`);

            sessionStorage.removeItem(
                "selectedPendingReportIds"
            );

            navigate(`${basePath}/reports`);
        } catch (err: unknown) {
            console.error("APPROVE REPORTS ERROR:", err);

            const message = axios.isAxiosError(err)
                ? err.response?.data?.message ||
                    "Duyệt báo cáo thất bại"
                : "Duyệt báo cáo thất bại";

            alert(message);
        } finally {
            setActionLoading(false);
        }
    };


    const handleEdit = (
        reportId?: number
    ) => {
        if (!reportId) {
            alert("ID báo cáo không hợp lệ");
            return;
        }

        navigate(`/manager/report/${reportId}/edit`);
    };


    return (
        <main className="selected-review-page">
            <header className="selected-review-header">
                <div>
                    <button
                        type="button"
                        className="selected-review-back"
                        onClick={() => navigate(`${basePath}/reports`)}
                    >
                        ← Quay lại danh sách
                    </button>

                    <h1>Chi tiết báo cáo đã chọn</h1>

                    <p>
                        Đang xem <strong>{reports.length}</strong> báo cáo
                    </p>
                </div>

                <div className="selected-review-actions">
                    <button
                        type="button"
                        className="selected-review-approve"
                        onClick={handleApprove}
                        disabled={
                            loading ||
                            actionLoading ||
                            reports.length === 0
                        }
                    >
                        {actionLoading
                            ? "Đang xử lý..."
                            : `✓ Duyệt (${reports.length})`
                        }
                    </button>
                </div>
            </header>

            {error && (
                <div className="selected-review-error">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="selected-review-empty">
                    Đang tải chi tiết...
                </div>
            ) : reports.length === 0 ? (
                <div className="selected-review-empty">
                    Không có báo cáo để hiển thị
                </div>
            ) : (
                <div className="selected-report-list">
                    {reports.map((report, index) => (
                        <article
                            className="selected-report-card"
                            key={report.id ?? index}
                        >
                            <div className="selected-report-card-header">
                                <div>
                                    <span className="selected-report-index">
                                        Báo cáo {index + 1}
                                    </span>

                                    <h2>
                                        {report.worker_code || "---"}
                                        {" - "}
                                        {report.full_name || "---"}
                                    </h2>
                                </div>

                                {canEdit && (
                                    <button
                                        type="button"
                                        className="selected-review-edit"
                                        onClick={() => handleEdit(report.id)}
                                    >
                                        ✎ Sửa báo cáo
                                    </button>
                                )}
                            </div>

                            <section className="selected-report-section">
                                <h3>Thông tin chung</h3>

                                <div className="selected-info-grid">
                                    <div className="selected-info-item">
                                        <span>Ngày sản xuất</span>
                                        <strong>{formatDate(report.work_date)}</strong>
                                    </div>

                                    <div className="selected-info-item">
                                        <span>Công đoạn</span>
                                        <strong>{report.process_name || "---"}</strong>
                                    </div>

                                    <div className="selected-info-item">
                                        <span>Ca</span>
                                        <strong>{report.shift || "---"}</strong>
                                    </div>

                                    <div className="selected-info-item">
                                        <span>Số máy</span>
                                        <strong>{report.machine_no || "---"}</strong>
                                    </div>

                                    <div className="selected-info-item">
                                        <span>Sản phẩm</span>
                                        <strong>{report.product_name || "---"}</strong>
                                    </div>

                                    <div className="selected-info-item">
                                        <span>Thời gian gửi</span>
                                        <strong>{formatDateTime(report.created_at)}</strong>
                                    </div>
                                </div>
                            </section>

                            <div className="selected-report-columns">
                                <section className="selected-report-section">
                                    <h3>Tổng hợp thời gian</h3>

                                    <div className="selected-summary-grid">
                                        <div>
                                            <span>Tổng thời gian</span>
                                            <strong>{formatNumber(report.total_time)} giờ</strong>
                                        </div>

                                        <div>
                                            <span>Thời gian trừ</span>
                                            <strong>{formatNumber(report.deduction_time)} giờ</strong>
                                        </div>

                                        <div>
                                            <span>Thời gian thực tế</span>
                                            <strong>{formatNumber(report.actual_time)} giờ</strong>
                                        </div>
                                    </div>
                                </section>

                                <section className="selected-report-section">
                                    <h3>Sản lượng và chất lượng</h3>

                                    <div className="selected-summary-grid selected-summary-grid-four">
                                        <div>
                                            <span>Định mức</span>
                                            <strong>{formatNumber(report.standard_output)}</strong>
                                        </div>

                                        <div>
                                            <span>Thực tế</span>
                                            <strong>{formatNumber(report.actual_output)}</strong>
                                        </div>

                                        <div>
                                            <span>TT OK</span>
                                            <strong>{formatNumber(report.tt_ok)}</strong>
                                        </div>

                                        <div>
                                            <span>TT NG</span>
                                            <strong>{formatNumber(report.tt_ng)}</strong>
                                        </div>
                                    </div>
                                </section>
                            </div>

                            <div className="selected-report-columns">
                                <section className="selected-report-section">
                                    <h3>Chi tiết thời gian trừ</h3>

                                    {report.deductions?.length ? (
                                        <div className="selected-detail-table-wrapper">
                                            <table className="selected-detail-table">
                                                <thead>
                                                    <tr>
                                                        <th>STT</th>
                                                        <th>Nội dung trừ</th>
                                                        <th>Số giờ</th>
                                                    </tr>
                                                </thead>

                                                <tbody>
                                                    {report.deductions.map((item, deductionIndex) => (
                                                        <tr key={item.id ?? `${item.deduction_type_id}-${deductionIndex}`}>
                                                            <td>{deductionIndex + 1}</td>
                                                            <td>{item.deduction_name || item.deduction_code || "---"}</td>
                                                            <td>{formatNumber(item.hours)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>

                                                <tfoot>
                                                    <tr>
                                                        <td colSpan={2}>Tổng thời gian trừ</td>
                                                        <td>{formatNumber(report.deduction_time)}</td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    ) : (
                                        <p className="selected-no-detail">
                                            Không có thời gian trừ
                                        </p>
                                    )}
                                </section>

                                <section className="selected-report-section">
                                    <h3>Chi tiết NG</h3>

                                    {report.defects?.length ? (
                                        <div className="selected-detail-table-wrapper">
                                            <table className="selected-detail-table">
                                                <thead>
                                                    <tr>
                                                        <th>STT</th>
                                                        <th>Loại NG</th>
                                                        <th>Số lượng</th>
                                                    </tr>
                                                </thead>

                                                <tbody>
                                                    {report.defects.map((item, defectIndex) => (
                                                        <tr key={item.id ?? `${item.defect_type_id}-${defectIndex}`}>
                                                            <td>{defectIndex + 1}</td>
                                                            <td>{item.defect_name || item.defect_code || "---"}</td>
                                                            <td>{formatNumber(item.quantity)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>

                                                <tfoot>
                                                    <tr>
                                                        <td colSpan={2}>Tổng TT NG</td>
                                                        <td>{formatNumber(report.tt_ng)}</td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    ) : (
                                        <p className="selected-no-detail">
                                            Không có chi tiết NG
                                        </p>
                                    )}
                                </section>
                            </div>

                            <section className="selected-report-section selected-report-note-section">
                                <h3>Ghi chú</h3>
                                <p>{report.note || "Không có"}</p>
                            </section>
                        </article>
                    ))}
                </div>
            )}
        </main>
    );
}


export default SelectedReportsReview;
