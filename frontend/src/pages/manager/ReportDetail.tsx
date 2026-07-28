import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import {
    approveSelectedTempReports,
    getReportById,
    getTempReportActionLogs,
    getTempReportById,
    rejectSelectedTempReports,
    type ReportActionLog,
} from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import { getAllReportDefects } from "../../utils/reportDetails";
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
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("vi-VN");
};

const formatNumber = (value?: number | string | null) =>
    Number(value ?? 0).toLocaleString("vi-VN", { maximumFractionDigits: 3 });

const ACTION_LABELS: Record<string, string> = {
    CREATE: "Tạo báo cáo",
    VIEW: "Xem chi tiết",
    UPDATE: "Sửa báo cáo",
    APPROVE: "Duyệt báo cáo",
    REJECT: "Từ chối báo cáo",
};

const REJECT_REASONS = [
    "Báo cáo trùng",
    "Sai sản lượng",
    "Sai thời gian",
    "Sai máy hoặc sản phẩm",
    "Thiếu dữ liệu",
    "Lý do khác",
];

function ReportDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const source = searchParams.get("source") === "pending" ? "pending" : "approved";

    const [report, setReport] = useState<ProductionReport | null>(null);
    const [logs, setLogs] = useState<ReportActionLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [rejectOpen, setRejectOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
    const [rejectDetail, setRejectDetail] = useState("");

    const role = useMemo(() => {
        const savedUser = localStorage.getItem("user");
        try { return savedUser ? JSON.parse(savedUser)?.role || "manager" : "manager"; }
        catch { return "manager"; }
    }, []);

    const canEdit = role === "manager" || role === "admin";
    const canReview = ["lead", "manager", "admin"].includes(role);
    const basePath = role === "lead" ? "/lead" : "/manager";
    const reportId = Number(id);

    const loadReport = async () => {
        try {
            setLoading(true);
            setError("");
            if (!Number.isInteger(reportId) || reportId <= 0) {
                setError("ID báo cáo không hợp lệ.");
                return;
            }
            const data = source === "pending" ? await getTempReportById(reportId) : await getReportById(reportId);
            setReport(data || null);
            if (source === "pending") {
                setLogs(await getTempReportActionLogs(reportId));
            }
        } catch (err: unknown) {
            console.error("LOAD REPORT DETAIL ERROR:", err);
            setError(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể tải thông tin báo cáo." : "Không thể tải thông tin báo cáo.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void loadReport(); }, [id, source]);

    const approve = async () => {
        if (!report) return;
        try {
            setSubmitting(true);
            await approveSelectedTempReports([Number(report.id)]);
            navigate(`${basePath}/reports`, { replace: true });
        } catch (err: unknown) {
            setError(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể duyệt báo cáo." : "Không thể duyệt báo cáo.");
        } finally { setSubmitting(false); }
    };

    const reject = async () => {
        if (!report) return;
        const reason = rejectReason === "Lý do khác" ? rejectDetail.trim() : [rejectReason, rejectDetail.trim()].filter(Boolean).join(": ");
        if (!reason) { setError("Vui lòng nhập lý do từ chối."); return; }
        try {
            setSubmitting(true);
            await rejectSelectedTempReports([Number(report.id)], reason);
            navigate(`${basePath}/reports`, { replace: true });
        } catch (err: unknown) {
            setError(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể từ chối báo cáo." : "Không thể từ chối báo cáo.");
        } finally { setSubmitting(false); }
    };

    if (loading) return <main className="report-detail-page"><div className="detail-state">Đang tải báo cáo...</div></main>;
    if (error && !report) return <main className="report-detail-page"><div className="detail-state detail-state-error">{error}</div><button className="detail-back-button" type="button" onClick={() => navigate(-1)}>Quay lại</button></main>;
    if (!report) return null;

    const defects = getAllReportDefects(report).filter(item => Number(item.quantity) > 0);
    const totalDefects = defects.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const deductions = Array.isArray(report.deductions) ? report.deductions.filter(item => Number(item.hours) > 0) : [];
    const totalOutput = Number(report.tt_ok || 0) + Number(report.tt_ng || 0);
    const expectedMax = Number(report.standard_output || 0) * Number(report.actual_time || 0);
    const outputWarning = expectedMax > 0 && totalOutput > expectedMax;

    return (
        <main className="report-detail-page">
            <header className="report-detail-header">
                <div>
                    <button className="detail-link-button" type="button" onClick={() => navigate(-1)}>← Quay lại danh sách</button>
                    <h1>{report.worker_code || "---"} - {report.full_name || "Không có tên"}</h1>
                    <span className={`detail-status ${source === "approved" ? "is-approved" : "is-pending"}`}>{source === "approved" ? "Đã duyệt" : "Chờ duyệt"}</span>
                </div>
                {canEdit && source === "pending" && <button className="detail-edit-button" type="button" onClick={() => navigate(`${basePath}/report/${report.id}/edit?source=${source}`)}>✎ Sửa báo cáo</button>}
            </header>

            {error && <div className="detail-inline-error">{error}</div>}
            {outputWarning && <div className="detail-warning">⚠ Tổng OK + NG đang lớn hơn định mức × thời gian thực tế. Cần kiểm tra trước khi duyệt.</div>}

            <section className="detail-basic-card">
                <h2>Thông tin cần kiểm tra</h2>
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
                <h2>Sản lượng</h2>
                <div className="detail-summary-row">
                    <div><span>Định mức</span><strong>{formatNumber(Math.round(Number(report.standard_output) || 0))} SP/h</strong></div>
                    <div><span>OK</span><strong>{formatNumber(report.tt_ok)}</strong></div>
                    <div><span>Tổng NG</span><strong>{formatNumber(report.tt_ng)}</strong></div>
                    <div className={outputWarning ? "is-warning" : ""}><span>Tổng OK + NG</span><strong>{formatNumber(totalOutput)}</strong></div>
                    <div><span>Giới hạn tham chiếu</span><strong>{formatNumber(Math.floor(expectedMax))}</strong></div>
                </div>
            </section>

            <section className="detail-basic-card">
                <h2>Thời gian</h2>
                <div className="detail-summary-row detail-time-row">
                    <div><span>Thời gian làm việc</span><strong>{formatNumber(report.total_time)} giờ</strong></div>
                    <div><span>Tổng thời gian trừ</span><strong>{formatNumber(Number(report.deduction_time || 0) * 60)} phút</strong></div>
                    <div><span>Thời gian thực tế</span><strong>{formatNumber(report.actual_time)} giờ</strong></div>
                </div>
            </section>

            <div className="detail-two-column">
                <section className="detail-basic-card detail-list-card">
                    <div className="detail-list-heading"><h2>Chi tiết NG</h2><span>{defects.length} loại · Tổng {formatNumber(totalDefects)}</span></div>
                    {defects.length === 0 ? <div className="detail-empty-list">Không có lỗi NG.</div> : <div className="detail-list">{defects.map((item, index) => <div className="detail-list-row" key={item.id ?? `${item.defect_type_id}-${index}`}><span>{item.defect_name || item.defect_code || `Lỗi ${index + 1}`}</span><strong>{formatNumber(item.quantity)}</strong></div>)}</div>}
                </section>
                <section className="detail-basic-card detail-list-card">
                    <div className="detail-list-heading"><h2>Thời gian trừ</h2><span>{deductions.length} mục</span></div>
                    {deductions.length === 0 ? <div className="detail-empty-list">Không có thời gian trừ.</div> : <div className="detail-list">{deductions.map((item, index) => <div className="detail-list-row" key={item.id ?? `${item.deduction_type_id}-${index}`}><span>{item.deduction_name || item.deduction_code || `Mục ${index + 1}`}</span><strong>{formatNumber(Number(item.hours) * 60)} phút</strong></div>)}</div>}
                </section>
            </div>

            {source === "pending" && <section className="detail-basic-card"><h2>Lịch sử báo cáo</h2>{logs.length === 0 ? <div className="detail-empty-list">Chưa có nhật ký.</div> : <div className="detail-timeline">{logs.map(log => <div className="detail-timeline-item" key={log.id}><span className="detail-timeline-dot"/><div><strong>{ACTION_LABELS[log.action] || log.action}</strong><p>{log.full_name || log.username || "Hệ thống"}{log.note ? ` · ${log.note}` : ""}</p><time>{formatDateTime(log.created_at)}</time></div></div>)}</div>}</section>}

            <section className="detail-basic-card"><h2>Thông tin hệ thống</h2><div className="detail-basic-grid"><div className="detail-basic-item"><span>Mã báo cáo</span><strong>#{report.id}</strong></div><div className="detail-basic-item"><span>Thời gian tạo</span><strong>{formatDateTime(report.created_at)}</strong></div><div className="detail-basic-item"><span>Cập nhật gần nhất</span><strong>{formatDateTime(report.updated_at)}</strong></div>{source === "approved" && <div className="detail-basic-item"><span>Thời gian duyệt</span><strong>{formatDateTime(report.approved_at)}</strong></div>}</div></section>

            {source === "pending" && canReview && <div className="detail-sticky-actions"><button className="detail-reject-button" type="button" disabled={submitting} onClick={() => setRejectOpen(true)}>Từ chối</button><button className="detail-approve-button" type="button" disabled={submitting || outputWarning} onClick={() => void approve()}>{submitting ? "Đang xử lý..." : "Duyệt báo cáo"}</button></div>}

            {rejectOpen && <div className="detail-modal-backdrop" role="presentation" onMouseDown={() => !submitting && setRejectOpen(false)}><div className="detail-modal" role="dialog" aria-modal="true" onMouseDown={event => event.stopPropagation()}><h2>Từ chối báo cáo</h2><p>Báo cáo sẽ rời danh sách chờ và công nhân nhận được lý do.</p><label>Lý do<select value={rejectReason} onChange={event => setRejectReason(event.target.value)}>{REJECT_REASONS.map(reason => <option key={reason}>{reason}</option>)}</select></label><label>Chi tiết<textarea value={rejectDetail} onChange={event => setRejectDetail(event.target.value)} placeholder="Có thể bổ sung nội dung cần sửa" rows={3}/></label><div className="detail-modal-actions"><button type="button" disabled={submitting} onClick={() => setRejectOpen(false)}>Hủy</button><button className="detail-reject-button" type="button" disabled={submitting} onClick={() => void reject()}>{submitting ? "Đang xử lý..." : "Xác nhận từ chối"}</button></div></div></div>}
        </main>
    );
}

export default ReportDetail;
