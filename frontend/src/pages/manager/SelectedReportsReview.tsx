import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    approveSelectedTempReports,
    getTempReportDetail
} from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import "./SelectedReportsReview.css";

const formatDate = (value?: string | null) => {
    if (!value) return "---";
    const raw = value.split("T")[0];
    const [year, month, day] = raw.split("-");
    return year && month && day ? `${day}/${month}/${year}` : value;
};

const formatNumber = (value?: number | string | null) =>
    Number(value ?? 0).toLocaleString("vi-VN", { maximumFractionDigits: 3 });

const detailText = (
    items: Array<{ deduction_name?: string; defect_name?: string; hours?: number; quantity?: number }> | undefined,
    type: "deduction" | "defect"
) => {
    const valid = (items || []).filter((item) =>
        type === "deduction" ? Number(item.hours) > 0 : Number(item.quantity) > 0
    );

    if (valid.length === 0) return "---";

    return valid
        .map((item) =>
            type === "deduction"
                ? `${item.deduction_name || "Khác"}: ${formatNumber(item.hours)}h`
                : `${item.defect_name || "Khác"}: ${formatNumber(item.quantity)}`
        )
        .join("; ");
};

function SelectedReportsReview() {
    const navigate = useNavigate();
    const [reports, setReports] = useState<ProductionReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const savedUser = localStorage.getItem("user");
    let role = "manager";
    try {
        role = savedUser ? JSON.parse(savedUser)?.role || "manager" : "manager";
    } catch {
        role = "manager";
    }

    const basePath = role === "lead" ? "/lead" : "/manager";
    const canEdit = role === "manager" || role === "admin";

    useEffect(() => {
        const loadReports = async () => {
            try {
                setLoading(true);
                setError("");

                const stored = sessionStorage.getItem("selectedPendingReportIds");
                const ids = stored
                    ? JSON.parse(stored)
                        .map((value: unknown) => Number(value))
                        .filter((value: number) => Number.isInteger(value) && value > 0)
                    : [];

                if (ids.length === 0) {
                    setReports([]);
                    return;
                }

                const data = await Promise.all(ids.map((id: number) => getTempReportDetail(id)));
                setReports(data.filter(Boolean));
            } catch (err) {
                console.error("LOAD SELECTED REPORTS ERROR:", err);
                setError("Không thể tải chi tiết các báo cáo đã chọn.");
            } finally {
                setLoading(false);
            }
        };

        loadReports();
    }, []);

    const reportIds = useMemo(
        () => reports
            .map((report) => Number(report.id))
            .filter((id) => Number.isInteger(id) && id > 0),
        [reports]
    );

    const handleApprove = async () => {
        if (reportIds.length === 0 || submitting) return;

        try {
            setSubmitting(true);
            setError("");
            await approveSelectedTempReports(reportIds);
            sessionStorage.removeItem("selectedPendingReportIds");
            navigate(`${basePath}/reports`);
        } catch (err) {
            console.error("APPROVE SELECTED REPORTS ERROR:", err);
            setError("Duyệt báo cáo thất bại. Vui lòng kiểm tra lại dữ liệu.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="selected-review-page">
            <header className="selected-review-header">
                <div>
                    <button
                        type="button"
                        className="selected-review-back"
                        onClick={() => navigate(-1)}
                    >
                        ← Quay lại danh sách
                    </button>
                    <h1>Chi tiết báo cáo đã chọn</h1>
                    <p>{reports.length} báo cáo được hiển thị trong một bảng ngang.</p>
                </div>

                <button
                    type="button"
                    className="selected-review-approve"
                    disabled={submitting || reportIds.length === 0}
                    onClick={handleApprove}
                >
                    {submitting ? "Đang duyệt..." : `Duyệt ${reportIds.length} báo cáo`}
                </button>
            </header>

            {error && <div className="selected-review-error">{error}</div>}

            {loading ? (
                <div className="selected-review-empty">Đang tải dữ liệu...</div>
            ) : reports.length === 0 ? (
                <div className="selected-review-empty">Không có báo cáo nào được chọn.</div>
            ) : (
                <section className="selected-table-card">
                    <div className="selected-table-scroll">
                        <table className="selected-review-table">
                            <thead>
                                <tr>
                                    <th>STT</th>
                                    <th>Nhân viên</th>
                                    <th>Ngày</th>
                                    <th>Công đoạn</th>
                                    <th>Ca</th>
                                    <th>Máy</th>
                                    <th>Sản phẩm</th>
                                    <th>% học việc</th>
                                    <th>Định mức</th>
                                    <th>Thực tế</th>
                                    <th>OK</th>
                                    <th>NG</th>
                                    <th>Tổng giờ</th>
                                    <th>Giờ trừ</th>
                                    <th>Giờ thực tế</th>
                                    <th>Chi tiết thời gian trừ</th>
                                    <th>Chi tiết lỗi NG</th>
                                    <th>Ghi chú</th>
                                    {canEdit && <th>Thao tác</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {reports.map((report, index) => (
                                    <tr key={report.id || index}>
                                        <td className="selected-sticky-index">{index + 1}</td>
                                        <td className="selected-worker-cell">
                                            <strong>{report.worker_code || "---"}</strong>
                                            <span>{report.full_name || "Không có tên"}</span>
                                        </td>
                                        <td>{formatDate(report.work_date)}</td>
                                        <td>{report.process_name || report.process_code || "---"}</td>
                                        <td>{report.shift || "---"}</td>
                                        <td>{report.machine_no || "---"}</td>
                                        <td>{report.product_name || "---"}</td>
                                        <td>{formatNumber(report.training_percent ?? 100)}%</td>
                                        <td>{formatNumber(report.standard_output)}</td>
                                        <td>{formatNumber(report.actual_output)}</td>
                                        <td>{formatNumber(report.tt_ok)}</td>
                                        <td>{formatNumber(report.tt_ng)}</td>
                                        <td>{formatNumber(report.total_time)}</td>
                                        <td>{formatNumber(report.deduction_time)}</td>
                                        <td>{formatNumber(report.actual_time)}</td>
                                        <td className="selected-long-cell">
                                            {detailText(report.deductions, "deduction")}
                                        </td>
                                        <td className="selected-long-cell">
                                            {detailText(report.defects, "defect")}
                                        </td>
                                        <td className="selected-note-cell">{report.note || "---"}</td>
                                        {canEdit && (
                                            <td>
                                                <button
                                                    type="button"
                                                    className="selected-edit-link"
                                                    onClick={() => navigate(`${basePath}/report/${report.id}/edit?source=pending`)}
                                                >
                                                    ✎ Sửa
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
        </main>
    );
}

export default SelectedReportsReview;
