import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import { approveSelectedTempReports, getReportById, getTempReportById, rejectSelectedTempReports } from "../../services/productionService";
import { getStoredUser } from "../../utils/authStorage";
import { usePermissions } from "../../hooks/usePermissions";
import { getAllReportDefects } from "../../utils/reportDetails";
import { decimalHoursToMinutes, formatMinutes, sumDeductionMinutes } from "../../utils/timeDisplay";
import "./ManagerReportDetailForm.css";

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const text = (v: unknown, fallback = "—") => v === null || v === undefined || v === "" ? fallback : String(v);
const fmt = (v: unknown) => num(v).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const pct = (v: unknown) => `${fmt(v)}%`;
const dateText = (v: unknown) => { const s = String(v || "").slice(0, 10); const [y,m,d] = s.split("-"); return y && m && d ? `${d}/${m}/${y}` : s || "—"; };
const timeHM = (hours: unknown) => { const total = Math.max(0, Math.round(num(hours) * 60)); return `${Math.floor(total / 60)} giờ ${total % 60} phút`; };

function Field({ label, value, wide = false }: { label: string; value: unknown; wide?: boolean }) {
  return <label className={`manager-view-field${wide ? " wide" : ""}`}><span>{label}</span><input value={text(value)} readOnly /></label>;
}

export default function ManagerReportDetailForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const source = params.get("source") === "pending" ? "pending" : "approved";
  const reportId = Number(id);
  const role = useMemo(() => getStoredUser()?.role || "manager", []);
  const basePath = role === "lead" ? "/lead" : role === "admin" ? "/admin" : "/manager";
  const { can } = usePermissions();
  const canEdit = source === "pending" ? can("REPORT_PENDING_EDIT") : can("REPORT_APPROVED_EDIT");
  const canReview = source === "pending" && can("REPORT_APPROVE");
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError("");
      if (!Number.isInteger(reportId) || reportId <= 0) throw new Error("ID báo cáo không hợp lệ.");
      const data = source === "pending" ? await getTempReportById(reportId) : await getReportById(reportId, "approved");
      setReport(data || null);
      if (!data) throw new Error("Không tìm thấy báo cáo.");
    } catch (e: any) {
      setReport(null);
      setError(axios.isAxiosError(e) ? e.response?.data?.message || "Không thể tải báo cáo." : e?.message || "Không thể tải báo cáo.");
    } finally { setLoading(false); }
  }, [reportId, source]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <main className="manager-report-form-page"><div className="manager-report-state">Đang tải báo cáo...</div></main>;
  if (!report) return <main className="manager-report-form-page"><div className="manager-report-state error">{error || "Không tìm thấy báo cáo."}<button type="button" onClick={() => navigate(-1)}>← Quay lại</button></div></main>;

  const defects = getAllReportDefects(report).filter((x: any) => num(x.quantity) > 0);
  const deductions = Array.isArray(report.deductions) ? report.deductions.filter((x: any) => num(x.hours) > 0) : [];
  const machineLines = Array.isArray(report.machine_lines) ? report.machine_lines : Array.isArray(report.machineLines) ? report.machineLines : [];
  const ok = num(report.tt_ok);
  const ng = defects.reduce((sum: number, x: any) => sum + num(x.quantity), 0);
  const actual = num(report.actual_output) || ok + ng;
  const actualTime = num(report.actual_time);
  const standard = num(report.standard_output);
  const target = num(report.tt_dinh_muc) || (standard > 0 && actualTime > 0 ? standard * actualTime : 0);
  const productivity = target > 0 ? actual / target * 100 : 0;
  const achieved = actual > 0 ? ok / actual * 100 : 0;
  const pp = actual > 0 ? ng / actual * 100 : 0;
  const hv = num(report.training_percent_snapshot ?? report.training_percent ?? report.hv_percent ?? 0);
  const totalDeduction = deductions.length ? sumDeductionMinutes(deductions) : decimalHoursToMinutes(report.deduction_time);
  const reportCode = `PR${String(report.work_date || "REPORT").slice(0,10).replace(/-/g, "")}-${report.worker_code || String(report.id || "").padStart(4,"0")}`;
  const extra = report.extra_data && typeof report.extra_data === "object" ? Object.entries(report.extra_data).filter(([k,v]) => !["adjustment_count","work_type"].includes(k) && v !== null && v !== "") : [];

  const approve = async () => {
    if (busy) return;
    try { setBusy(true); await approveSelectedTempReports([{ id: reportId, expected_updated_at: report.updated_at || null }]); navigate(`${basePath}/reports`, { replace: true }); }
    catch (e: any) { setError(e?.response?.data?.message || "Không thể duyệt báo cáo."); }
    finally { setBusy(false); }
  };
  const reject = async () => {
    if (busy) return;
    const reason = window.prompt("Nhập lý do từ chối báo cáo:", "");
    if (!reason?.trim()) return;
    try { setBusy(true); await rejectSelectedTempReports([{ id: reportId, expected_updated_at: report.updated_at || null }], reason.trim()); navigate(`${basePath}/reports`, { replace: true }); }
    catch (e: any) { setError(e?.response?.data?.message || "Không thể từ chối báo cáo."); }
    finally { setBusy(false); }
  };

  return <main className="manager-report-form-page">
    <header className="manager-report-form-header">
      <div><button className="manager-back" type="button" onClick={() => navigate(-1)}>← Danh sách</button><div className="manager-title-row"><h1>{text(report.full_name || report.worker_name || report.worker_code)}</h1><span className={`manager-status ${source}`}>{source === "pending" ? "Chờ duyệt" : "Đã duyệt"}</span></div><p>{text(report.worker_code)} · {text(report.process_name || report.process_code)} · Ca {text(report.shift)} · {dateText(report.work_date)} · {reportCode}</p></div>
      <div className="manager-header-actions">{canEdit && <button className="manager-edit" type="button" onClick={() => navigate(`${basePath}/report/${report.id}/edit?source=${source}`)}>✎ Sửa báo cáo</button>}</div>
    </header>

    {error && <div className="manager-form-error">{error}</div>}

    <section className="manager-worker-card">
      <div className="manager-card-heading"><b>01</b><div><h2>Thông tin báo cáo</h2><p>Hiển thị giống form nhập báo cáo của công nhân · chỉ xem</p></div></div>
      <div className="manager-form-grid">
        <Field label="Ngày báo cáo" value={dateText(report.work_date)} /><Field label="Ca làm việc" value={report.shift} /><Field label="Công nhân" value={`${text(report.full_name || report.worker_name)} (${text(report.worker_code)})`} wide /><Field label="Công đoạn" value={report.process_name || report.process_code} /><Field label="% học việc" value={pct(hv)} /><Field label="Loại công việc" value={report.extra_data?.work_type || report.work_type} />
      </div>
    </section>

    <section className="manager-worker-card">
      <div className="manager-card-heading"><b>02</b><div><h2>Sản phẩm & máy</h2><p>Dữ liệu đúng theo báo cáo đã lưu</p></div></div>
      <div className="manager-form-grid">
        <Field label="Mã máy" value={report.machine_no || machineLines.map((x: any) => x.machine_code).filter(Boolean).join(", ")} /><Field label="Mã sản phẩm" value={report.product_name || machineLines.map((x: any) => x.product_code).filter(Boolean).join(", ")} /><Field label="Định mức" value={`${fmt(standard)} SP/h`} /><Field label="Hình thức thực hiện" value={report.extra_data?.execution_method || report.execution_method} />
      </div>
      {machineLines.length > 0 && <div className="manager-machine-list">{machineLines.map((line: any, i: number) => <article className="manager-machine-card" key={line.id ?? i}><div className="manager-machine-head"><strong>Máy {i + 1}</strong><span>{text(line.machine_code)} · {text(line.product_code)}</span></div><div className="manager-machine-grid"><Field label="Thời gian chạy máy" value={timeHM(line.machine_time_hours)} /><Field label="OK" value={fmt(line.ok_quantity)} /><Field label="NG" value={fmt(line.ng_quantity)} /><Field label="Trừ máy" value={`${fmt(line.adjustment_minutes)} phút`} /></div></article>)}</div>}
    </section>

    <section className="manager-worker-card">
      <div className="manager-card-heading"><b>03</b><div><h2>Sản lượng & kết quả</h2><p>Các chỉ tiêu được tính từ dữ liệu báo cáo</p></div></div>
      <div className="manager-kpi-grid"><div><span>TT OK</span><strong>{fmt(ok)}</strong></div><div><span>NG</span><strong>{fmt(ng)}</strong></div><div><span>Tổng sản lượng</span><strong>{fmt(actual)}</strong></div><div><span>Thời gian thực tế</span><strong>{timeHM(actualTime)}</strong></div><div className={productivity <= 75 || productivity > 100 ? "bad" : ""}><span>% năng suất</span><strong>{pct(productivity)}</strong></div><div><span>% đạt</span><strong>{pct(achieved)}</strong></div><div className={pp === 0 || defects.length === 1 ? "warn" : ""}><span>% PP</span><strong>{pct(pp)}{pp === 0 || defects.length === 1 ? " ⚠" : ""}</strong></div></div>
    </section>

    <section className="manager-worker-card">
      <div className="manager-card-heading"><b>04</b><div><h2>Chi tiết lỗi NG</h2><p>Giữ nguyên từng loại lỗi và số lượng đã nhập</p></div><strong>{defects.length} loại · {fmt(ng)} SP</strong></div>
      {defects.length === 0 ? <div className="manager-empty">Không có lỗi NG.</div> : <div className="manager-row-list">{defects.map((d: any, i: number) => <div className="manager-data-row" key={`${d.defect_type_id || d.id || i}-${d.defect_name}`}><span>{text(d.defect_code)} · {text(d.defect_name || d.defect_label)}</span><input value={fmt(d.quantity)} readOnly /></div>)}</div>}
    </section>

    <section className="manager-worker-card">
      <div className="manager-card-heading"><b>05</b><div><h2>Thời gian trừ</h2><p>Các khoản trừ giờ đã lưu</p></div><strong>{totalDeduction} phút</strong></div>
      {deductions.length === 0 ? <div className="manager-empty">Không có thời gian trừ.</div> : <div className="manager-row-list">{deductions.map((d: any, i: number) => <div className="manager-data-row" key={`${d.deduction_type_id || d.id || i}-${d.deduction_name}`}><span>{text(d.deduction_code)} · {text(d.deduction_name || d.deduction_label)}</span><input value={formatMinutes(d.hours)} readOnly /></div>)}</div>}
    </section>

    {extra.length > 0 && <section className="manager-worker-card"><div className="manager-card-heading"><b>06</b><div><h2>Thông tin bổ sung</h2><p>Các trường mở rộng được lưu cùng báo cáo</p></div></div><div className="manager-form-grid">{extra.map(([key,value]) => <Field key={key} label={key.replace(/_/g," ")} value={String(value)} />)}</div></section>}

    {(report.note || report.notes) && <section className="manager-worker-card"><div className="manager-card-heading"><b>07</b><div><h2>Ghi chú</h2></div></div><textarea className="manager-note" value={report.note || report.notes || ""} readOnly /></section>}

    {canReview && <div className="manager-review-actions"><button className="reject" type="button" disabled={busy} onClick={reject}>✕ Từ chối</button><button className="approve" type="button" disabled={busy} onClick={approve}>✓ Duyệt</button></div>}
  </main>;
}
