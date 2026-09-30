import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  approveSelectedTempReports,
  getTempReportById,
  getTempReportActionLogs,
  type ReportActionLog,
  rejectSelectedTempReports,
} from "../../services/productionService";
import { getStoredUser } from "../../utils/authStorage";
import { usePermissions } from "../../hooks/usePermissions";
import WorkerReportEditV2 from "../worker/WorkerReportEditV2";
import "./ReportDetail.css";

const REJECT_REASONS = ["Báo cáo trùng", "Sai sản lượng", "Sai thời gian", "Sai máy hoặc sản phẩm", "Thiếu dữ liệu", "Lý do khác"];

export default function ReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const source = searchParams.get("source") === "approved" ? "approved" : "pending";
  const reportId = Number(id);
  const role = useMemo(() => getStoredUser()?.role || "manager", []);
  const { can } = usePermissions();
  const basePath = role === "lead" ? "/lead" : role === "admin" ? "/admin" : "/manager";
  const canEdit = source === "pending" ? can("REPORT_PENDING_EDIT") : can("REPORT_APPROVED_EDIT");
  const canReview = source === "pending" && can("REPORT_APPROVE");
  const [report, setReport] = useState<any>(null);
  const [logs, setLogs] = useState<ReportActionLog[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
  const [rejectDetail, setRejectDetail] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        if (!Number.isInteger(reportId) || reportId <= 0) throw new Error("ID báo cáo không hợp lệ.");
        if (source === "pending") {
          const data = await getTempReportById(reportId);
          if (!alive) return;
          setReport(data);
          setLogs(await getTempReportActionLogs(reportId).catch(() => []));
        }
      } catch (e: any) {
        if (alive) setError(e?.response?.data?.message || e?.message || "Không thể tải báo cáo.");
      }
    };
    void load();
    return () => { alive = false; };
  }, [reportId, source]);

  const approve = async () => {
    if (!report || submitting) return;
    try {
      setSubmitting(true); setError("");
      await approveSelectedTempReports([{ id: Number(report.id), expected_updated_at: report.updated_at || null }]);
      navigate(`${basePath}/reports`, { replace: true });
    } catch (e: any) { setError(e?.response?.data?.message || "Không thể duyệt báo cáo."); }
    finally { setSubmitting(false); }
  };

  const reject = async () => {
    if (!report || submitting) return;
    const reason = rejectReason === "Lý do khác" ? rejectDetail.trim() : [rejectReason, rejectDetail.trim()].filter(Boolean).join(": ");
    if (!reason) { setError("Vui lòng nhập lý do từ chối."); return; }
    try {
      setSubmitting(true); setError("");
      await rejectSelectedTempReports([{ id: Number(report.id), expected_updated_at: report.updated_at || null }], reason);
      navigate(`${basePath}/reports`, { replace: true });
    } catch (e: any) { setError(e?.response?.data?.message || "Không thể từ chối báo cáo."); }
    finally { setSubmitting(false); }
  };

  return (
    <main className="manager-report-detail-exact-worker">
      <style>{`
        .manager-report-detail-exact-worker .manager-worker-report-readonly .worker-form-container { pointer-events: none; }
        .manager-report-detail-exact-worker .manager-worker-report-readonly .worker-sticky-date { pointer-events: none; }
        .manager-report-detail-exact-worker .manager-worker-report-readonly input,
        .manager-report-detail-exact-worker .manager-worker-report-readonly select,
        .manager-report-detail-exact-worker .manager-worker-report-readonly textarea { cursor: default; }
        .manager-worker-detail-toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 16px; margin-bottom:8px; }
        .manager-worker-detail-toolbar > button { border:1px solid #d7e3ef; background:#fff; border-radius:9px; padding:8px 12px; cursor:pointer; color:#174a7c; }
        .manager-worker-detail-actions { display:flex; gap:8px; }
        .manager-worker-detail-actions button { border-radius:9px; padding:8px 14px; }
        .manager-worker-log { margin:12px 16px; }
        .detail-reject-modal-backdrop { position:fixed; inset:0; z-index:1000; display:grid; place-items:center; background:rgba(15,35,58,.32); }
        .detail-reject-modal { width:min(520px,calc(100vw - 32px)); background:#fff; border-radius:14px; padding:20px; box-shadow:0 20px 60px rgba(15,35,58,.2); }
        .detail-reject-modal label { display:grid; gap:6px; margin-top:12px; color:#36536f; font-size:13px; }
        .detail-reject-modal select,.detail-reject-modal textarea { width:100%; box-sizing:border-box; border:1px solid #cfddea; border-radius:8px; padding:9px; font:inherit; }
        .detail-reject-modal-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:16px; }
      `}</style>
      <div className="manager-worker-detail-toolbar">
        <button type="button" onClick={() => navigate(-1)}>← Danh sách</button>
        <div className="manager-worker-detail-actions">
          {canEdit && <button type="button" className="detail-edit-button" onClick={() => navigate(`${basePath}/report/${reportId}/edit?source=${source}`)}>✎ Sửa báo cáo</button>}
          {canReview && <button type="button" className="detail-reject-button" disabled={submitting || !report} onClick={() => setRejectOpen(true)}>Từ chối</button>}
          {canReview && <button type="button" className="detail-approve-button" disabled={submitting || !report} onClick={() => void approve()}>✓ Duyệt</button>}
        </div>
      </div>
      {error && <div className="detail-inline-error" style={{ margin: "10px 16px" }}>{error}</div>}
      <WorkerReportEditV2 />
      {source === "pending" && logs.length > 0 && <details className="detail-collapsible manager-worker-log"><summary>Lịch sử xử lý ({logs.length})</summary><div className="detail-timeline">{logs.map((log) => <div className="detail-timeline-item" key={log.id}><span className="detail-timeline-dot"/><div><strong>{log.action}</strong><p>{log.full_name || log.username || "Hệ thống"}{log.note ? ` · ${log.note}` : ""}</p></div></div>)}</div></details>}
      {rejectOpen && <div className="detail-reject-modal-backdrop" role="dialog" aria-modal="true"><div className="detail-reject-modal"><h3>Từ chối báo cáo</h3><label>Lý do<select value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}>{REJECT_REASONS.map((reason) => <option key={reason}>{reason}</option>)}</select></label><label>Chi tiết<textarea value={rejectDetail} onChange={(e) => setRejectDetail(e.target.value)} rows={3} placeholder="Nhập thêm nếu cần..." /></label><div className="detail-reject-modal-actions"><button type="button" onClick={() => setRejectOpen(false)} disabled={submitting}>Hủy</button><button type="button" className="detail-reject-button" onClick={() => void reject()} disabled={submitting}>{submitting ? "Đang xử lý..." : "Xác nhận từ chối"}</button></div></div></div>}
    </main>
  );
}
