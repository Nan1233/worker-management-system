import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getReportById, getTempReportById } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import "./ReportDetail.css";

const formatDate = (value?: string | null) => {
    if (!value) return "---";
    const raw = value.split("T")[0];
    const [year, month, day] = raw.split("-");
    return year && month && day ? `${day}/${month}/${year}` : value;
};

const formatNumber = (value?: number | string | null) =>
    Number(value ?? 0).toLocaleString("vi-VN", { maximumFractionDigits: 3 });

function ReportDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const source = searchParams.get("source") === "pending" ? "pending" : "approved";

    const [report, setReport] = useState<ProductionReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const savedUser = localStorage.getItem("user");
    let role = "manager";
    try {
        role = savedUser ? JSON.parse(savedUser)?.role || "manager" : "manager";
    } catch {
        role = "manager";
    }

    const canEdit = role === "manager" || role === "admin";
    const basePath = role === "lead" ? "/lead" : "/manager";

    useEffect(() => {
        const loadReport = async () => {
            try {
                setLoading(true);
                setError("");

                const reportId = Number(id);
                if (!Number.isInteger(reportId) || reportId <= 0) {
                    setError("ID báo cáo không hợp lệ.");
                    return;
                }

                const data = source === "pending"
                    ? await getTempReportById(reportId)
                    : await getReportById(reportId);

                setReport(data || null);
            } catch (err) {
                console.error("LOAD REPORT DETAIL ERROR:", err);
                setError("Không thể tải thông tin báo cáo.");
            } finally {
                setLoading(false);
            }
        };

        loadReport();
    }, [id, source]);

    if (loading) {
        return <main className="report-detail-page"><div className="detail-state">Đang tải báo cáo...</div></main>;
    }

    if (error || !report) {
        return (
            <main className="report-detail-page">
                <div className="detail-state detail-state-error">{error || "Không tìm thấy báo cáo."}</div>
                <button className="detail-back-button" type="button" onClick={() => navigate(-1)}>Quay lại</button>
            </main>
        );
    }

    return (
        <main className="report-detail-page">
            <header className="report-detail-header">
                <div>
                    <button className="detail-link-button" type="button" onClick={() => navigate(-1)}>
                        ← Quay lại
                    </button>
                    <h1>{report.worker_code || "---"} - {report.full_name || "Không có tên"}</h1>
                    <span className={`detail-status ${report.status === "approved" ? "is-approved" : "is-pending"}`}>
                        {report.status === "approved" ? "Đã duyệt" : "Chờ duyệt"}
                    </span>
                </div>

                {canEdit && source === "pending" && (
                    <button
                        className="detail-edit-button"
                        type="button"
                        onClick={() => navigate(`${basePath}/report/${report.id}/edit?source=pending`)}
                    >
                        ✎ Sửa báo cáo
                    </button>
                )}
            </header>

            <section className="detail-basic-card">
                <h2>Thông tin chung</h2>

                <div className="detail-basic-grid">
                    <div className="detail-basic-item">
                        <span>Ngày sản xuất</span>
                        <strong>{formatDate(report.work_date)}</strong>
                    </div>
                    <div className="detail-basic-item">
                        <span>Công đoạn</span>
                        <strong>{report.process_name || report.process_code || "---"}</strong>
                    </div>
                    <div className="detail-basic-item">
                        <span>Ca</span>
                        <strong>{report.shift || "---"}</strong>
                    </div>
                    <div className="detail-basic-item">
                        <span>Số máy</span>
                        <strong>{report.machine_no || "---"}</strong>
                    </div>
                    <div className="detail-basic-item">
                        <span>Sản phẩm</span>
                        <strong>{report.product_name || "---"}</strong>
                    </div>
                    <div className="detail-basic-item">
                        <span>% học việc</span>
                        <strong>{formatNumber(report.training_percent ?? 100)}%</strong>
                    </div>
                </div>
            </section>

            <section className="detail-basic-card">
                <h2>Tóm tắt sản xuất</h2>
                <div className="detail-summary-row">
                    <div><span>Định mức</span><strong>{formatNumber(report.standard_output)}</strong></div>
                    <div><span>Thực tế</span><strong>{formatNumber(report.actual_output)}</strong></div>
                    <div><span>OK</span><strong>{formatNumber(report.tt_ok)}</strong></div>
                    <div><span>NG</span><strong>{formatNumber(report.tt_ng)}</strong></div>
                    <div><span>Giờ thực tế</span><strong>{formatNumber(report.actual_time)}</strong></div>
                </div>
            </section>

            {report.note && (
                <section className="detail-note-card">
                    <span>Ghi chú</span>
                    <p>{report.note}</p>
                </section>
            )}
        </main>
    );
}

export default ReportDetail;
