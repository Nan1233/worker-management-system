import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getReportById } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";
import "./ProductionDetail.css";

const number = (value: unknown) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(Number(value) || 0);
const integer = (value: unknown) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));

const parseDbDate = (value?: string | null) => {
  if (!value) return null;
  const text = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)
    ? `${text.replace(" ", "T")}Z`
    : text;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateTime = (value?: string | null) => parseDbDate(value)?.toLocaleString("vi-VN") || "---";
const WORKER_EDIT_WINDOW_MS = 10 * 60 * 1000;
const CVK_PROCESS_ID = 60006;
const CVK_PROCESS_CODE = "CVK";

const EXTRA_LABELS: Record<string, string> = {
  process_code: "Mã công đoạn", work_type: "Công việc", operation_type: "Loại thao tác", operation_mode: "Hình thức thực hiện", execution_method: "Hình thức thực hiện",
  material_code: "Mã nguyên liệu", product_code: "Mã sản phẩm", press_date: "Ngày tháng Ép", press_box_shift: "Ca / thùng Ép", deduction_work: "Công việc trừ giờ",
  late_early_hours: "Đi muộn / về sớm", xlbv_deduction_worker: "Trừ giờ XLBV", vsk_hours: "Số giờ VSK", five_s_overtime_hours: "5S + gia ca", mold_warmup_hours: "Hâm khuôn",
  mold_repair_hours: "Sửa khuôn", machine_repair_hours: "Sửa máy", machine_stop_hours: "Dừng máy", stop_operation_hours: "Dừng thao tác", shortage_hours: "Thiếu sản lượng",
  rolling_hours: "Thời gian cán", work_minutes: "Thời gian làm việc", assembly_minutes: "Thời gian lắp ráp", tray_minutes: "Thời gian khay", actual_output: "Sản lượng thực tế",
  handler: "Người xử lý", stop_reason: "Lý do dừng máy", non_product_work: "Công việc khác",
};

const TECHNICAL_EXTRA_KEYS = new Set(["process_code", "non_product_work", "client_request_id", "logical_duplicate_key", "duplicate_confirmation_token", "force_create", "source_temp_id"]);

function extraDataOf(report: ProductionReport) {
  const raw = (report as any)?.extra_data;
  if (!raw) return {} as Record<string, unknown>;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  try { const parsed = JSON.parse(String(raw)); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
}
function labelExtra(key: string) { if (EXTRA_LABELS[key]) return EXTRA_LABELS[key]; return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()); }
function displayExtraValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value === "number") {
    const unitKeys = new Set(["late_early_hours", "vsk_hours", "five_s_overtime_hours", "mold_warmup_hours", "mold_repair_hours", "machine_repair_hours", "machine_stop_hours", "stop_operation_hours", "shortage_hours", "rolling_hours"]);
    const minuteKeys = new Set(["work_minutes", "assembly_minutes", "tray_minutes"]);
    if (unitKeys.has(key)) return `${number(value)} giờ`;
    if (minuteKeys.has(key)) return `${number(value)} phút`;
    if (key === "training_percent") return `${number(value)}%`;
    return number(value);
  }
  return String(value);
}
function timeParts(report: ProductionReport) {
  const actual = Math.max(0, Number(report.actual_time ?? report.total_time ?? 0));
  const hours = Math.floor(actual); const minutes = Math.round((actual - hours) * 60);
  return minutes >= 60 ? { hours: hours + 1, minutes: 0 } : { hours, minutes };
}
function Field({ label, value, className = "" }: { label: string; value: ReactNode; className?: string }) {
  return <div className={className}><span>{label}</span><strong>{value === null || value === undefined || value === "" ? "-" : value}</strong></div>;
}

const LEGACY_DEFECT_FIELDS: Array<[string, string]> = [
  ["kqd_dap_lai", "KQD đập lại"], ["kqd_tuot", "KQD tuột"], ["vo_do_long", "Vỡ do lồng"], ["xuoc_do_long", "Xước do lồng"],
  ["cong_gay", "Cong / gãy"], ["xoay", "Xoay"], ["khong_dut", "Không đứt"], ["bavia_hut", "Bavia hụt"], ["ppcm", "PPCM"], ["loi_cao_su", "Lỗi cao su"], ["ng_kich_thuoc", "NG kích thước"], ["cat_lem", "Cắt lem"],
];

export default function ProductionDetail() {
  const { id } = useParams(); const [searchParams] = useSearchParams(); const source = searchParams.get("source"); const navigate = useNavigate();
  const [report, setReport] = useState<ProductionReport | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const reportId = Number(id); if (!Number.isInteger(reportId) || reportId <= 0) throw new Error("ID báo cáo không hợp lệ.");
        const normalized = String(source || "").toLowerCase(); const candidates: Array<"pending" | "approved"> = normalized === "approved" ? ["approved", "pending"] : ["pending", "approved"];
        let data: ProductionReport | null = null; let lastError: any = null;
        for (const candidate of candidates) { try { data = await getReportById(reportId, candidate); if (data) break; } catch (err: any) { lastError = err; if (err?.response?.status !== 404) throw err; } }
        if (!data) throw new Error(lastError?.response?.data?.message || "Không tìm thấy báo cáo."); if (alive) setReport(data);
      } catch (err: any) { if (alive) setError(err?.response?.data?.message || err?.message || "Không thể tải chi tiết báo cáo."); }
      finally { if (alive) setLoading(false); }
    };
    void load(); return () => { alive = false; };
  }, [id, source]);

  useEffect(() => { if (!report?.created_at) return; const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, [report?.created_at]);

  const defects = useMemo(() => (report?.defects || []).filter((item) => Number(item.quantity) > 0), [report]);
  const deductions = useMemo(() => (report?.deductions || []).filter((item) => Number(item.hours) > 0), [report]);

  if (loading) return <div className="detail-container"><div className="detail-state">Đang tải chi tiết...</div></div>;
  if (!report) return <div className="detail-container"><div className="detail-state error">{error || "Không tìm thấy báo cáo."}</div></div>;

  const extra = extraDataOf(report); const processId = Number((report as any).process_id || 0); const processCode = String((report as any).process_code || extra.process_code || "").trim().toUpperCase();
  const isCVK = processId === CVK_PROCESS_ID || processCode === CVK_PROCESS_CODE || extra.non_product_work === true;
  const processLabel = isCVK ? "Công việc khác (CVK)" : (report.process_name || report.process_code || "Chưa xác định"); const workType = String(extra.work_type || (report as any).work_type || "").trim();
  const totalHours = Number(report.total_time || 0); const actualHours = Number(report.actual_time || 0); const deductionHours = Number(report.deduction_time || 0); const time = timeParts(report);
  const isPending = report.status === "pending" || report.status === "need_fix"; const createdAt = parseDbDate(report.created_at); const remainingMs = createdAt ? Math.max(0, createdAt.getTime() + WORKER_EDIT_WINDOW_MS - now) : 0;
  const canEdit = isPending && remainingMs > 0; const remainingSeconds = Math.ceil(remainingMs / 1000); const remainingText = `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`;
  const statusLabel = report.status === "approved" ? "Đã duyệt" : report.status === "rejected" ? "Bị từ chối" : report.status === "need_fix" ? "Cần sửa" : "Chờ duyệt";
  const extraEntries = Object.entries(extra).filter(([key, value]) => !TECHNICAL_EXTRA_KEYS.has(key) && value !== null && value !== undefined && value !== "");
  const legacyDefects = LEGACY_DEFECT_FIELDS.map(([key, label]) => ({ key, label, quantity: Number((report as any)[key] || 0) })).filter((item) => item.quantity > 0);
  const machineLines = Array.isArray(report.machine_lines) ? report.machine_lines : []; const machinePerformance = (report as any).machinePerformance; const workerPerformance = (report as any).workerPerformance;
  const totalNg = Number(report.tt_ng || 0);
  const detailedNg = defects.length > 0 ? defects.reduce((sum, item) => sum + Number(item.quantity || 0), 0) : legacyDefects.reduce((sum, item) => sum + item.quantity, 0);
  const hasNgDetail = defects.length > 0 || legacyDefects.length > 0;

  return (
    <div className="ktc-page"><main className="detail-container">
      <header className="detail-header"><div><h1>Chi tiết báo cáo</h1></div><button className="back-btn" type="button" onClick={() => navigate(-1)}>← Quay lại</button></header>
      <section className="detail-summary">
        <Field label="Trạng thái" value={<span className={`status ${report.status || "pending"}`}>{statusLabel}</span>} />
        <Field label="Ngày sản xuất" value={String(report.work_date || "").slice(0, 10)} /><Field label="Ca" value={report.shift || "-"} /><Field label="Công đoạn" value={processLabel} />
      </section>
      {isPending && <section className="detail-section" style={{ marginBottom: 10 }}>
        <div className="detail-action-row">
          <div>
            <strong>{canEdit ? `Có thể sửa báo cáo · còn ${remainingText}` : "Đã hết thời gian chỉnh sửa"}</strong>
            <p>{canEdit ? "Báo cáo đang ở chế độ chỉ xem. Nhấn Sửa báo cáo để mở biểu mẫu." : "Những báo cáo quá 10 phút cần liên hệ quản lý."}</p>
          </div>
          <button type="button" className="back-btn" onClick={() => navigate(`/worker/history/${report.id}/edit`)} disabled={!canEdit}>Sửa báo cáo</button>
        </div>
      </section>}

      <section className="detail-section"><h2>Thông tin người nhập</h2><div className="detail-grid">
        <Field label="Công nhân" value={report.full_name || report.worker_name || "-"} /><Field label="Mã công nhân" value={report.worker_code || "-"} /><Field label="Mã công đoạn" value={report.process_code || processCode || "-"} />
        <Field label="Hình thức thực hiện" value={(report.operation_mode || extra.operation_mode || extra.execution_method || "-").toString()} /><Field label="Loại thao tác" value={report.operation_type || extra.operation_type || "-"} />
        <Field label="% học việc" value={report.training_percent ?? extra.training_percent ?? (report as any).training_percent_snapshot ?? "-"} /><Field label="Thời gian nhập" value={formatDateTime(report.created_at)} /><Field label="Cập nhật cuối" value={formatDateTime(report.updated_at)} />
        {report.approved_at && <Field label="Thời điểm duyệt" value={formatDateTime(report.approved_at)} />}{report.reviewed_at && <Field label="Thời điểm xử lý" value={formatDateTime(report.reviewed_at)} />}{(report as any).reviewer_name && <Field label="Người duyệt" value={(report as any).reviewer_name} />}
      </div></section>

      {isCVK ? <>
        <section className="detail-section"><h2>Thông tin công việc</h2><div className="detail-grid"><Field label="Công việc" value={workType || "Công việc khác"} /><Field label="Mã công việc" value={processCode || "CVK"} />{report.note && <Field label="Ghi chú" value={report.note} />}</div></section>
        <section className="detail-section"><h2>Thời gian làm việc</h2><div className="metric-grid"><Field label="Giờ" value={time.hours} /><Field label="Phút" value={String(time.minutes).padStart(2, "0")} /><Field label="Tổng thời gian" value={`${number(totalHours)} giờ`} /><Field label="Thời gian thực tế" value={`${number(actualHours)} giờ`} /><Field label="Thời gian trừ" value={`${number(deductionHours)} giờ`} /></div></section>
        {deductions.length > 0 && <section className="detail-section"><h2>Chi tiết trừ giờ</h2><div className="detail-list">{deductions.map((item, index) => <div key={item.id || index}><span>{item.deduction_name || item.deduction_code || "Trừ giờ"}</span><strong>{number(item.hours)} giờ</strong></div>)}</div></section>}
      </> : <>
        <section className="detail-section"><h2>Thông tin sản xuất</h2><div className="detail-grid">
          <Field label="Mã máy" value={report.machine_no || "-"} /><Field label="Mã sản phẩm" value={report.product_name || "-"} /><Field label="Định mức" value={`${number(report.standard_output)} sp/giờ`} /><Field label="Mục tiêu" value={report.target_output == null ? "-" : integer(report.target_output)} />
          <Field label="Sản lượng thực tế" value={integer(report.actual_output)} /><Field label="OK" value={integer(report.tt_ok)} className="ok" /><Field label="NG" value={integer(report.tt_ng)} className="ng" />
        </div></section>
        <section className="detail-section"><h2>Thời gian</h2><div className="metric-grid"><Field label="Tổng thời gian" value={`${number(totalHours)} giờ`} /><Field label="Thời gian thực tế" value={`${number(actualHours)} giờ`} /><Field label="Thời gian trừ" value={`${number(deductionHours)} giờ`} /><Field label="Lý do dừng máy" value={report.stop_reason || extra.stop_reason || "-"} /></div></section>

        {machineLines.length > 0 && <section className="detail-section"><h2>Chi tiết từng máy</h2><div className="machine-detail-list">{machineLines.map((line, index) => {
          const lineDefects = (line.defects || []).filter((item) => Number(item.quantity) > 0);
          return <div className="machine-detail-card" key={line.id || index}>
            <div className="machine-detail-title">Máy {index + 1} · {line.machine_code || "-"}</div>
            <div className="detail-grid">
              <Field label="Mã máy" value={line.machine_code || "-"} /><Field label="Mã sản phẩm" value={line.product_code || "-"} /><Field label="Thời gian máy" value={`${number(line.machine_time_hours)} giờ`} /><Field label="Định mức máy" value={line.standard_output == null ? "-" : `${number(line.standard_output)} sp/giờ`} />
              <Field label="Nguồn định mức" value={line.standard_source || "-"} /><Field label="Sản lượng OK" value={integer(line.ok_quantity)} className="ok" /><Field label="Sản lượng NG" value={integer(line.ng_quantity)} className="ng" /><Field label="Sản lượng tính" value={integer(line.counted_output)} />
              <Field label="Sản lượng tối đa" value={integer(line.maximum_output)} /><Field label="Giờ định mức đạt được" value={number(line.earned_standard_hours)} /><Field label="Loại trừ KQD" value={Number(line.exclude_kqd_from_tt || 0) ? "Có" : "Không"} />
              {line.adjustment_minutes != null && <Field label="Điều chỉnh thời gian" value={`${number(line.adjustment_minutes)} phút`} />}
            </div>
            {lineDefects.length > 0 && <div className="machine-defects"><div className="machine-detail-title">Chi tiết lỗi NG</div>{lineDefects.map((item, defectIndex) => <div key={item.id || item.defect_code || defectIndex} className="machine-defect-row"><span>{item.defect_name || item.defect_code || "Lỗi NG"}</span><strong>{integer(item.quantity)}</strong></div>)}</div>}
          </div>;
        })}</div></section>}

        <section className="detail-section"><h2>Chi tiết lỗi NG</h2>
          <div className="detail-grid ng-overview"><Field label="Tổng NG" value={integer(totalNg)} className="ng" /><Field label="NG đã phân loại" value={integer(detailedNg)} /></div>
          {hasNgDetail ? <div className="detail-list">{defects.map((item, index) => <div key={item.id || item.defect_code || index}><span>{item.defect_name || item.defect_code || "Lỗi NG"}</span><strong>{integer(item.quantity)}</strong></div>)}{defects.length === 0 && legacyDefects.map((item) => <div key={item.key}><span>{item.label}</span><strong>{integer(item.quantity)}</strong></div>)}</div> : <div className="empty-row">Chưa có dữ liệu phân loại lỗi NG cho báo cáo này.</div>}
        </section>

        {deductions.length > 0 && <section className="detail-section"><h2>Chi tiết trừ giờ</h2><div className="detail-list">{deductions.map((item, index) => <div key={item.id || index}><span>{item.deduction_name || item.deduction_code || "Trừ giờ"}</span><strong>{number(item.hours)} giờ</strong></div>)}</div></section>}
      </>}

      {extraEntries.length > 0 && <section className="detail-section"><h2>Thông tin bổ sung</h2><div className="detail-grid">{extraEntries.map(([key, value]) => <Field key={key} label={labelExtra(key)} value={displayExtraValue(key, value)} />)}</div></section>}
      {(machinePerformance || workerPerformance) && <section className="detail-section"><h2>Hiệu suất</h2><div className="detail-grid">{workerPerformance?.efficiency != null && <Field label="Hiệu suất người" value={`${number(workerPerformance.efficiency)}%`} />}{machinePerformance?.efficiency != null && <Field label="Hiệu suất máy" value={`${number(machinePerformance.efficiency)}%`} />}</div></section>}
    </main></div>
  );
}
