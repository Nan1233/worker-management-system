import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import {
    approveSelectedTempReports,
    getReportById,
    getTempReportDetail,
    rejectSelectedTempReports
} from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import { useToast } from "../../components/feedback/toastContext";
import { decimalHoursToMinutes, formatMinutes } from "../../utils/timeDisplay";
import { getStoredUser } from "../../utils/authStorage";
import { usePermissions } from "../../hooks/usePermissions";
const REJECT_REASONS = [
    "Báo cáo trùng",
    "Sai sản lượng",
    "Sai thời gian",
    "Sai máy hoặc sản phẩm",
    "Thiếu dữ liệu",
    "Lý do khác"
];

const formatDate = (value?: string | null) => {
    if (!value) return "---";
    const raw = value.split("T")[0];
    const [year, month, day] = raw.split("-");
    return year && month && day ? `${day}/${month}/${year}` : value;
};

const formatNumber = (value?: number | string | null) =>
    Number(value ?? 0).toLocaleString("vi-VN", { maximumFractionDigits: 3 });

const detailText = (
    items: Array<{
        deduction_name?: string | null;
        deduction_code?: string | null;
        defect_name?: string | null;
        defect_code?: string | null;
        hours?: number | string | null;
        quantity?: number | string | null;
    }> | undefined,
    type: "deduction" | "defect"
) => {
    const valid = (items || []).filter((item) =>
        type === "deduction" ? Number(item.hours) > 0 : Number(item.quantity) > 0
    );

    if (valid.length === 0) return "---";

    return valid
        .map((item) => {
            if (type === "deduction") {
                const label = item.deduction_name || item.deduction_code || "Khác";
                const hours = Number(item.hours) || 0;
                return `${label}: ${formatMinutes(hours)} (${hours.toLocaleString("vi-VN", { maximumFractionDigits: 3 })} giờ)`;
            }

            const label = item.defect_name || item.defect_code || "Khác";
            return `${label}: ${formatNumber(item.quantity)}`;
        })
        .join("; ");
};

function SelectedReportsReview() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { showToast } = useToast();
    const source = searchParams.get("source") === "approved" ? "approved" : "pending";

    const [reports, setReports] = useState<ProductionReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [loadAttempt, setLoadAttempt] = useState(0);
    const [error, setError] = useState("");
    const [rejectOpen, setRejectOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
    const [rejectDetail, setRejectDetail] = useState("");

    const role = getStoredUser()?.role || "manager";
    const { can } = usePermissions();

    const basePath = role === "lead" ? "/lead" : role === "admin" ? "/admin" : "/manager";
    const canEdit = source === "pending" ? can("REPORT_PENDING_EDIT") : can("REPORT_APPROVED_EDIT");
    const canReview = can("REPORT_APPROVE");
    const storageKey = source === "approved"
        ? "selectedApprovedReportIds"
        : "selectedPendingReportIds";

    useEffect(() => {
        const loadReports = async () => {
            try {
                setLoading(true);
                setError("");

                const stored = sessionStorage.getItem(storageKey);
                const parsed: unknown = stored ? JSON.parse(stored) : [];
                const ids = Array.isArray(parsed)
                    ? parsed
                        .map((value: unknown) => Number(value))
                        .filter((value: number) => Number.isInteger(value) && value > 0)
                    : [];

                if (ids.length === 0) {
                    setReports([]);
                    return;
                }

                const results = await Promise.allSettled(
                    ids.map((id: number) =>
                        source === "approved"
                            ? getReportById(id, "approved")
                            : getTempReportDetail(id)
                    )
                );

                const data = results
                    .filter(
                        (result): result is PromiseFulfilledResult<ProductionReport> =>
                            result.status === "fulfilled" && Boolean(result.value)
                    )
                    .map((result) => result.value);

                if (data.length < ids.length) {
                    setError(
                        `Không tải được ${ids.length - data.length}/${ids.length} báo cáo. Bạn có thể thử tải lại.`
                    );
                }
                setReports(data);
            } catch (err) {
                console.error("LOAD SELECTED REPORTS ERROR:", err);
                setError("Không thể tải chi tiết các báo cáo đã chọn.");
            } finally {
                setLoading(false);
            }
        };

        void loadReports();
    }, [source, storageKey, loadAttempt]);

    const reportIds = useMemo(
        () => reports
            .map((report) => Number(report.id))
            .filter((id) => Number.isInteger(id) && id > 0),
        [reports]
    );

    const reviewTargets = useMemo(
        () => reports
            .map((report) => ({
                id: Number(report.id),
                expected_updated_at: report.updated_at || null
            }))
            .filter((item) => Number.isInteger(item.id) && item.id > 0),
        [reports]
    );

    const handleApprove = async () => {
        if (source !== "pending" || reportIds.length === 0 || submitting) return;

        try {
            setSubmitting(true);
            setError("");
            await approveSelectedTempReports(reviewTargets);
            sessionStorage.removeItem("selectedPendingReportIds");
            showToast(`Đã duyệt ${reportIds.length} báo cáo`, "success");
            navigate(`${basePath}/reports`);
        } catch (err) {
            console.error("APPROVE SELECTED REPORTS ERROR:", err);
            setError(axios.isAxiosError(err)
                ? err.response?.data?.message || "Duyệt báo cáo thất bại. Vui lòng kiểm tra lại dữ liệu."
                : "Duyệt báo cáo thất bại. Vui lòng kiểm tra lại dữ liệu.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleReject = async () => {
        if (source !== "pending" || reportIds.length === 0 || submitting) return;

        const reason = rejectReason === "Lý do khác"
            ? rejectDetail.trim()
            : [rejectReason, rejectDetail.trim()].filter(Boolean).join(": ");

        if (!reason) {
            setError("Vui lòng nhập lý do từ chối.");
            return;
        }

        try {
            setSubmitting(true);
            setError("");
            await rejectSelectedTempReports(reviewTargets, reason);
            sessionStorage.removeItem("selectedPendingReportIds");
            showToast(`Đã từ chối ${reportIds.length} báo cáo`, "success");
            navigate(`${basePath}/reports`);
        } catch (err) {
            console.error("REJECT SELECTED REPORTS ERROR:", err);
            setError(axios.isAxiosError(err)
                ? err.response?.data?.message || "Từ chối báo cáo thất bại. Vui lòng kiểm tra lại dữ liệu."
                : "Từ chối báo cáo thất bại. Vui lòng kiểm tra lại dữ liệu.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="selected-reports-review">
            {error && <div className="detail-inline-error">{error}</div>}
            <header className="selected-reports-review__header">
                <button type="button" onClick={() => navigate(-1)}>← Quay lại</button>
                <div>
                    <h1>Chi tiết báo cáo đã chọn</h1>
                    <p>{reports.length} báo cáo</p>
                </div>
                <div className="selected-reports-review__actions">
                    {canEdit && reports.length === 1 && (
                        <button type="button" onClick={() => navigate(`${basePath}/report/${reportIds[0]}/edit?source=${source}`)}>
                            ✎ Sửa báo cáo
                        </button>
                    )}
                    {canReview && source === "pending" && <button type="button" disabled={submitting || reportIds.length === 0} onClick={() => setRejectOpen(true)}>Từ chối</button>}
                    {canReview && source === "pending" && <button type="button" disabled={submitting || reportIds.length === 0} onClick={() => void handleApprove()}>✓ Duyệt</button>}
                </div>
            </header>
            <section className="selected-reports-review__body">
                {loading ? <div className="detail-state">Đang tải...</div> : reports.length === 0 ? <div className="detail-state">Không có báo cáo.</div> : reports.map((report) => (
                    <article key={report.id} className="selected-report-card">
                        <div className="selected-report-card__grid">
                            <div><span>Ngày</span><strong>{formatDate(report.work_date)}</strong></div>
                            <div><span>Mã CN</span><strong>{report.worker_code || "---"}</strong></div>
                            <div><span>Họ tên</span><strong>{report.full_name || report.worker_name || "---"}</strong></div>
                            <div><span>Máy</span><strong>{report.machine_no || "---"}</strong></div>
                            <div><span>Sản phẩm</span><strong>{report.product_name || "---"}</strong></div>
                            <div><span>TT giờ</span><strong>{formatNumber(report.actual_time)}</strong></div>
                            <div><span>Trừ giờ</span><strong>{formatNumber(report.deduction_time)}</strong></div>
                            <div><span>Tổng giờ</span><strong>{formatNumber(report.total_time)}</strong></div>
                            <div><span>TT OK</span><strong>{formatNumber(report.tt_ok)}</strong></div>
                            <div><span>TT NG</span><strong>{formatNumber(report.tt_ng)}</strong></div>
                            <div><span>Chi tiết Trừ giờ</span><strong>{detailText(report.deductions, "deduction")}</strong></div>
                            <div><span>Chi tiết NG</span><strong>{detailText(report.defects, "defect")}</strong></div>
                        </div>
                    </article>
                ))}
            </section>
            {rejectOpen && (
                <div className="detail-reject-modal-backdrop" role="dialog" aria-modal="true">
                    <div className="detail-reject-modal">
                        <h3>Từ chối báo cáo</h3>
                        <label>Lý do<select value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}>{REJECT_REASONS.map((reason) => <option key={reason}>{reason}</option>)}</select></label>
                        <label>Chi tiết<textarea value={rejectDetail} onChange={(e) => setRejectDetail(e.target.value)} rows={3} placeholder="Nhập thêm nếu cần..." /></label>
                        <div className="detail-reject-modal-actions"><button type="button" onClick={() => setRejectOpen(false)} disabled={submitting}>Hủy</button><button type="button" className="detail-reject-button" onClick={() => void handleReject()} disabled={submitting}>{submitting ? "Đang xử lý..." : "Xác nhận từ chối"}</button></div>
                    </div>
                </div>
            )}
        </main>
    );
}

export default SelectedReportsReview;