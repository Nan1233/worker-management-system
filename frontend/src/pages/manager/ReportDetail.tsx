import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import { getReportById, getTempReportById } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import "./ReportDetail.css";

const formatDate = (value?: string | null) => {
    if (!value) return "---";
    const raw = value.split("T")[0];
    const [year, month, day] = raw.split("-");
    return year && month && day ? `${day}/${month}/${year}` : value;
};

const formatDateTime = (value?: string | null) => {
    if (!value) return "---";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
        ? value
        : parsed.toLocaleString("vi-VN");
};

const formatNumber = (value?: number | string | null) =>
    Number(value ?? 0).toLocaleString("vi-VN", { maximumFractionDigits: 3 });

const LEGACY_DEFECT_FIELDS: Array<{ key: keyof ProductionReport; label: string }> = [
    { key: "kqd_dap_lai", label: "KQĐ dập lại" },
    { key: "kqd_tuot", label: "KQĐ tuột" },
    { key: "vo_do_long", label: "Vỡ/đỏ lồng" },
    { key: "xuoc_do_long", label: "Xước/đỏ lồng" },
    { key: "cong_gay", label: "Không xước, cong gãy" },
    { key: "xoay", label: "Cao su xoay" },
    { key: "khong_dut", label: "Cắt không đứt" },
    { key: "bavia_hut", label: "Bavia/hụt" },
    { key: "ppcm", label: "PPCM" },
    { key: "loi_cao_su", label: "Lỗi cao su" },
    { key: "ng_kich_thuoc", label: "NG kích thước" },
    { key: "cat_lem", label: "Cắt lẹm" },
];

const normalizeText = (value?: string | null) =>
    String(value || "").trim().toLocaleLowerCase("vi-VN").replace(/\s+/g, " ");

const getAllDefects = (report: ProductionReport) => {
    const result: Array<{ id?: number; defect_type_id?: number; defect_code?: string; defect_name: string; quantity: number }> = [];
    const seen = new Set<string>();

    for (const item of Array.isArray(report.defects) ? report.defects : []) {
        const quantity = Number(item.quantity || 0);
        if (quantity <= 0) continue;
        const name = item.defect_name || item.defect_code || "Lỗi NG";
        const key = item.defect_type_id ? `id:${item.defect_type_id}` : `name:${normalizeText(name)}`;
        seen.add(key);
        seen.add(`name:${normalizeText(name)}`);
        result.push({ ...item, defect_name: name, quantity });
    }

    for (const legacy of LEGACY_DEFECT_FIELDS) {
        const quantity = Number(report[legacy.key] || 0);
        const key = `name:${normalizeText(legacy.label)}`;
        if (quantity <= 0 || seen.has(key)) continue;
        result.push({ defect_name: legacy.label, quantity });
        seen.add(key);
    }

    return result;
};

function ReportDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const source = searchParams.get("source") === "pending" ? "pending" : "approved";

    const [report, setReport] = useState<ProductionReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const role = useMemo(() => {
        const savedUser = localStorage.getItem("user");
        try {
            return savedUser ? JSON.parse(savedUser)?.role || "manager" : "manager";
        } catch {
            return "manager";
        }
    }, []);

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
            } catch (err: unknown) {
                console.error("LOAD REPORT DETAIL ERROR:", err);
                const message = axios.isAxiosError(err)
                    ? err.response?.data?.message || "Không thể tải thông tin báo cáo."
                    : "Không thể tải thông tin báo cáo.";
                setError(message);
            } finally {
                setLoading(false);
            }
        };

        void loadReport();
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

    const defects = getAllDefects(report);
    const deductions = Array.isArray(report.deductions) ? report.deductions.filter(item => Number(item.hours) > 0) : [];

    return (
        <main className="report-detail-page">
            <header className="report-detail-header">
                <div>
                    <button className="detail-link-button" type="button" onClick={() => navigate(-1)}>
                        ← Quay lại danh sách
                    </button>
                    <h1>{report.worker_code || "---"} - {report.full_name || "Không có tên"}</h1>
                    <span className={`detail-status ${source === "approved" ? "is-approved" : "is-pending"}`}>
                        {source === "approved" ? "Đã duyệt" : "Chờ duyệt"}
                    </span>
                </div>

                {canEdit && source === "pending" && (
                    <button
                        className="detail-edit-button"
                        type="button"
                        onClick={() => navigate(`${basePath}/report/${report.id}/edit?source=${source}`)}
                    >
                        ✎ Sửa báo cáo
                    </button>
                )}
            </header>

            <section className="detail-basic-card">
                <h2>Thông tin chung</h2>
                <div className="detail-basic-grid">
                    <div className="detail-basic-item"><span>Ngày sản xuất</span><strong>{formatDate(report.work_date)}</strong></div>
                    <div className="detail-basic-item"><span>Công đoạn</span><strong>{report.process_name || report.process_code || "---"}</strong></div>
                    <div className="detail-basic-item"><span>Ca</span><strong>{report.shift || "---"}</strong></div>
                    <div className="detail-basic-item"><span>Số máy</span><strong>{report.machine_no || "---"}</strong></div>
                    <div className="detail-basic-item"><span>Sản phẩm</span><strong>{report.product_name || "---"}</strong></div>
                    <div className="detail-basic-item"><span>% học việc</span><strong>{formatNumber(report.training_percent ?? 100)}%</strong></div>
                </div>
            </section>

            <section className="detail-basic-card">
                <h2>Sản lượng và thời gian</h2>
                <div className="detail-summary-row">
                    <div><span>Định mức</span><strong>{formatNumber(report.standard_output)}</strong></div>
                    <div><span>Sản lượng thực tế</span><strong>{formatNumber(report.actual_output)}</strong></div>
                    <div><span>TT OK</span><strong>{formatNumber(report.tt_ok)}</strong></div>
                    <div><span>TT NG</span><strong>{formatNumber(report.tt_ng)}</strong></div>
                    <div><span>Tổng thời gian</span><strong>{formatNumber(report.total_time)} giờ</strong></div>
                    <div><span>Giờ trừ</span><strong>{formatNumber(report.deduction_time)} giờ</strong></div>
                    <div><span>Giờ thực tế</span><strong>{formatNumber(report.actual_time)} giờ</strong></div>
                </div>
            </section>

            <div className="detail-two-column">
                <section className="detail-basic-card detail-list-card">
                    <div className="detail-section-heading"><h2>Chi tiết NG</h2><span>{defects.length} loại lỗi</span></div>
                    {defects.length === 0 ? (
                        <div className="detail-empty-list">Không có lỗi NG.</div>
                    ) : (
                        <div className="detail-list">
                            {defects.map((item, index) => (
                                <div className="detail-list-row" key={item.id ?? `${item.defect_type_id}-${index}`}>
                                    <span><small>NG {index + 1}</small>{item.defect_name || item.defect_code || `Lỗi ${index + 1}`}</span>
                                    <strong>{formatNumber(item.quantity)}</strong>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section className="detail-basic-card detail-list-card">
                    <div className="detail-section-heading"><h2>Chi tiết giờ trừ</h2><span>{deductions.length} mục</span></div>
                    {deductions.length === 0 ? (
                        <div className="detail-empty-list">Không có thời gian trừ.</div>
                    ) : (
                        <div className="detail-list">
                            {deductions.map((item, index) => (
                                <div className="detail-list-row" key={item.id ?? `${item.deduction_type_id}-${index}`}>
                                    <span><small>Mục {index + 1}</small>{item.deduction_name || item.deduction_code || `Mục ${index + 1}`}</span>
                                    <strong>{formatNumber(item.hours)} giờ</strong>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>

            {report.note && (
                <section className="detail-note-card">
                    <span>Ghi chú</span>
                    <p>{report.note}</p>
                </section>
            )}

            <section className="detail-basic-card">
                <h2>Thông tin hệ thống</h2>
                <div className="detail-basic-grid">
                    <div className="detail-basic-item"><span>Mã báo cáo</span><strong>#{report.id}</strong></div>
                    <div className="detail-basic-item"><span>Thời gian tạo</span><strong>{formatDateTime(report.created_at)}</strong></div>
                    <div className="detail-basic-item"><span>Cập nhật gần nhất</span><strong>{formatDateTime(report.updated_at)}</strong></div>
                    {source === "approved" && (
                        <div className="detail-basic-item"><span>Thời gian duyệt</span><strong>{formatDateTime(report.approved_at)}</strong></div>
                    )}
                </div>
            </section>
        </main>
    );
}

export default ReportDetail;
