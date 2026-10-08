import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getReportById } from "../../services/productionService";
import { formatRemaining, getWorkerEditWindow } from "./reportEditWindow";

type CalloutReport = { status?: string; review_note?: string | null; created_at?: string; updated_at?: string };

/**
 * Entry point to the worker edit screen from the report detail page.
 * Shows the rejection reason and a "edit and resubmit" action while the
 * worker's edit window is open (pending/need_fix: 10 min from creation,
 * rejected: 10 min from rejection). Approved reports render nothing.
 */
export default function WorkerReportEditCallout() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [report, setReport] = useState<CalloutReport | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const source = searchParams.get("source");

  useEffect(() => {
    const reportId = Number(id);
    if (source === "approved" || !Number.isInteger(reportId) || reportId <= 0) return;
    let alive = true;
    getReportById(reportId, "pending")
      .then((raw: any) => { if (alive) setReport(raw?.report || raw?.data || raw || null); })
      .catch(() => { if (alive) setReport(null); });
    return () => { alive = false; };
  }, [id, source]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!report) return null;
  const editWindow = getWorkerEditWindow(report, now);
  const status = String(report.status || "").toLowerCase();
  const rejected = status === "rejected";
  if (!rejected && !editWindow.editable) return null;

  const tone = rejected
    ? { background: "#fff4f2", border: "#f2b8b0", color: "#8a1f11" }
    : { background: "#f5f9ff", border: "#b9d2f5", color: "#174ea6" };

  return (
    <section
      role="status"
      data-testid="worker-edit-callout"
      style={{ margin: "12px auto", maxWidth: 960, padding: "12px 16px", borderRadius: 10, border: `1px solid ${tone.border}`, background: tone.background, color: tone.color, display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}
    >
      <div style={{ minWidth: 0 }}>
        <strong>{rejected ? "Báo cáo đã bị từ chối" : "Báo cáo đang chờ duyệt"}</strong>
        {rejected && report.review_note ? <div>Lý do: {report.review_note}</div> : null}
        <div>
          {editWindow.editable
            ? `${rejected ? "Sửa và gửi lại" : "Có thể sửa"} trong ${formatRemaining(editWindow.remainingMs)} nữa.`
            : "Đã hết 10 phút sửa báo cáo. Vui lòng liên hệ quản lý nếu cần sửa hoặc tạo báo cáo mới."}
        </div>
      </div>
      {editWindow.editable && (
        <button
          type="button"
          className="primary"
          style={{ minHeight: 44, padding: "0 18px", borderRadius: 8, border: 0, background: "#174ea6", color: "#fff", fontWeight: 700, cursor: "pointer" }}
          onClick={() => navigate(`/worker/history/${id}/edit`)}
        >
          {rejected ? "Sửa và gửi lại" : "Sửa báo cáo"}
        </button>
      )}
    </section>
  );
}
