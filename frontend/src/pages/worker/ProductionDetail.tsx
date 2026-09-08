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
          try { data = await getReportById(reportId, candidate); if (data) break; }
          catch (err: any) { lastError = err; if (err?.response?.status !== 404) throw err; }
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

  const isPending = report.status === "pending" || report.status === "need_fix";
  const createdAt = parseDbDate(report.created_at);
  const remainingMs = createdAt ? Math.max(0, createdAt.getTime() + WORKER_EDIT_WINDOW_MS - now) : 0;
  const canEdit = isPending && remainingMs > 0;
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const remainingText = `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`;
  const statusLabel = report.status === "approved" ? "Đã duyệt" : report.status === "rejected" ? "Bị từ chối" : report.status === "need_fix" ? "Cần sửa" : "Chờ duyệt";

  return <div className="ktc-page"><main className="detail-container">
    <header className="detail-header">
      <div><h1>Chi tiết báo cáo</h1><p>Kiểm tra sản lượng, thời gian và lỗi NG</p></div>
      <button className="back-btn" type="button" onClick={() => navigate(-1)}>← Quay lại</button>
    </header>

    <section className="detail-summary">
      <div><span>Trạng thái</span><strong className={`status ${report.status || "pending"}`}>{statusLabel}</strong></div>
      <div><span>Ngày sản xuất</span><strong>{String(report.work_date || "").slice(0, 10)}</strong></div>
      <div><span>Ca</span><strong>{report.shift || "-"}</strong></div>
      <div><span>Công đoạn</span><strong>{report.process_name || report.process_code || "-"}</strong></div>
    </section>

    {isPending && <section className="detail-section" style={{ marginBottom: 16 }}>
      {canEdit ? <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div><strong>Có thể sửa toàn bộ báo cáo · còn {remainingText}</strong><p style={{ margin: "4px 0 0" }}>Mở lại biểu mẫu nhập để sửa sản lượng, máy, lỗi NG, trừ giờ, thời gian và ghi chú.</p></div>
        <button type="button" className="back-btn" onClick={() => navigate(`/worker/history/${report.id}/edit`)}>Sửa báo cáo</button>
      </div> : <div><strong>Đã hết thời gian chỉnh sửa</strong><p style={{ margin: "4px 0 0" }}>Nếu cần sửa, vui lòng liên hệ quản lý.</p></div>}
    </section>}

    <section className="detail-section"><h2>Thông tin báo cáo</h2><div className="detail-grid">
      <div><span>Công nhân</span><strong>{report.full_name || report.worker_name || "-"}</strong></div>
      <div><span>Mã công nhân</span><strong>{report.worker_code || "-"}</strong></div>
      <div><span>Mã máy</span><strong>{report.machine_no || "-"}</strong></div>
      <div><span>Mã sản phẩm</span><strong>{report.product_name || "-"}</strong></div>
      <div><span>Thời gian nhập</span><strong>{formatDateTime(report.created_at)}</strong></div>
      <div><span>Cập nhật cuối</span><strong>{formatDateTime(report.updated_at)}</strong></div>
    </div></section>

    {report.machine_lines?.length ? <section className="detail-section"><h2>Máy / sản phẩm</h2><div style={{ display: "grid", gap: 10 }}>{report.machine_lines.map((line, index) => {
      const defectTotal = (line.defects || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      return <div key={line.id || index} style={{ padding: 10, border: "1px solid #d9e2ef", borderRadius: 10, background: "#fff" }}>
        <div style={{ fontWeight: 600, marginBottom: 8, color: "#0f4b8a" }}>Máy {index + 1}</div>
        <div className="detail-grid" style={{ margin: 0 }}>
          <div><span>Mã máy</span><strong>{line.machine_code || "-"}</strong></div>
          <div><span>Mã sản phẩm</span><strong>{line.product_code || "-"}</strong></div>
          <div><span>Thời gian máy</span><strong>{number(line.machine_time_hours)} giờ</strong></div>
          <div><span>OK</span><strong>{quantity(line.ok_quantity)}</strong></div>
          <div><span>NG</span><strong>{quantity(line.ng_quantity)}</strong></div>
          <div><span>Tổng lỗi</span><strong>{quantity(defectTotal)}</strong></div>
        </div>
        {(line.defects || []).filter((item) => Number(item.quantity) > 0).length > 0 && <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #edf1f7" }}>
          <span style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Lỗi NG theo máy</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 6 }}>
            {(line.defects || []).filter((item) => Number(item.quantity) > 0).map((item, defectIndex) => <div key={item.id || defectIndex} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 8px", border: "1px solid #e5eaf1", borderRadius: 8 }}><span>{item.defect_name || item.defect_code || "NG"}</span><strong>{quantity(item.quantity)}</strong></div>)}
          </div>
        </div>}
      </div>;
    })}</div></section> : null}

    <section className="detail-section"><h2>Sản lượng</h2><div className="detail-grid">
      <div><span>Định mức</span><strong>{number(report.standard_output)}</strong></div>
      <div><span>Thực tế</span><strong>{quantity(report.actual_output)}</strong></div>
      <div><span>OK</span><strong>{quantity(report.tt_ok)}</strong></div>
      <div><span>NG</span><strong>{quantity(report.tt_ng)}</strong></div>
    </div></section>

    <section className="detail-section"><h2>Thời gian</h2><div className="detail-grid">
      <div><span>Tổng thời gian</span><strong>{number(report.total_time)} giờ</strong></div>
      <div><span>Thời gian thực tế</span><strong>{number(report.actual_time)} giờ</strong></div>
      <div><span>Thời gian trừ</span><strong>{number(report.deduction_time)} giờ</strong></div>
    </div></section>

    {defects.length > 0 && <section className="detail-section"><h2>Lỗi NG</h2><div className="detail-grid">{defects.map((item, index) => <div key={item.id || index}><span>{item.defect_name || item.defect_code || "NG"}</span><strong>{quantity(item.quantity)}</strong></div>)}</div></section>}
    {deductions.length > 0 && <section className="detail-section"><h2>Trừ giờ</h2><div className="detail-grid">{deductions.map((item, index) => <div key={item.id || index}><span>{item.deduction_name || item.deduction_code || "Trừ giờ"}</span><strong>{number(item.hours)} giờ</strong></div>)}</section>}
    {report.note && <section className="detail-section"><h2>Ghi chú</h2><p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{report.note}</p></section>}
  </main></div>;
}
