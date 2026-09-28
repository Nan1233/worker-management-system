import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getReportById } from "../../services/productionService";
import WorkerReportEditV2 from "./WorkerReportEditV2";

const EDIT_WINDOW_MS = 10 * 60 * 1000;
const dbDateMs = (value: unknown) => {
  if (!value) return NaN;
  const text = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text) ? `${text.replace(" ", "T")}Z` : text;
  const ms = new Date(normalized).getTime();
  return Number.isFinite(ms) ? ms : NaN;
};

export default function WorkerReportEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [message, setMessage] = useState("Đang kiểm tra thời gian chỉnh sửa...");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const reportId = Number(id);
        if (!Number.isInteger(reportId) || reportId <= 0) throw new Error("ID báo cáo không hợp lệ.");
        const raw: any = await getReportById(reportId, "pending");
        const report = raw?.report || raw?.data || raw;
        if (!report) throw new Error("Không tìm thấy báo cáo.");
        const status = String(report.status || "pending").toLowerCase();
        const created = dbDateMs(report.created_at);
        const ok = ["pending", "need_fix"].includes(status) && Number.isFinite(created) && Date.now() < created + EDIT_WINDOW_MS;
        if (!ok) {
          if (alive) { setAllowed(false); setMessage("Báo cáo đã hết thời gian chỉnh sửa hoặc không còn ở trạng thái được phép sửa."); }
          return;
        }
        if (alive) setAllowed(true);
      } catch (e: any) {
        if (alive) { setAllowed(false); setMessage(e?.response?.data?.message || e?.message || "Không thể kiểm tra quyền chỉnh sửa."); }
      }
    })();
    return () => { alive = false; };
  }, [id]);

  if (allowed === null) return <main className="worker-form-page"><div className="worker-form-shell"><div className="worker-form-card">{message}</div></div></main>;
  if (!allowed) return <main className="worker-form-page"><div className="worker-form-shell"><div className="worker-form-card"><strong>{message}</strong><div style={{ marginTop: 12 }}><button type="button" onClick={() => navigate(`/worker/history/${id}`)}>Xem chi tiết báo cáo</button></div></div></div></main>;
  return <WorkerReportEditV2 />;
}
