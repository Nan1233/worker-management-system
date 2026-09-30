import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import {
  approveSelectedTempReports,
  getApprovedReports,
  getDefectOptionsByProcess,
  getDeductionOptionsByProcess,
  getPendingReports,
  getReportById,
  rejectSelectedTempReports,
  updateReport,
} from "../../services/productionService";
import type { ProductionDeduction, ProductionDefect, ProductionReport } from "../../types/production";
import { getAllReportDefects } from "../../utils/reportDetails";
import { formatMinutes, sumDeductionMinutes } from "../../utils/timeDisplay";
import { getStoredUser } from "../../utils/authStorage";
import { usePermissions } from "../../hooks/usePermissions";
import { useToast } from "../../components/feedback/toastContext";
import "./ReportReviewDetail.css";

const NON_STANDARD = /\b(?:XUATNHAP|KTCD|TAIPP)\b/i;
const n = (v: unknown) => Number(v ?? 0) || 0;
const fmt = (v: unknown) => n(v).toLocaleString("vi-VN", { maximumFractionDigits: 3 });
const dateText = (v: unknown) => {
  const s = String(v || "").slice(0, 10);
  const [y, m, d] = s.split("-");
  return y && m && d ? `${d}/${m}/${y}` : s || "—";
};
const dateFromText = (v: string) => {
  const m = v.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};
const rowKey = (r: ProductionReport) => [
  String(r.work_date || "").slice(0, 10),
  String(r.worker_code || ""),
  String(r.process_name || r.process_code || ""),
  String(r.shift || ""),
  n(r.actual_time).toFixed(4),
  n(r.tt_ok).toFixed(3),
  n(r.tt_ng).toFixed(3),
].join("|");
const clean = (v: unknown) => String(v ?? "").trim().toLowerCase();

const mergeDefects = (options: ProductionDefect[], saved: ProductionDefect[]) => saved
  .filter(x => n(x.quantity) > 0)
  .map(x => {
    const id = Number(x.defect_type_id || x.id);
    const option = options.find(o => Number(o.defect_type_id || o.id) === id || clean(o.defect_name) === clean(x.defect_name));
    return { ...(option || {}), ...x, defect_type_id: id, quantity: n(x.quantity) };
  });
const mergeDeductions = (options: ProductionDeduction[], saved: ProductionDeduction[]) => saved
  .filter(x => n(x.hours) > 0)
  .map(x => {
    const id = Number(x.deduction_type_id || x.id);
    const option = options.find(o => Number(o.deduction_type_id || o.id) === id || clean(o.deduction_name) === clean(x.deduction_name));
    return { ...(option || {}), ...x, deduction_type_id: id, hours: n(x.hours) };
  });

export default function ReportReviewDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const source = params.get("source") === "approved" ? "approved" : "pending";
  const requestedDate = params.get("date") || "";
  const requestedKey = params.get("key") || "";
  const basePath = String(getStoredUser()?.role || "manager").toLowerCase() === "lead" ? "/lead" : "/manager";
  const { can } = usePermissions();
  const { showToast } = useToast();
  const canReview = can("REPORT_APPROVE");
  const canEdit = source === "pending" ? can("REPORT_PENDING_EDIT") : can("REPORT_APPROVED_EDIT");

  const [report, setReport] = useState<ProductionReport | null>(null);
  const [list, setList] = useState<ProductionReport[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState<ProductionReport | null>(null);
  const [hours, setHours] = useState("0");
  const [minutes, setMinutes] = useState("0");
  const [changeReason, setChangeReason] = useState("");
  const [error, setError] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("Sai sản lượng");
  const [rejectDetail, setRejectDetail] = useState("");
  const [defectOptions, setDefectOptions] = useState<ProductionDefect[]>([]);
  const [deductionOptions, setDeductionOptions] = useState<ProductionDeduction[]>([]);
  const approveRef = useRef<HTMLButtonElement>(null);
  const firstLoad = useRef(true);

  const loadList = useCallback(async (date: string) => {
    if (!date) return [] as ProductionReport[];
    setListLoading(true);
    try {
      const result = source === "pending"
        ? await getPendingReports({ dateFrom: date, dateTo: date, page: 1, pageSize: 100 })
        : await getApprovedReports({ dateFrom: date, dateTo: date, page: 1, pageSize: 100 });
      const rows = result.data || [];
      setList(rows);
      return rows;
    } finally {
      setListLoading(false);
    }
  }, [source]);

  const loadOne = useCallback(async (item: ProductionReport) => {
    setLoading(true);
    setError("");
    try {
      const full = await getReportById(Number(item.id), source);
      setReport(full || item);
      setCurrentIndex(-1);
    } catch (err: unknown) {
      setReport(item);
      setError(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể tải chi tiết báo cáo." : "Không thể tải chi tiết báo cáo.");
    } finally {
      setLoading(false);
    }
  }, [source]);

  const resolveInitial = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let date = requestedDate;
      let rows = date ? await loadList(date) : [];
      let target: ProductionReport | undefined;
      if (rows.length && requestedKey) {
        target = rows.find(r => rowKey(r) === requestedKey);
        if (!target) {
          const keyParts = requestedKey.split("|");
          target = rows.find(r => String(r.worker_code || "") === keyParts[1] && String(r.process_name || r.process_code || "") === keyParts[2] && String(r.shift || "") === keyParts[3]);
        }
      }
      if (!target && rows.length) target = rows[0];
      if (!target && !date) {
        const today = new Date();
        date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        rows = await loadList(date);
        target = rows[0];
      }
      if (!target) {
        setReport(null);
        setError("Không tìm thấy báo cáo trong danh sách hiện tại.");
        return;
      }
      setList(rows);
      setCurrentIndex(rows.findIndex(r => Number(r.id) === Number(target!.id)));
      const full = await getReportById(Number(target.id), source);
      setReport(full || target);
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể tải báo cáo." : "Không thể tải báo cáo.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [loadList, requestedDate, requestedKey, source]);

  useEffect(() => { void resolveInitial(); }, [resolveInitial]);

  useEffect(() => {
    if (firstLoad.current && source === "pending" && canReview) {
      firstLoad.current = false;
      window.setTimeout(() => approveRef.current?.focus(), 150);
    }
  }, [canReview, source]);

  const nonStandard = useMemo(() => NON_STANDARD.test(`${report?.product_name || ""} ${report?.process_name || ""}`), [report]);
  const defects = useMemo(() => report ? getAllReportDefects(report).filter(x => n(x.quantity) > 0) : [], [report]);
  const deductions = useMemo(() => report && Array.isArray(report.deductions) ? report.deductions.filter(x => n(x.hours) > 0) : [], [report]);
  const totalOutput = n(report?.tt_ok) + n(report?.tt_ng);
  const ceiling = n(report?.standard_output) * n(report?.actual_time);
  const outputWarning = !nonStandard && ceiling > 0 && totalOutput > ceiling;
  const missingStandardWarning = !nonStandard && n(report?.standard_output) <= 0;

  const goTo = useCallback(async (direction: -1 | 1) => {
    if (!list.length || currentIndex < 0 || actionLoading) return;
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= list.length) return;
    await loadOne(list[nextIndex]);
    setCurrentIndex(nextIndex);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [actionLoading, currentIndex, list, loadOne]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA|SELECT|BUTTON/.test(target.tagName)) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); void goTo(-1); }
      if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); void goTo(1); }
      if (event.key === "Escape") navigate(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, navigate]);

  const advanceAfterAction = async (removedId: number) => {
    const oldIndex = Math.max(0, list.findIndex(r => Number(r.id) === removedId));
    const date = String(report?.work_date || requestedDate).slice(0, 10);
    const rows = await loadList(date);
    if (!rows.length) { navigate(`${basePath}/${source === "pending" ? "reports" : "approved"}`, { replace: true }); return; }
    const nextIndex = Math.min(oldIndex, rows.length - 1);
    const next = rows[nextIndex];
    const full = await getReportById(Number(next.id), source);
    setList(rows); setCurrentIndex(nextIndex); setReport(full || next); setEditing(false); setEdit(null);
    showToast(source === "pending" ? "Đã xử lý. Đang chuyển sang báo cáo tiếp theo." : "Đã cập nhật. Đang chuyển sang báo cáo tiếp theo.", "success");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const approve = async () => {
    if (!report || !canReview || actionLoading) return;
    setActionLoading(true); setError("");
    try {
      await approveSelectedTempReports([{ id: Number(report.id), expected_updated_at: report.updated_at || null }]);
      await advanceAfterAction(Number(report.id));
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể duyệt báo cáo." : "Không thể duyệt báo cáo.");
    } finally { setActionLoading(false); }
  };

  const reject = async () => {
    if (!report || !canReview || actionLoading) return;
    const reason = [rejectReason, rejectDetail.trim()].filter(Boolean).join(": ");
    if (!reason) { setError("Vui lòng nhập lý do từ chối."); return; }
    setActionLoading(true); setError("");
    try {
      await rejectSelectedTempReports([{ id: Number(report.id), expected_updated_at: report.updated_at || null }], reason);
      setRejectOpen(false); setRejectDetail("");
      await advanceAfterAction(Number(report.id));
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể từ chối báo cáo." : "Không thể từ chối báo cáo.");
    } finally { setActionLoading(false); }
  };

  const beginEdit = async () => {
    if (!report || !canEdit) return;
    setError("");
    try {
      const processId = Number(report.process_id);
      const [defs, deds] = await Promise.all([
        processId > 0 ? getDefectOptionsByProcess(processId) : Promise.resolve([]),
        processId > 0 ? getDeductionOptionsByProcess(processId) : Promise.resolve([]),
      ]);
      setDefectOptions(defs); setDeductionOptions(deds);
      setEdit({ ...report, defects: mergeDefects(defs, report.defects || []), deductions: mergeDeductions(deds, report.deductions || []) });
      const actual = n(report.actual_time); const h = Math.floor(actual); setHours(String(h)); setMinutes(String(Math.min(59, Math.round((actual - h) * 60))));
      setChangeReason(""); setEditing(true);
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể mở chế độ sửa." : "Không thể mở chế độ sửa.");
    }
  };

  const saveEdit = async () => {
    if (!edit || !report || saving) return;
    if (source === "approved" && !changeReason.trim()) { setError("Vui lòng nhập lý do chỉnh sửa báo cáo đã duyệt."); return; }
    setSaving(true); setError("");
    try {
      const actual = Math.max(0, Number(hours) || 0) + Math.min(59, Math.max(0, Number(minutes) || 0)) / 60;
      const defectsPayload = (edit.defects || []).filter(x => n(x.quantity) > 0).map(x => ({ defect_type_id: Number(x.defect_type_id || x.id), defect_code: x.defect_code, defect_name: x.defect_name, quantity: n(x.quantity) }));
      const deductionsPayload = (edit.deductions || []).filter(x => n(x.hours) > 0).map(x => ({ deduction_type_id: Number(x.deduction_type_id || x.id), deduction_code: x.deduction_code, deduction_name: x.deduction_name, hours: n(x.hours) }));
      const dt = deductionsPayload.reduce((s, x) => s + x.hours, 0);
      const ng = defectsPayload.reduce((s, x) => s + x.quantity, 0);
      const payload: ProductionReport = { ...edit, work_date: String(edit.work_date || "").slice(0, 10), actual_time: actual, deduction_time: dt, total_time: actual + dt, tt_ng: ng, actual_output: n(edit.tt_ok) + ng, defects: defectsPayload, deductions: deductionsPayload, reason: source === "approved" ? changeReason.trim() : undefined };
      const result = await updateReport(Number(report.id), payload, source, source === "approved" ? (report.updated_at || null) : null);
      const refreshed = await getReportById(Number(report.id), source);
      setReport(refreshed || { ...payload, ...(result?.data || {}) });
      setEditing(false); setEdit(null); setChangeReason("");
      showToast("Đã lưu thay đổi báo cáo.", "success");
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message || "Không thể lưu báo cáo." : "Không thể lưu báo cáo.");
    } finally { setSaving(false); }
  };

  const setEditField = (field: keyof ProductionReport, value: string | number) => setEdit(cur => cur ? { ...cur, [field]: value } : cur);
  const setDefectQty = (index: number, value: number) => setEdit(cur => {
    if (!cur) return cur;
    const defects = [...(cur.defects || [])]; defects[index] = { ...defects[index], quantity: Math.max(0, value) };
    const ng = defects.reduce((s, x) => s + n(x.quantity), 0); return { ...cur, defects, tt_ng: ng, actual_output: n(cur.tt_ok) + ng };
  });
  const setDeductionMinutes = (index: number, value: number) => setEdit(cur => {
    if (!cur) return cur;
    const deductions = [...(cur.deductions || [])]; deductions[index] = { ...deductions[index], hours: Math.max(0, value) / 60 };
    return { ...cur, deductions, deduction_time: deductions.reduce((s, x) => s + n(x.hours), 0) };
  });

  if (loading && !report) return <main className="report-review-page"><div className="review-state">Đang tải báo cáo...</div></main>;
  if (!report) return <main className="report-review-page"><div className="review-state review-error">{error || "Không tìm thấy báo cáo."}<button type="button" onClick={() => navigate(-1)}>← Về danh sách</button></div></main>;

  return (
    <main className="report-review-page">
      <header className="review-topbar">
        <button className="review-close" type="button" onClick={() => navigate(-1)} aria-label="Đóng">×</button>
        <div className="review-title">
          <div className="review-eyebrow">CHI TIẾT BÁO CÁO · {source === "pending" ? "CHỜ DUYỆT" : "ĐÃ DUYỆT"}</div>
          <h1>{report.full_name || "Không có tên"} <span>{report.worker_code || "—"}</span></h1>
          <div className="review-subtitle">{report.process_name || report.process_code || "—"} · Ca {report.shift || "—"} · {dateText(report.work_date)}</div>
        </div>
        <div className="review-nav">
          <button type="button" onClick={() => void goTo(-1)} disabled={currentIndex <= 0 || listLoading}>← Trước</button>
          <span>{currentIndex >= 0 ? `${currentIndex + 1}/${list.length}` : "—"}</span>
          <button type="button" onClick={() => void goTo(1)} disabled={currentIndex < 0 || currentIndex >= list.length - 1 || listLoading}>Sau →</button>
        </div>
      </header>

      {error && <div className="review-error-banner">{error}</div>}
      {(outputWarning || missingStandardWarning) && !nonStandard && (
        <div className="review-alert">⚠ <strong>Cần kiểm tra:</strong> {outputWarning ? `Sản lượng ${fmt(totalOutput)} vượt giới hạn tham chiếu ${fmt(ceiling)}.` : "Báo cáo chưa có định mức sản lượng."}</div>
      )}
      {nonStandard && <div className="review-info">ℹ Công việc <strong>{report.product_name || report.process_name}</strong> không có định mức sản lượng: không áp dụng các chỉ tiêu OK/NG, % đạt, năng suất và chi tiết lỗi.</div>}

      <section className="review-actions">
        {source === "pending" && canReview && <button ref={approveRef} className="review-btn approve" type="button" onClick={() => void approve()} disabled={actionLoading}>{actionLoading ? "Đang xử lý..." : "✓ Duyệt"}</button>}
        {source === "pending" && canReview && <button className="review-btn reject" type="button" onClick={() => setRejectOpen(true)} disabled={actionLoading}>✕ Từ chối</button>}
        {canEdit && <button className="review-btn edit" type="button" onClick={() => void beginEdit()} disabled={editing}>✎ Sửa báo cáo</button>}
        <span className="review-key-hint">← → hoặc ↑ ↓ để chuyển báo cáo · Esc để đóng</span>
      </section>

      {rejectOpen && (
        <div className="review-modal-backdrop" onMouseDown={() => setRejectOpen(false)}>
          <div className="review-modal" onMouseDown={e => e.stopPropagation()}>
            <h2>Từ chối báo cáo</h2>
            <label>Lý do<select value={rejectReason} onChange={e => setRejectReason(e.target.value)}><option>Báo cáo trùng</option><option>Sai sản lượng</option><option>Sai thời gian</option><option>Sai máy hoặc sản phẩm</option><option>Thiếu dữ liệu</option><option>Lý do khác</option></select></label>
            <label>Ghi chú<textarea value={rejectDetail} onChange={e => setRejectDetail(e.target.value)} placeholder="Nhập thêm lý do nếu cần..." /></label>
            <div className="review-modal-actions"><button type="button" onClick={() => setRejectOpen(false)}>Hủy</button><button className="reject" type="button" onClick={() => void reject()} disabled={actionLoading}>Từ chối</button></div>
          </div>
        </div>
      )}

      {editing && edit ? (
        <section className="review-card edit-card">
          <div className="review-card-title"><h2>Chỉnh sửa trực tiếp</h2><span>Sửa ngay trên trang chi tiết rồi bấm Lưu.</span></div>
          <div className="review-form-grid">
            <label>Ngày báo cáo<input type="date" value={String(edit.work_date || "").slice(0, 10)} onChange={e => setEditField("work_date", e.target.value)} /></label>
            <label>Ca<select value={edit.shift || ""} onChange={e => setEditField("shift", e.target.value)}><option>A</option><option>B</option><option>C</option><option>D</option></select></label>
            <label>Mã máy<input value={edit.machine_no || ""} onChange={e => setEditField("machine_no", e.target.value)} /></label>
            <label>Mã sản phẩm<input value={edit.product_name || ""} onChange={e => setEditField("product_name", e.target.value)} /></label>
            <label>% học việc<input type="number" min="0" max="100" value={n(edit.training_percent)} onChange={e => setEditField("training_percent", n(e.target.value))} /></label>
            <label>TT OK<input type="number" min="0" value={n(edit.tt_ok)} onChange={e => setEditField("tt_ok", n(e.target.value))} disabled={nonStandard} /></label>
            <label>Giờ thực tế<input type="number" min="0" value={hours} onChange={e => setHours(e.target.value)} /></label>
            <label>Phút thực tế<input type="number" min="0" max="59" value={minutes} onChange={e => setMinutes(e.target.value)} /></label>
          </div>
          {!nonStandard && <>
            <div className="review-edit-section"><h3>Lỗi NG</h3>{(edit.defects || []).map((d, i) => <div className="edit-line" key={`${d.defect_type_id}-${i}`}><span>{d.defect_name || d.defect_code || "Lỗi"}</span><input type="number" min="0" value={n(d.quantity)} onChange={e => setDefectQty(i, n(e.target.value))} /></div>)}</div>
            <div className="review-edit-section"><h3>Thời gian trừ</h3>{(edit.deductions || []).map((d, i) => <div className="edit-line" key={`${d.deduction_type_id}-${i}`}><span>{d.deduction_name || d.deduction_code || "Mục trừ"}</span><input type="number" min="0" value={Math.round(n(d.hours) * 60)} onChange={e => setDeductionMinutes(i, n(e.target.value))} /><small>phút</small></div>)}</div>
          </>}
          {source === "approved" && <label className="reason-field">Lý do chỉnh sửa<textarea value={changeReason} onChange={e => setChangeReason(e.target.value)} placeholder="Bắt buộc khi sửa báo cáo đã duyệt" /></label>}
          <div className="edit-actions"><button type="button" onClick={() => { setEditing(false); setEdit(null); }}>Hủy</button><button className="save" type="button" onClick={() => void saveEdit()} disabled={saving}>{saving ? "Đang lưu..." : "Lưu thay đổi"}</button></div>
        </section>
      ) : (
        <>
          <section className="review-card">
            <div className="review-card-title"><h2>Thông tin báo cáo</h2><span className={source === "pending" ? "badge pending" : "badge approved"}>{source === "pending" ? "CHỜ DUYỆT" : "ĐÃ DUYỆT"}</span></div>
            <div className="review-info-grid">
              <div><span>Công nhân</span><strong>{report.full_name || "—"} ({report.worker_code || "—"})</strong></div>
              <div><span>Công đoạn</span><strong>{report.process_name || report.process_code || "—"}</strong></div>
              <div><span>Ngày báo cáo</span><strong>{dateText(report.work_date)}</strong></div>
              <div><span>Ca</span><strong>{report.shift || "—"}</strong></div>
              <div><span>Máy</span><strong>{report.machine_no || "—"}</strong></div>
              <div><span>Sản phẩm</span><strong>{report.product_name || "—"}</strong></div>
              <div><span>% học việc</span><strong>{fmt(report.training_percent ?? 100)}%</strong></div>
              <div><span>Thời gian thực tế</span><strong>{fmt(report.actual_time)} giờ</strong></div>
            </div>
          </section>

          {!nonStandard && <section className="review-card">
            <div className="review-card-title"><h2>Sản lượng & kiểm soát</h2>{outputWarning && <span className="badge warning">⚠ Vượt định mức</span>}</div>
            <div className="metric-grid">
              <div><span>Định mức</span><strong>{fmt(report.standard_output)} SP/h</strong></div>
              <div><span>TT OK</span><strong className="ok">{fmt(report.tt_ok)}</strong></div>
              <div><span>TT NG</span><strong className="ng">{fmt(report.tt_ng)}</strong></div>
              <div><span>Tổng</span><strong>{fmt(totalOutput)}</strong></div>
              <div><span>% đạt</span><strong>{totalOutput ? fmt(n(report.tt_ok) / totalOutput * 100) : "0"}%</strong></div>
              <div><span>% năng suất</span><strong>{ceiling ? fmt(totalOutput / ceiling * 100) : "0"}%</strong></div>
            </div>
          </section>}

          <div className="review-two-column">
            {!nonStandard && <section className="review-card"><div className="review-card-title"><h2>Chi tiết lỗi NG</h2><span>{defects.length} loại · {fmt(defects.reduce((s, x) => s + n(x.quantity), 0))}</span></div>{defects.length ? <div className="review-list">{defects.map((d, i) => <div className="review-list-row" key={`${d.defect_type_id || d.id}-${i}`}><span>{d.defect_name || d.defect_code || "Lỗi"}</span><strong>{fmt(d.quantity)}</strong></div>)}</div> : <div className="empty">Không có lỗi NG.</div>}</section>}
            <section className="review-card"><div className="review-card-title"><h2>Thời gian trừ</h2><span>{deductions.length} mục</span></div>{deductions.length ? <div className="review-list">{deductions.map((d, i) => <div className="review-list-row" key={`${d.deduction_type_id || d.id}-${i}`}><span>{d.deduction_name || d.deduction_code || "Mục trừ"}</span><strong>{formatMinutes(d.hours)}</strong></div>)}</div> : <div className="empty">Không có thời gian trừ.</div>}<div className="review-total">Tổng trừ: <strong>{sumDeductionMinutes(deductions)} phút</strong></div></section>
          </div>

          {report.note && <section className="review-card"><div className="review-card-title"><h2>Ghi chú</h2></div><div className="review-note">{report.note}</div></section>}
        </>
      )}
    </main>
  );
}
