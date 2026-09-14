import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getReportById } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";

const number = (value: unknown) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(Number(value) || 0);
const quantity = (value: unknown) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));
const parseDbDate = (value?: string | null) => {
  if (!value) return null;
  const text = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text) ? text.replace(" ", "T") + "Z" : text;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};
const formatDateTime = (value?: string | null) => parseDbDate(value)?.toLocaleString("vi-VN") || "---";
const WORKER_EDIT_WINDOW_MS = 10 * 60 * 1000;
const CVK_PROCESS_ID = 60006;
const CVK_PROCESS_CODE = "CVK";

function extraDataOf(report: ProductionReport) {
  const raw = (report as any)?.extra_data;
  if (!raw) return {} as Record<string, any>;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, any>;
  try { return JSON.parse(String(raw)); } catch { return {}; }
}

function timeParts(report: ProductionReport) {
  const actual = Math.max(0, Number(report.actual_time ?? report.total_time ?? 0));
  const hours = Math.floor(actual);
  const minutes = Math.round((actual - hours) * 60);
  return { hours: minutes >= 60 ? hours + 1 : hours, minutes: minutes >= 60 ? 0 : minutes };
}

export default function ProductionDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const source = searchParams.get("source");
  const navigate = useNavigate();
  const [report, setReport] = useState<ProductionReport | null>(null);
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
        let data: ProductionReport | null = null;
        let lastError: any = null;
        for (const candidate of candidates) {
          try {
            data = await getReportById(reportId, candidate);
            if (data) break;
          } catch (err: any) {
            lastError = err;
            if (err?.response?.status !== 404) throw err;
          }
        }
        if (!data) throw new Error(lastError?.response?.data?.message || "Không tìm thấy báo cáo.");
        if (alive) setReport(data);
      } catch (err: any) {
        if (alive) setError(err?.response?.data?.message || err?.message || "Không thể tải chi tiết báo cáo.");
      } finally { if (alive) setLoading(false); }
    };
    void load();
    return () => { alive = false; };
  }, [id, source]);

  useEffect(() => {
    if (!report?.created_at) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [report?.created_at]);

  const defects = useMemo(() => (report?.defects || []).filter((item) => Number(item.quantity) > 0), [report]);
  const deductions = useMemo(() => (report?.deductions || []).filter((item) => Number(item.hours) > 0), [report]);

  if (loading) return <div className="detail-container"><div className="detail-state">Đang tải chi tiết...</div></div>;
  if (!report) return <div className="detail-container"><div className="detail-state error">{error || "Không tìm thấy báo cáo."}</div></div>;

  const extra = extraDataOf(report);
  const processId = Number((report as any).process_id || 0);
  const processCode = String((report as any).process_code || extra.process_code || "").trim().toUpperCase();
  const isCVK = processId === CVK_PROCESS_ID || processCode === CVK_PROCESS_CODE || extra.non_product_work === true;
  const processLabel = isCVK ? "Công việc khác (CVK)" : (report.process_name || report.process_code || "Chưa xác định");
  const workType = String(extra.work_type || (report as any).work_type || "").trim() || "Công việc khác";
  const time = timeParts(report);
  const totalHours = Number(report.total_time || 0);
  const actualHours = Number(report.actual_time || 0);
  const deductionHours = Number(report.deduction_time || 0);
  const isPending = report.status === "pending" || report.status === "need_fix";
  const createdAt = parseDbDate(report.created_at);
  const remainingMs = createdAt ? Math.max(0, createdAt.getTime() + WORKER_EDIT_WINDOW_MS - now) : 0;
  const canEdit = isPending && remainingMs > 0;
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const remainingText = `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`;
  const statusLabel = report.status === "approved" ? "Đã duyệt" : report.status === "rejected" ? "Bị từ chối" : report.status === "need_fix" ? "Cần sửa" : "Chờ duyệt";

  return (
    <div className="ktc-page">
      <main className={`detail-container${isCVK ? " cvk-history-detail" : ""}`}>
        <header className="detail-header">
          <div><h1>Chi tiết báo cáo</h1><p>{isCVK ? "Xem lại báo cáo Công việc khác theo đúng biểu mẫu nhập" : "Kiểm tra sản lượng, thời gian và lỗi NG"}</p></div>
          <button className="back-btn" type="button" onClick={() => navigate(-1)}>← Quay lại</button>
        </header>

        <section className="detail-summary">
          <div><span>Trạng thái</span><strong className={`status ${report.status || "pending"}`}>{statusLabel}</strong></div>
          <div><span>Ngày sản xuất</span><strong>{String(report.work_date || "").slice(0, 10)}</strong></div>
          <div><span>Ca</span><strong>{report.shift || "-"}</strong></div>
          <div><span>Công đoạn</span><strong>{processLabel}</strong></div>
        </section>

        {isPending && (
          <section className="detail-section" style={{ marginBottom: 16 }}>
            {canEdit ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div><strong>Có thể sửa toàn bộ báo cáo · còn {remainingText}</strong><p style={{ margin: "4px 0 0" }}>Mở lại biểu mẫu nhập để sửa thông tin.</p></div>
                <button type="button" className="back-btn" onClick={() => navigate(`/worker/history/${report.id}/edit`)}>Sửa báo cáo</button>
              </div>
            ) : (
              <div><strong>Đã hết thời gian chỉnh sửa</strong><p style={{ margin: "4px 0 0" }}>Nếu cần sửa, vui lòng liên hệ quản lý.</p></div>
            )}
          </section>
        )}

        {isCVK ? (
          <>
            <section className="detail-section cvk-detail-card">
              <h2>Thông tin công việc</h2>
              <div className="detail-grid">
                <div><span>Công nhân</span><strong>{report.full_name || report.worker_name || "-"}</strong></div>
                <div><span>Mã công nhân</span><strong>{report.worker_code || "-"}</strong></div>
                <div><span>Công việc</span><strong>{workType}</strong></div>
              </div>
            </section>

            <section className="detail-section cvk-detail-card">
              <h2>Thời gian làm việc</h2>
              <div className="cvk-time-detail-grid">
                <div className="cvk-time-box"><span>Giờ</span><strong>{time.hours}</strong></div>
                <div className="cvk-time-box"><span>Phút</span><strong>{String(time.minutes).padStart(2, "0")}</strong></div>
                <div className="cvk-time-box cvk-time-total"><span>Tổng thời gian</span><strong>{number(totalHours)} giờ</strong></div>
              </div>
              <div className="cvk-time-summary">
                <div><span>Thời gian thực tế</span><strong>{number(actualHours)} giờ</strong></div>
                <div><span>Thời gian trừ</span><strong>{number(deductionHours)} giờ</strong></div>
              </div>
            </section>

            {deductions.length > 0 && (
              <section className="detail-section cvk-detail-card">
                <h2>Thời gian trừ</h2>
                <div className="cvk-deduction-list">
                  {deductions.map((item, index) => (
                    <div className="cvk-deduction-item" key={item.id || index}>
                      <span>{item.deduction_name || item.deduction_code || "Trừ giờ"}</span>
                      <strong>{number(item.hours)} giờ</strong>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {report.note && (
              <section className="detail-section cvk-detail-card">
                <h2>Ghi chú</h2>
                <p className="cvk-note">{report.note}</p>
              </section>
            )}

            <style>{`
              .cvk-history-detail .detail-summary{margin-bottom:14px}
              .cvk-history-detail .cvk-detail-card{border-radius:12px}
              .cvk-history-detail .cvk-detail-card h2{margin-bottom:14px}
              .cvk-time-detail-grid{display:grid;grid-template-columns:1fr 1fr 1.4fr;gap:10px}
              .cvk-time-box{min-height:62px;padding:9px 12px;border:1px solid #dbe5f0;border-radius:10px;background:#fff;display:flex;flex-direction:column;justify-content:center}
              .cvk-time-box span,.cvk-time-summary span{font-size:11px;color:#718198}
              .cvk-time-box strong{margin-top:3px;font-size:17px;color:#174b86}
              .cvk-time-total{background:#f6f9fc}
              .cvk-time-summary{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:10px}
              .cvk-time-summary>div{padding:9px 10px;border:1px solid #e0e8f1;border-radius:10px;background:#f8fafc}
              .cvk-time-summary strong{display:block;margin-top:3px;font-size:13px;color:#24476e}
              .cvk-deduction-list{display:grid;gap:8px}
              .cvk-deduction-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid #e0e8f1;border-radius:10px;background:#fbfcfe}
              .cvk-deduction-item span{font-size:13px;color:#40536d}
              .cvk-deduction-item strong{font-size:13px;color:#24476e;white-space:nowrap}
              .cvk-note{margin:0;white-space:pre-wrap;line-height:1.55;color:#29435f}
              @media(max-width:650px){.cvk-time-detail-grid{grid-template-columns:1fr 1fr}.cvk-time-total{grid-column:1/-1}.cvk-history-detail .detail-grid{grid-template-columns:1fr 1fr}}
            `}</style>
          </>
        ) : (
          <>
            <section className="detail-section">
              <h2>Thông tin báo cáo</h2>
              <div className="detail-grid">
                <div><span>Công nhân</span><strong>{report.full_name || report.worker_name || "-"}</strong></div>
                <div><span>Mã công nhân</span><strong>{report.worker_code || "-"}</strong></div>
                <div><span>Mã máy</span><strong>{report.machine_no || "-"}</strong></div>
                <div><span>Mã sản phẩm</span><strong>{report.product_name || "-"}</strong></div>
                <div><span>Thời gian nhập</span><strong>{formatDateTime(report.created_at)}</strong></div>
                <div><span>Cập nhật cuối</span><strong>{formatDateTime(report.updated_at)}</strong></div>
              </div>
            </section>

            {report.machine_lines?.length ? (
              <section className="detail-section">
                <h2>Máy / sản phẩm</h2>
                <div style={{ display: "grid", gap: 10 }}>
                  {report.machine_lines.map((line, index) => {
                    const defectTotal = (line.defects || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
                    const lineDefects = (line.defects || []).filter((item) => Number(item.quantity) > 0);
                    return (
                      <div key={line.id || index} style={{ padding: 10, border: "1px solid #d9e2ef", borderRadius: 10, background: "#fff" }}>
                        <div style={{ fontWeight: 600, marginBottom: 8, color: "#0f4b8a" }}>Máy {index + 1}</div>
                        <div className="detail-grid" style={{ margin: 0 }}>
                          <div><span>Mã máy</span><strong>{line.machine_code || "-"}</strong></div>
                          <div><span>Mã sản phẩm</span><strong>{line.product_code || "-"}</strong></div>
                          <div><span>Thời gian máy</span><strong>{number(line.machine_time_hours)} giờ</strong></div>
                          <div><span>OK</span><strong>{quantity(line.ok_quantity)}</strong></div>
                          <div><span>NG</span><strong>{quantity(line.ng_quantity)}</strong></div>
                          <div><span>Tổng lỗi</span><strong>{quantity(defectTotal)}</strong></div>
                        </div>
                        {lineDefects.length > 0 && <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #edf1f7" }}><span style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Lỗi NG theo máy</span><div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 6 }}>{lineDefects.map((item, defectIndex) => <div key={item.id || defectIndex} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 8px", border: "1px solid #e5eaf1", borderRadius: 8 }}><span>{item.defect_name || item.defect_code || "NG"}</span><strong>{quantity(item.quantity)}</strong></div>)}</div></div>}
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section className="detail-section"><h2>Sản lượng</h2><div className="detail-grid"><div><span>Định mức</span><strong>{number(report.standard_output)}</strong></div><div><span>Thực tế</span><strong>{quantity(report.actual_output)}</strong></div><div><span>OK</span><strong>{quantity(report.tt_ok)}</strong></div><div><span>NG</span><strong>{quantity(report.tt_ng)}</strong></div></div></section>
            <section className="detail-section"><h2>Thời gian</h2><div className="detail-grid"><div><span>Tổng thời gian</span><strong>{number(report.total_time)} giờ</strong></div><div><span>Thời gian thực tế</span><strong>{number(report.actual_time)} giờ</strong></div><div><span>Thời gian trừ</span><strong>{number(report.deduction_time)} giờ</strong></div></div></section>
            {defects.length > 0 && <section className="detail-section"><h2>Lỗi NG</h2><div className="detail-grid">{defects.map((item, index) => <div key={item.id || index}><span>{item.defect_name || item.defect_code || "NG"}</span><strong>{quantity(item.quantity)}</strong></div>)}</div></section>}
            {deductions.length > 0 && <section className="detail-section"><h2>Trừ giờ</h2><div className="detail-grid">{deductions.map((item, index) => <div key={item.id || index}><span>{item.deduction_name || item.deduction_code || "Trừ giờ"}</span><strong>{number(item.hours)} giờ</strong></div>)}</div></section>}
            {report.note && <section className="detail-section"><h2>Ghi chú</h2><p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{report.note}</p></section>}
          </>
        )}
      </main>
    </div>
  );
}
