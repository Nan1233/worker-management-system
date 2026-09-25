import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getReportById } from "../../services/productionService";
import WorkerReportEditV2 from "./WorkerReportEditV2";

const EDIT_WINDOW_MS = 10 * 60 * 1000;

const parseDbDateMs = (value?: string | null) => {
  if (!value) return NaN;
  const text = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)
    ? `${text.replace(" ", "T")}Z`
    : text;
  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? parsed : NaN;
};

export default function ProductionDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const source = searchParams.get("source");
  const navigate = useNavigate();
  const [report, setReport] = useState<any>(null);
  const [createdAt, setCreatedAt] = useState<number>(NaN);
  const [status, setStatus] = useState<string>("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const reportId = Number(id);
        if (!Number.isInteger(reportId) || reportId <= 0) throw new Error("ID báo cáo không hợp lệ.");
        const normalized = String(source || "").toLowerCase();
        const candidates: Array<"pending" | "approved"> = normalized === "approved" ? ["approved", "pending"] : ["pending", "approved"];
        let data: any = null;
        let lastError: any = null;
        for (const candidate of candidates) {
          try {
            const raw: any = await getReportById(reportId, candidate);
            data = raw?.report || raw?.data || raw;
            if (data) break;
          } catch (err: any) {
            lastError = err;
            if (err?.response?.status !== 404) throw err;
          }
        }
        if (!data) throw new Error(lastError?.response?.data?.message || "Không tìm thấy báo cáo.");
        if (!alive) return;
        setReport(data);
        setCreatedAt(parseDbDateMs(data.created_at));
        setStatus(String(data.status || "pending"));
      } catch (err: any) {
        if (alive) setError(err?.response?.data?.message || err?.message || "Không thể tải báo cáo.");
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => { alive = false; };
  }, [id, source]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (loading) {
    return <main className="worker-form-page"><div className="worker-form-shell"><div className="worker-form-card">Đang tải biểu mẫu...</div></div></main>;
  }

  if (error) {
    return <main className="worker-form-page"><div className="worker-form-shell"><div className="worker-form-card" style={{ color: "#b42318" }}>{error}</div></div></main>;
  }

  const remainingMs = Number.isFinite(createdAt) ? Math.max(0, createdAt + EDIT_WINDOW_MS - now) : 0;
  const canEdit = (status === "pending" || status === "need_fix") && remainingMs > 0;
  const seconds = Math.ceil(remainingMs / 1000);
  const remainingText = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const processTitle = String(report?.process_name || report?.process_code || "Gia công");
  const workerName = String(report?.full_name || report?.worker_name || "");
  const workerCode = String(report?.worker_code || "");
  const trainingPercent = String(report?.training_percent_snapshot ?? report?.training_percent ?? report?.hv_percent ?? "100");
  const workDate = String(report?.work_date || "").slice(0, 10);

  return (
    <main className="worker-form-page readonly-report-page">
      <div className="readonly-report-shell">
        <div className="readonly-report-toolbar">
          <button type="button" className="worker-form-back" onClick={() => navigate(-1)} aria-label="Quay lại">←</button>
          <div className="readonly-report-toolbar-copy">
            <strong>Chi tiết báo cáo</strong>
            <span>{canEdit ? `Chỉ xem · còn ${remainingText} để sửa` : "Đã hết thời gian chỉnh sửa"}</span>
          </div>
          <button type="button" className="worker-floating-save readonly-edit-button" disabled={!canEdit} onClick={() => navigate(`/worker/history/${id}/edit`)}>
            Sửa báo cáo
          </button>
        </div>

        <div className="readonly-worker-context">
          <header className="worker-form-header">
            <div className="worker-form-title-row" style={{ minWidth: 0, width: "100%", overflow: "hidden" }}>
              <button type="button" className="worker-form-back" onClick={() => navigate(-1)} aria-label="Quay lại">←</button>
              <h1 style={{ minWidth: 0, flex: "1 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{processTitle}</h1>
            </div>
          </header>
          <div className="worker-sticky-info">
            <div className="worker-sticky-person"><strong>{workerName || "---"}</strong><span>{workerCode || "---"}</span></div>
            <div className="worker-sticky-meta">
              <span className="worker-sticky-training">Học việc: {Math.min(100, Math.max(70, Math.round(Number(trainingPercent) || 100)))}%</span>
              <label className="worker-sticky-date" htmlFor="readonlyWorkerWorkDate">
                <select id="readonlyWorkerWorkDate" className="worker-sticky-date-select" value={workDate} disabled aria-label="Ngày sản xuất">
                  <option value={workDate}>{workDate || "---"}</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        <div className="readonly-report-form">
          <WorkerReportEditV2 />
        </div>
      </div>

      <style>{`
        .readonly-report-shell{position:relative;min-height:100dvh}
        .readonly-report-toolbar{position:sticky;top:0;z-index:80;display:flex;align-items:center;gap:12px;padding:10px 16px;background:#f3f7fc;border-bottom:1px solid #dfe7ef;box-shadow:0 2px 8px rgba(15,23,42,.05)}
        .readonly-report-toolbar-copy{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;color:#0f3d78}
        .readonly-report-toolbar-copy strong{font-size:15px}.readonly-report-toolbar-copy span{font-size:11px;color:#64748b}
        .readonly-edit-button{min-height:38px;padding:0 16px;white-space:nowrap}
        .readonly-worker-context{position:sticky;top:61px;z-index:70;background:#f3f7fc}
        .readonly-report-form{position:relative}
        .readonly-report-form .worker-sticky-context{display:none!important}
        .readonly-report-form .worker-form-container>.worker-form-card:first-child{display:none!important}
        .readonly-report-form .worker-action-group{display:none!important}
        .readonly-report-form .worker-form-container *{pointer-events:none!important}
        .readonly-report-form input,.readonly-report-form select,.readonly-report-form textarea,.readonly-report-form button{cursor:default!important}
        @media(max-width:680px){
          .readonly-report-toolbar{padding:8px 9px;gap:8px}.readonly-report-toolbar-copy strong{font-size:13px}.readonly-report-toolbar-copy span{font-size:10px}.readonly-edit-button{padding:0 11px;font-size:11px}
          .readonly-worker-context{top:52px}
        }
      `}</style>
    </main>
  );
}
