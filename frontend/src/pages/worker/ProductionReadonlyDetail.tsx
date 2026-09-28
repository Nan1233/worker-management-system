import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getReportById } from "../../services/productionService";

const EDIT_WINDOW_MS = 10 * 60 * 1000;
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const fmt = (v: any, digits = 0) => num(v).toLocaleString("vi-VN", { maximumFractionDigits: digits });
const pct = (v: any) => `${fmt(v, 2)}%`;
const dbDateMs = (value?: string | null) => {
  if (!value) return NaN;
  const text = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text) ? `${text.replace(" ", "T")}Z` : text;
  const ms = new Date(normalized).getTime();
  return Number.isFinite(ms) ? ms : NaN;
};

function parseDefects(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") { try { return parseDefects(JSON.parse(value)); } catch { return []; } }
  if (typeof value === "object") {
    if (Array.isArray(value.defects)) return value.defects;
    return Object.entries(value).flatMap(([code, raw]: any) => {
      if (["total", "ngQuantity", "selectedNg", "selectedDefects"].includes(code)) return [];
      const quantity = num(raw?.quantity ?? raw?.qty ?? raw?.ng_quantity ?? raw);
      return quantity > 0 ? [{ defect_code: code, defect_name: raw?.defect_name || raw?.name || code, quantity }] : [];
    });
  }
  return [];
}

function DefectRows({ defects }: { defects: any[] }) {
  const rows = (Array.isArray(defects) ? defects : []).filter((d) => num(d?.quantity) > 0);
  if (!rows.length) return <div className="rod-empty">Không có chi tiết lỗi được lưu ở cấp này.</div>;
  return <div className="rod-defect-list">{rows.map((d, i) => <div className="rod-defect-row" key={`${d.defect_type_id || d.defect_code || i}-${i}`}><span><b>{d.defect_code || "NG"}</b> — {d.defect_name || "Chưa phân loại"}</span><strong>{fmt(d.quantity)}</strong></div>)}</div>;
}

export default function ProductionReadonlyDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const source = String(searchParams.get("source") || "pending").toLowerCase() === "approved" ? "approved" : "pending";
  const navigate = useNavigate();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const reportId = Number(id);
        if (!Number.isInteger(reportId) || reportId <= 0) throw new Error("ID báo cáo không hợp lệ.");
        const raw: any = await getReportById(reportId, source);
        const data = raw?.report || raw?.data || raw;
        if (!data) throw new Error("Không tìm thấy báo cáo.");
        if (alive) setReport(data);
      } catch (e: any) {
        if (alive) setError(e?.response?.data?.message || e?.message || "Không thể tải chi tiết báo cáo.");
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [id, source]);

  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);

  const remainingMs = useMemo(() => {
    if (!report || source === "approved") return 0;
    const created = dbDateMs(report.created_at);
    return Number.isFinite(created) ? Math.max(0, created + EDIT_WINDOW_MS - now) : 0;
  }, [report, source, now]);

  if (loading) return <main className="worker-form-page"><div className="rod-shell"><div className="rod-card">Đang tải chi tiết báo cáo...</div></div></main>;
  if (error) return <main className="worker-form-page"><div className="rod-shell"><div className="rod-card rod-error">{error}</div></div></main>;

  const r = report || {};
  const machineLines = Array.isArray(r.machine_lines) ? r.machine_lines : [];
  const workerDefects = Array.isArray(r.defects) ? r.defects : [];
  const deductions = Array.isArray(r.deductions) ? r.deductions : [];
  const totalOk = num(r.tt_ok ?? r.ok_quantity ?? r.total_ok);
  const totalNg = num(r.tt_ng ?? r.ng_quantity ?? r.total_ng);
  const totalOutput = num(r.actual_output ?? r.tt_sl ?? r.total_output);
  const achievementStored = r.achievement_percent ?? r.attainment_percent ?? r.percent_achieved;
  const performanceStored = r.performance_percent ?? r.productivity_percent ?? r.percent_performance;
  const ppStored = r.pp_percent ?? r.pp;
  const seconds = Math.ceil(remainingMs / 1000);
  const remainingText = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const status = String(r.status || "pending").toLowerCase();
  const canEdit = source !== "approved" && ["pending", "need_fix"].includes(status) && remainingMs > 0;

  return <main className="worker-form-page rod-page"><div className="rod-shell">
    <div className="rod-toolbar">
      <button type="button" className="rod-back" onClick={() => navigate(-1)}>←</button>
      <div className="rod-toolbar-title"><strong>Chi tiết báo cáo</strong><span>{canEdit ? `Có thể sửa · còn ${remainingText}` : "Chỉ xem · không thể thay đổi dữ liệu"}</span></div>
      {canEdit && <button type="button" className="rod-edit" onClick={() => navigate(`/worker/history/${id}/edit`)}>Sửa báo cáo</button>}
    </div>

    <section className="rod-card"><div className="rod-heading"><b>{r.full_name || r.worker_name || "Công nhân"}</b><span>{r.worker_code || ""}</span></div><div className="rod-grid">
      <div><label>Công đoạn</label><b>{r.process_name || r.process_code || "—"}</b></div><div><label>Ngày báo cáo</label><b>{r.work_date ? new Date(r.work_date).toLocaleDateString("vi-VN") : "—"}</b></div><div><label>Ca làm việc</label><b>{r.shift || "—"}</b></div>
      <div><label>Học việc</label><b>{pct(r.training_percent ?? r.training_percent_snapshot ?? 100)}</b></div><div><label>Hình thức</label><b>{r.operation_mode || r.execution_mode || "—"}</b></div><div><label>Loại gia công</label><b>{r.work_type || r.process_type || "—"}</b></div>
      <div><label>Sản phẩm</label><b>{r.product_name || r.product_code || "—"}</b></div><div><label>Máy</label><b>{r.machine_no || (machineLines.length ? machineLines.map((x: any) => x.machine_code).join(", ") : "—")}</b></div><div><label>Thời gian</label><b>{fmt(r.total_time ?? r.actual_time, 2)} giờ</b></div>
    </div></section>

    <section className="rod-card"><h3>Kết quả sản xuất</h3><div className="rod-kpi-grid">
      <div><label>Sản lượng OK</label><strong className="ok">{fmt(totalOk)}</strong></div><div><label>Sản lượng NG</label><strong className="ng">{fmt(totalNg)}</strong></div><div><label>Tổng sản lượng</label><strong>{fmt(totalOutput)}</strong></div><div className={achievementStored != null && num(achievementStored) <= 75 ? "warn" : ""}><label>% đạt</label><strong>{achievementStored != null ? pct(achievementStored) : "—"}</strong></div>
    </div></section>

    <section className="rod-card"><h3>Chỉ số KPI</h3><div className="rod-grid rod-kpi-detail">
      <div><label>TT định mức</label><b>{fmt(r.standard_time ?? r.tt_dinh_muc, 2)}</b></div><div className={performanceStored != null && num(performanceStored) <= 75 ? "metric-warn" : ""}><label>% năng suất</label><b>{performanceStored != null ? pct(performanceStored) : "—"}</b></div><div className={achievementStored != null && num(achievementStored) <= 75 ? "metric-warn" : ""}><label>% đạt</label><b>{achievementStored != null ? pct(achievementStored) : "—"}</b></div><div><label>% PP (NG)</label><b>{ppStored != null ? pct(ppStored) : "—"}</b></div>
    </div></section>

    <section className="rod-card"><h3>Chi tiết máy & sản phẩm</h3>{machineLines.length ? machineLines.map((line: any, index: number) => {
      const defects = parseDefects(line.defects ?? line.defects_json);
      const ok = num(line.ok_quantity ?? line.tt_ok); const ng = num(line.ng_quantity ?? line.tt_ng);
      return <div className="rod-machine" key={line.id || index}><div className="rod-machine-head"><b>Máy {index + 1} · {line.machine_code || line.machine_no || "—"}</b><span>{line.product_code || line.product_name || "—"}</span></div><div className="rod-grid">
        <div><label>Thời gian chạy máy</label><b>{fmt(line.machine_time_hours ?? line.time_hours, 2)} giờ</b></div><div><label>Sản lượng OK</label><b className="ok">{fmt(ok)}</b></div><div><label>Sản lượng NG</label><b className="ng">{fmt(ng)}</b></div><div><label>Tổng máy</label><b>{fmt(ok + ng)}</b></div>
      </div><div className="rod-machine-defects"><div className="rod-subtitle">Chi tiết lỗi NG máy · {fmt(defects.reduce((sum, d) => sum + num(d.quantity), 0))} sản phẩm</div><DefectRows defects={defects}/></div></div>;
    }) : <div className="rod-empty">Không có dữ liệu máy.</div>}</section>

    <section className="rod-card"><h3>Chi tiết lỗi NG của người</h3><div className="rod-section-total">Tổng NG của người: <b>{fmt(totalNg)}</b></div><DefectRows defects={workerDefects}/>{totalNg > 0 && workerDefects.length === 0 && <div className="rod-unclassified">Có {fmt(totalNg)} NG nhưng báo cáo không có dòng phân loại lỗi người được lưu. Không lấy lỗi máy để thay thế.</div>}</section>

    <section className="rod-card"><h3>Chi tiết thời gian trừ</h3>{deductions.length ? deductions.map((d: any, i: number) => <div className="rod-defect-row" key={`${d.deduction_type_id || d.deduction_code || i}`}><span>{d.deduction_code || "TRỪ GIỜ"} — {d.deduction_name || "Chưa phân loại"}</span><strong>{fmt(d.hours, 2)} giờ</strong></div>) : <div className="rod-empty">Không có thời gian trừ.</div>}</section>
    <section className="rod-card"><h3>Ghi chú</h3><div className="rod-note">{r.note || r.remark || r.comment || "Không có ghi chú."}</div></section>
  </div><style>{`
    .rod-page{min-height:100dvh}.rod-shell{width:min(100%,1180px);margin:0 auto;padding-bottom:40px}.rod-toolbar{position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:12px;padding:10px 14px;background:#f3f7fc;border-bottom:1px solid #dce6f0;box-shadow:0 2px 8px rgba(15,23,42,.05)}.rod-back{width:38px;height:38px;border:1px solid #d7e2ef;border-radius:9px;background:#fff;font-size:22px;color:#0f4b8f}.rod-toolbar-title{flex:1;display:flex;flex-direction:column;gap:2px;color:#0f3d78}.rod-toolbar-title span{font-size:11px;color:#64748b}.rod-edit{border:0;border-radius:8px;background:#2f80d9;color:#fff;padding:10px 16px;font-weight:700}.rod-card{margin:12px 14px 0;padding:16px;border:1px solid #dce6f0;border-radius:12px;background:#fff;box-shadow:0 1px 3px rgba(15,23,42,.03)}.rod-heading{display:flex;gap:10px;align-items:center;margin-bottom:14px;color:#0753a5}.rod-heading b{font-size:17px}.rod-heading span{font-size:12px;color:#64748b}.rod-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.rod-grid>div{min-width:0}.rod-grid label,.rod-kpi-grid label{display:block;font-size:11px;color:#64748b;margin-bottom:4px}.rod-grid b{font-size:13px;color:#172b4d}.rod-card h3{margin:0 0 12px;color:#0f3d78;font-size:14px}.rod-kpi-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid #dce6f0;border-radius:9px;overflow:hidden}.rod-kpi-grid>div{padding:12px;text-align:center;border-right:1px solid #dce6f0}.rod-kpi-grid>div:last-child{border-right:0}.rod-kpi-grid strong{font-size:18px;color:#173d70}.rod-kpi-grid strong.ok{color:#00966b}.rod-kpi-grid strong.ng{color:#e31b45}.rod-kpi-grid .warn,.metric-warn{background:#fff0f1}.rod-kpi-detail .metric-warn{border:2px solid #ff6b81;border-radius:8px}.rod-kpi-detail .metric-warn b{color:#d9153c}.rod-machine{margin-top:12px;padding:14px;border:1px solid #e1e8f0;border-radius:10px;background:#f9fbfd}.rod-machine-head{display:flex;justify-content:space-between;gap:10px;margin-bottom:10px;color:#0f3d78}.rod-machine-head span{color:#64748b}.rod-subtitle{font-size:12px;font-weight:700;color:#0f3d78;margin:12px 0 8px}.rod-defect-list{border:1px solid #e1e8f0;border-radius:8px;overflow:hidden}.rod-defect-row{display:flex;justify-content:space-between;gap:12px;padding:9px 11px;border-bottom:1px solid #edf2f7;font-size:12px}.rod-defect-row:last-child{border-bottom:0}.rod-defect-row strong{white-space:nowrap}.rod-defect-row .ng{color:#e31b45}.rod-empty{padding:12px;border:1px dashed #cbd5e1;border-radius:8px;text-align:center;color:#64748b;font-size:12px}.rod-section-total{margin-bottom:10px;color:#475569;font-size:12px}.rod-section-total b{color:#e31b45}.rod-unclassified{margin-top:10px;padding:10px 12px;border:1px solid #f0c36d;border-radius:8px;background:#fff8e6;color:#8a5a00;font-size:12px}.rod-note{font-size:12px;color:#475569;white-space:pre-wrap}.rod-error{color:#b42318}@media(max-width:760px){.rod-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.rod-kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.rod-kpi-grid>div:nth-child(2){border-right:0}.rod-machine-head{flex-direction:column}.rod-card{margin-left:8px;margin-right:8px;padding:12px}}@media(max-width:460px){.rod-grid{grid-template-columns:1fr}.rod-toolbar{padding:8px}.rod-edit{padding:9px 10px;font-size:12px}}
  `}</style></main>;
}
