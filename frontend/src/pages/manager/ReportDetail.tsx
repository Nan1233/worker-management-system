import { useCallback, useEffect, useMemo, useState } from "react";
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
import { decimalHoursToMinutes, formatMinutes, sumDeductionMinutes } from "../../utils/timeDisplay";
import { getStoredUser } from "../../utils/authStorage";
import { usePermissions } from "../../hooks/usePermissions";
import { getReportVersions, type ReportVersion } from "../../services/systemService";
import MachineEventPanel from "./MachineEventPanel";
import "./ReportDetail.css";

const num = (value: unknown) => {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
};

const fmt = (value: unknown) => num(value).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const pct = (value: unknown) => `${fmt(value)}%`;
const dateText = (value?: string | null) => {
    if (!value) return "—";
    const raw = String(value).slice(0, 10);
    const [year, month, day] = raw.split("-");
    return year && month && day ? `${day}/${month}/${year}` : raw;
};
const dateTimeText = (value?: string | null) => {
    if (!value) return "—";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString("vi-VN");
};

const REJECT_REASONS = ["Báo cáo trùng", "Sai sản lượng", "Sai thời gian", "Sai máy hoặc sản phẩm", "Thiếu dữ liệu", "Lý do khác"];

function metricClass(kind: "productivity" | "pp", value: number, ngTypes: number) {
    if (kind === "productivity" && (value <= 75 || value > 100)) return "detail-metric danger";
    if (kind === "pp" && (value === 0 || ngTypes === 1)) return "detail-metric warning";
    return "detail-metric";
}

function ReportDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const source = searchParams.get("source") === "pending" ? "pending" : "approved";
    const reportId = Number(id);
    const role = useMemo(() => getStoredUser()?.role || "manager", []);
    const { can } = usePermissions();
    const basePath = role === "lead" ? "/lead" : role === "admin" ? "/admin" : "/manager";
    const canEdit = source === "pending" ? can("REPORT_PENDING_EDIT") : can("REPORT_APPROVED_EDIT");
    const canReview = can("REPORT_APPROVE");

    const [report, setReport] = useState<ProductionReport | null>(null);
    const [logs, setLogs] = useState<ReportActionLog[]>([]);
    const [versions, setVersions] = useState<ReportVersion[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [rejectOpen, setRejectOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
    const [rejectDetail, setRejectDetail] = useState("");

    const loadReport = useCallback(async () => {
        try {
            setLoading(true);
            setError("");
            if (!Number.isInteger(reportId) || reportId <= 0) throw new Error("ID báo cáo không hợp lệ.");
            const data = source === "pending" ? await getTempReportById(reportId) : await getReportById(reportId, "approved");
            setReport(data || null);
            if (source === "pending") {
                const actionLogs = await getTempReportActionLogs(reportId).catch(() => []);
                setLogs(actionLogs);
                setVersions([]);
            } else {
                const history = await getReportVersions(reportId, "approved").catch(() => []);
                setVersions(Array.isArray(history) ? history : []);
                setLogs([]);
            }
        } catch (err: any) {
            console.error("LOAD REPORT DETAIL ERROR:", err);
            setReport(null);
            setError(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể tải báo cáo." : err?.message || "Không thể tải báo cáo.");
        } finally {
            setLoading(false);
        }
    }, [reportId, source]);

    useEffect(() => { void loadReport(); }, [loadReport]);

    const approve = async () => {
        if (!report || submitting) return;
        try {
            setSubmitting(true);
            await approveSelectedTempReports([{ id: Number(report.id), expected_updated_at: report.updated_at || null }]);
            navigate(`${basePath}/reports`, { replace: true });
        } catch (err: any) {
            setError(err?.response?.data?.message || "Không thể duyệt báo cáo.");
        } finally { setSubmitting(false); }
    };

    const reject = async () => {
        if (!report || submitting) return;
        const reason = rejectReason === "Lý do khác" ? rejectDetail.trim() : [rejectReason, rejectDetail.trim()].filter(Boolean).join(": ");
        if (!reason) { setError("Vui lòng nhập lý do từ chối."); return; }
        try {
            setSubmitting(true);
            await rejectSelectedTempReports([{ id: Number(report.id), expected_updated_at: report.updated_at || null }], reason);
            navigate(`${basePath}/reports`, { replace: true });
        } catch (err: any) {
            setError(err?.response?.data?.message || "Không thể từ chối báo cáo.");
        } finally { setSubmitting(false); }
    };

    if (loading) return <main className="report-detail-page"><div className="detail-state">Đang tải báo cáo...</div></main>;
    if (!report) return <main className="report-detail-page"><div className="detail-state detail-state-error">{error || "Không tìm thấy báo cáo."}<button className="detail-back-button" type="button" onClick={() => navigate(-1)}>Quay lại</button></div></main>;

    const defects = getAllReportDefects(report).filter((item) => num(item.quantity) > 0);
    const deductions = Array.isArray(report.deductions) ? report.deductions.filter((item) => num(item.hours) > 0) : [];
    const ok = num(report.tt_ok);
    const ng = defects.reduce((sum, item) => sum + num(item.quantity), 0);
    const actual = ok + ng;
    const actualTime = num(report.actual_time);
    const standard = num(report.standard_output);
    const target = num(report.tt_dinh_muc) || (standard > 0 && actualTime > 0 ? standard * actualTime : 0);
    const productivity = target > 0 ? actual / target * 100 : 0;
    const achieved = actual > 0 ? ok / actual * 100 : 0;
    const pp = actual > 0 ? ng / actual * 100 : 0;
    const hv = num(report.training_percent ?? report.training_percent_snapshot ?? report.hv_percent ?? 0);
    const totalDeductionMinutes = deductions.length ? sumDeductionMinutes(deductions) : decimalHoursToMinutes(report.deduction_time);
    const expectedMax = standard > 0 && actualTime > 0 ? standard * actualTime : 0;
    const outputWarning = expectedMax > 0 && actual > expectedMax;
    const ppTypeCount = defects.length;
    const reportCode = `PR${String(report.work_date || "REPORT").slice(0, 10).replace(/-/g, "")}-${report.worker_code || String(report.id || "").padStart(4, "0")}`;

    return (
        <main className="report-detail-page">
            <header className="report-detail-header">
                <div className="detail-title-wrap">
                    <button className="detail-link-button" type="button" onClick={() => navigate(-1)}>← Danh sách</button>
                    <div className="detail-title-line"><h1>{report.full_name || report.worker_name || report.worker_code || "Không có tên"}</h1><span className={`detail-status ${source === "approved" ? "is-approved" : "is-pending"}`}>{source === "approved" ? "Đã duyệt" : "Chờ duyệt"}</span></div>
                    <p>{report.worker_code || "—"} · {report.process_name || report.process_code || "—"} · Ca {report.shift || "—"} · {dateText(report.work_date)} · {reportCode}</p>
                </div>
                <div className="detail-header-actions">
                    <span className="detail-position">Báo cáo #{report.id}</span>
                    {canEdit && <button className="detail-edit-button" type="button" onClick={() => navigate(`${basePath}/report/${report.id}/edit?source=${source}`)}>✎ Sửa báo cáo</button>}
                </div>
            </header>

            {error && <div className="detail-inline-error">{error}</div>}
            {outputWarning && <div className="detail-warning">Tổng OK + NG ({fmt(actual)}) đang cao hơn định mức × thời gian ({fmt(expectedMax)}). Cần kiểm tra.</div>}

            <section className="detail-basic-card detail-info-card">
                <div className="detail-card-title"><h2>Thông tin báo cáo</h2><span>{report.status === "approved" || source === "approved" ? "Đã lưu chính thức" : "Đang chờ duyệt"}</span></div>
                <div className="detail-basic-grid">
                    <div className="detail-basic-item"><span>Công nhân</span><strong>{report.full_name || report.worker_name || "—"} ({report.worker_code || "—"})</strong></div>
                    <div className="detail-basic-item"><span>Công đoạn</span><strong>{report.process_name || report.process_code || "—"}</strong></div>
                    <div className="detail-basic-item"><span>Máy</span><strong>{report.machine_no || "—"}</strong></div>
                    <div className="detail-basic-item"><span>Sản phẩm</span><strong>{report.product_name || "—"}</strong></div>
                    <div className="detail-basic-item"><span>Ngày báo cáo</span><strong>{dateText(report.work_date)}</strong></div>
                    <div className="detail-basic-item"><span>% học việc</span><strong>{pct(hv)}</strong></div>
                </div>
            </section>

            <section className="detail-basic-card">
                <div className="detail-card-title"><h2>Sản lượng & chỉ tiêu</h2><span>Giá trị màu = cùng quy tắc với danh sách</span></div>
                <div className="detail-metric-grid">
                    <div className="detail-metric"><span>Định mức</span><strong>{fmt(standard)} SP/h</strong></div>
                    <div className="detail-metric"><span>TT OK</span><strong>{fmt(ok)}</strong></div>
                    <div className="detail-metric"><span>NG</span><strong>{fmt(ng)}</strong></div>
                    <div className="detail-metric"><span>Tổng</span><strong>{fmt(actual)}</strong></div>
                    <div className={metricClass("productivity", productivity, ppTypeCount)}><span>% năng suất</span><strong>{pct(productivity)}</strong></div>
                    <div className="detail-metric"><span>% đạt</span><strong>{pct(achieved)}</strong></div>
                    <div className={metricClass("pp", pp, ppTypeCount)}><span>% PP · {ppTypeCount} loại NG</span><strong>{pct(pp)} {pp === 0 || ppTypeCount === 1 ? "⚠" : ""}</strong></div>
                </div>
            </section>

            <div className="detail-two-column">
                <section className="detail-basic-card detail-list-card">
                    <div className="detail-card-title"><h2>Chi tiết lỗi NG</h2><span>{defects.length} loại · Tổng {fmt(ng)}</span></div>
                    {defects.length === 0 ? <div className="detail-empty-list">Không có lỗi NG.</div> : <div className="detail-list">{defects.map((item, index) => <div className="detail-list-row" key={`${item.defect_type_id || item.id || index}-${item.defect_name}`}><span><b>{item.defect_name || item.defect_code || `Lỗi ${index + 1}`}</b>{item.defect_code && <small>{item.defect_code}</small>}</span><strong>{fmt(item.quantity)}</strong></div>)}</div>}
                </section>
                <section className="detail-basic-card detail-list-card">
                    <div className="detail-card-title"><h2>Thời gian</h2><span>{totalDeductionMinutes} phút trừ</span></div>
                    <div className="detail-time-metrics"><div><span>Thực tế</span><strong>{fmt(actualTime)} giờ</strong></div><div><span>Tổng trừ</span><strong>{totalDeductionMinutes} phút</strong></div><div><span>Tổng</span><strong>{fmt(report.total_time)} giờ</strong></div></div>
                    {deductions.length === 0 ? <div className="detail-empty-list">Không có thời gian trừ.</div> : <div className="detail-list compact">{deductions.map((item, index) => <div className="detail-list-row" key={`${item.deduction_type_id || item.id || index}-${item.deduction_name}`}><span>{item.deduction_name || item.deduction_code || `Khoản ${index + 1}`}</span><strong>{formatMinutes(item.hours)}</strong></div>)}</div>}
                </section>
            </div>

            {Array.isArray(report.machine_lines) && report.machine_lines.length > 0 && (
                <details className="detail-collapsible"><summary>Chi tiết máy ({report.machine_lines.length})</summary><div className="machine-event-panels">{report.machine_lines.map((line, index) => <MachineEventPanel key={line.id ?? `${line.machine_code}-${index}`} report={report} line={line} source={source} onChanged={loadReport} />)}</div></details>
            )}

            {(report.note || report.notes) && <section className="detail-basic-card detail-note-card"><div className="detail-card-title"><h2>Ghi chú</h2></div><p>{report.note || report.notes}</p></section>}

            {source === "pending" && logs.length > 0 && <details className="detail-collapsible"><summary>Lịch sử xử lý ({logs.length})</summary><div className="detail-timeline">{logs.map((log) => <div className="detail-timeline-item" key={log.id}><span className="detail-timeline-dot"/><div><strong>{log.action}</strong><p>{log.full_name || log.username || "Hệ thống"}{log.note ? ` · ${log.note}` : ""}</p><time>{dateTimeText(log.created_at)}</time></div></div>)}</div></details>}

            {source === "approved" && versions.length > 0 && <details className="detail-collapsible"><summary>Lịch sử phiên bản ({versions.length})</summary><div className="detail-version-compact">{versions.map((version) => <div key={version.id}><b>V{version.version_no}</b><span>{version.change_reason || "Cập nhật dữ liệu"}</span><small>{version.created_by_name || "Hệ thống"} · {dateTimeText(version.created_at)}</small></div>)}</div></details>}

            {source === "pending" && canReview && <div className="detail-sticky-actions"><button className="detail-reject-button" type="button" disabled={submitting} onClick={() => setRejectOpen(true)}>Từ chối</button><button className="detail-approve-button" type="button" disabled={submitting || outputWarning} onClick={() => void approve()}>{submitting ? "Đang xử lý..." : "Duyệt báo cáo"}</button></div>}

            {rejectOpen && <div className="detail-modal-backdrop" role="presentation" onMouseDown={() => !submitting && setRejectOpen(false)}><div className="detail-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><h2>Từ chối báo cáo</h2><p>Báo cáo sẽ rời danh sách chờ và công nhân nhận được lý do.</p><label>Lý do<select value={rejectReason} onChange={(event) => setRejectReason(event.target.value)}>{REJECT_REASONS.map((reason) => <option key={reason}>{reason}</option>)}</select></label><label>Chi tiết<textarea value={rejectDetail} onChange={(event) => setRejectDetail(event.target.value)} rows={2} /></label><div className="detail-modal-actions"><button type="button" disabled={submitting} onClick={() => setRejectOpen(false)}>Hủy</button><button className="detail-reject-button" type="button" disabled={submitting} onClick={() => void reject()}>{submitting ? "Đang xử lý..." : "Xác nhận"}</button></div></div></div>}
        </main>
    );
}

export default ReportDetail;
