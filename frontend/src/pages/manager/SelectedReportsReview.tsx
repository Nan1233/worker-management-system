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
    // Tổ trưởng (lead) tuyệt đối không được sửa, kể cả khi permission DB bị cấp nhầm.
    const canEdit = role !== "lead" && (source === "pending" ? can("REPORT_PENDING_EDIT") : can("REPORT_APPROVED_EDIT"));
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
                ? err.response?.data?.message || "Từ chối báo cáo thất bại. Vui lòng thử lại."
                : "Từ chối báo cáo thất bại. Vui lòng thử lại.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="selected-review-page manager-page">
            <header className="selected-review-header">
                <div>
                    <button
                        type="button"
                        className="selected-review-back"
                        onClick={() => navigate(-1)}
                    >
                        ← Quay lại danh sách
                    </button>
                    <h1>
                        {source === "approved"
                            ? "Chi tiết báo cáo đã duyệt"
                            : "Chi tiết báo cáo chờ duyệt"}
                    </h1>
                    <p>{reports.length} báo cáo được hiển thị trong một bảng ngang.</p>
                </div>

                {source === "pending" && canReview && (
                    <div className="selected-review-actions">
                        <button
                            type="button"
                            className="selected-review-reject"
                            disabled={submitting || reportIds.length === 0}
                            onClick={() => setRejectOpen(true)}
                        >
                            Từ chối {reportIds.length} báo cáo
                        </button>
                        <button
                            type="button"
                            className="selected-review-approve"
                            disabled={submitting || reportIds.length === 0}
                            onClick={handleApprove}
                        >
                            {submitting ? "Đang xử lý..." : `Duyệt ${reportIds.length} báo cáo`}
                        </button>
                    </div>
                )}
            </header>

            {error && (
                <div className="selected-review-error" role="alert" aria-live="assertive">
                    <span>{error}</span>
                    <button type="button" onClick={() => setLoadAttempt((value) => value + 1)} disabled={loading}>
                        Tải lại
                    </button>
                </div>
            )}

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
                                    <th className="sticky-col sticky-col-1">STT</th>
                                    <th className="sticky-col sticky-col-2">Mã NV</th>
                                    <th className="sticky-col sticky-col-3">Họ tên</th>
                                    <th className="sticky-col sticky-col-4">Ngày</th>
                                    <th className="sticky-col sticky-col-5">Công đoạn</th>
                                    <th className="sticky-col sticky-col-6">Ca</th>
                                    <th className="sticky-col sticky-col-7">Mã máy</th>
                                    <th className="sticky-col sticky-col-8">Mã sản phẩm</th>
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
                                        <td className="sticky-col sticky-col-1">{index + 1}</td>
                                        <td className="sticky-col sticky-col-2"><strong>{report.worker_code || "---"}</strong></td>
                                        <td className="sticky-col sticky-col-3 selected-worker-name">{report.full_name || "Không có tên"}</td>
                                        <td className="sticky-col sticky-col-4">{formatDate(report.work_date)}</td>
                                        <td className="sticky-col sticky-col-5">{report.process_name || report.process_code || "---"}</td>
                                        <td className="sticky-col sticky-col-6">{report.shift || "---"}</td>
                                        <td className="sticky-col sticky-col-7">{report.machine_no || "---"}</td>
                                        <td className="sticky-col sticky-col-8">{report.product_name || "---"}</td>
                                        <td>{formatNumber(report.training_percent ?? 100)}%</td>
                                        <td>{formatNumber(report.standard_output)}</td>
                                        <td>{formatNumber(report.actual_output)}</td>
                                        <td>{formatNumber(report.tt_ok)}</td>
                                        <td>{formatNumber(report.tt_ng)}</td>
                                        <td>{formatNumber(report.total_time)}</td>
                                        <td>{decimalHoursToMinutes(report.deduction_time).toLocaleString("vi-VN")} phút</td>
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
                                                    onClick={() => navigate(
                                                        `${basePath}/report/${report.id}/edit?source=${source}`
                                                    )}
                                                >
                                                    Sửa
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
            {rejectOpen && (
                <div
                    className="selected-reject-backdrop"
                    role="presentation"
                    onMouseDown={() => !submitting && setRejectOpen(false)}
                >
                    <div
                        className="selected-reject-modal"
                        role="dialog"
                        aria-modal="true"
                        onMouseDown={event => event.stopPropagation()}
                    >
                        <h2>Từ chối báo cáo</h2>
                        <p>{reportIds.length} báo cáo sẽ được trả lại cho công nhân kèm lý do.</p>
                        <label>
                            Lý do
                            <select value={rejectReason} onChange={event => setRejectReason(event.target.value)}>
                                {REJECT_REASONS.map(reason => <option key={reason}>{reason}</option>)}
                            </select>
                        </label>
                        <label>
                            Chi tiết
                            <textarea
                                value={rejectDetail}
                                onChange={event => setRejectDetail(event.target.value)}
                                placeholder="Nội dung công nhân cần kiểm tra và sửa"
                                rows={3}
                            />
                        </label>
                        <div className="selected-reject-actions">
                            <button type="button" disabled={submitting} onClick={() => setRejectOpen(false)}>Hủy</button>
                            <button type="button" className="selected-review-reject" disabled={submitting} onClick={() => void handleReject()}>
                                {submitting ? "Đang xử lý..." : "Xác nhận từ chối"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}

export default SelectedReportsReview;
