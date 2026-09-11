import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createTempReport, getDeductionOptionsByProcess } from "../../services/productionService";
import type { ProductionDeduction } from "../../types/production";
import { getStoredUser } from "../../utils/authStorage";
import { createClientRequestId } from "../../utils/workerSubmitGuard";
import { useToast } from "../../components/feedback/toastContext";

const PROCESS_ID = 60006;
const PROCESS_CODE = "CVK";
const SHIFTS = ["A", "B", "C", "D", "Ca 1", "Ca 2", "Ca 3"];
const WORK_TYPES = ["Xuất nhập", "Hỗ trợ", "Kho", "Vệ sinh", "Công việc khác"];
const MAX_WORK_MINUTES = 12 * 60;

const today = () => new Date().toISOString().slice(0, 10);
const deductionKey = (item: ProductionDeduction) => String(item.id ?? item.deduction_type_id ?? item.deduction_code ?? item.deduction_name);

export default function NonProductWorkPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const storedUser = useMemo(() => getStoredUser() as any, []);

  const [workDate, setWorkDate] = useState(today);
  const [shift, setShift] = useState("A");
  const [workType, setWorkType] = useState("Hỗ trợ");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");
  const [deductionOptions, setDeductionOptions] = useState<ProductionDeduction[]>([]);
  const [deductions, setDeductions] = useState<Record<string, string>>({});
  const [selectedDeductions, setSelectedDeductions] = useState<string[]>([]);
  const [showDeduction, setShowDeduction] = useState(false);
  const [loadingDeductions, setLoadingDeductions] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoadingDeductions(true);
    getDeductionOptionsByProcess(PROCESS_ID)
      .then((rows) => { if (!cancelled) setDeductionOptions(Array.isArray(rows) ? rows : []); })
      .catch((error) => {
        if (!cancelled) {
          setDeductionOptions([]);
          showToast(error?.response?.data?.message || "Không tải được danh sách trừ giờ.", "error");
        }
      })
      .finally(() => { if (!cancelled) setLoadingDeductions(false); });
    return () => { cancelled = true; };
  }, [showToast]);

  const actualMinutes = Number(hours || 0) * 60 + Number(minutes || 0);
  const deductionMinutes = selectedDeductions.reduce((sum, key) => sum + Math.max(0, Number(deductions[key] || 0)), 0);
  const totalMinutes = actualMinutes + deductionMinutes;
  const actualHours = actualMinutes / 60;
  const deductionHours = deductionMinutes / 60;
  const totalHours = totalMinutes / 60;
  const workerName = storedUser?.worker_name || storedUser?.name || storedUser?.full_name || "Công nhân";
  const workerCode = storedUser?.worker_code || storedUser?.code || storedUser?.username || "---";

  const updateActualTime = (nextHours: string, nextMinutes: string) => {
    const h = Number(nextHours || 0);
    const m = Number(nextMinutes || 0);
    if (h < 0 || h > 12 || m < 0 || m > 59) return;
    if (h * 60 + m + deductionMinutes > MAX_WORK_MINUTES) {
      showToast("Tổng thời gian làm việc và thời gian trừ không được vượt quá 12 giờ.", "warning");
      return;
    }
    setHours(nextHours);
    setMinutes(nextMinutes);
  };

  const updateDeduction = (key: string, rawValue: string) => {
    const value = rawValue.replace(/\D/g, "");
    const nextMinutes = Math.max(0, Number(value || 0));
    if (actualMinutes + deductionMinutes - Number(deductions[key] || 0) + nextMinutes > MAX_WORK_MINUTES) {
      showToast("Tổng thời gian làm việc và thời gian trừ không được vượt quá 12 giờ.", "warning");
      return;
    }
    setDeductions((prev) => ({ ...prev, [key]: value }));
  };

  const toggleDeduction = (key: string, checked: boolean) => {
    if (checked) {
      setSelectedDeductions((prev) => prev.includes(key) ? prev : [...prev, key]);
      setDeductions((prev) => ({ ...prev, [key]: prev[key] ?? "" }));
      return;
    }
    setSelectedDeductions((prev) => prev.filter((item) => item !== key));
    setDeductions((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!workDate || !shift || !workType || actualMinutes <= 0 || Number(minutes || 0) > 59) {
      const errorMessage = "Vui lòng nhập đủ thông tin và thời gian làm việc hợp lệ.";
      setMessage(errorMessage);
      showToast(errorMessage, "error");
      return;
    }
    if (totalMinutes > MAX_WORK_MINUTES) {
      const errorMessage = "Tổng thời gian làm việc + thời gian trừ không được vượt quá 12 giờ.";
      setMessage(errorMessage);
      showToast(errorMessage, "error");
      return;
    }

    const deductionPayload = selectedDeductions.map((key) => {
      const option = deductionOptions.find((item) => deductionKey(item) === key);
      const minutesValue = Number(deductions[key] || 0);
      return option && minutesValue > 0 ? {
        deduction_type_id: option.id ?? option.deduction_type_id,
        deduction_code: option.deduction_code,
        deduction_name: option.deduction_name,
        hours: minutesValue / 60,
      } : null;
    }).filter(Boolean);

    setBusy(true);
    setMessage("");
    try {
      await createTempReport({
        process_id: PROCESS_ID,
        work_date: workDate,
        shift,
        worker_id: storedUser?.worker_id,
        machine_no: "",
        product_name: "",
        operation_mode: "MANUAL",
        total_time: totalHours,
        actual_time: actualHours,
        deduction_time: deductionHours,
        standard_output: 0,
        actual_output: 0,
        tt_ok: 0,
        tt_ng: 0,
        kqd_dap_lai: 0,
        kqd_tuot: 0,
        vo_do_long: 0,
        xuoc_do_long: 0,
        cong_gay: 0,
        xoay: 0,
        khong_dut: 0,
        bavia_hut: 0,
        ppcm: 0,
        loi_cao_su: 0,
        ng_kich_thuoc: 0,
        cat_lem: 0,
        note: note.trim(),
        client_request_id: createClientRequestId(),
        extra_data: { work_type: workType, process_code: PROCESS_CODE, non_product_work: true },
        defects: [],
        deductions: deductionPayload,
      } as any);
      const successMessage = "Nộp báo cáo thành công. Báo cáo đã được gửi chờ duyệt.";
      setMessage(successMessage);
      showToast(successMessage, "success");
      setHours("");
      setMinutes("");
      setNote("");
      setDeductions({});
      setSelectedDeductions([]);
      setShowDeduction(false);
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message || error?.message || "Không thể gửi báo cáo.";
      setMessage(errorMessage);
      showToast(errorMessage, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="worker-form-page cvk-page">
      <style>{`
        .cvk-page { min-height:100%; box-sizing:border-box; padding:18px 14px 96px; background:#f5f8fc; color:#172033; }
        .cvk-shell { max-width:940px; margin:0 auto; }
        .cvk-header { display:flex; align-items:center; gap:12px; margin-bottom:12px; }
        .cvk-back { width:40px; height:40px; flex:0 0 40px; border:1px solid #d6e1ee; border-radius:11px; background:#fff; color:#17375f; cursor:pointer; font-size:20px; }
        .cvk-title-wrap { min-width:0; }
        .cvk-kicker { margin:0 0 2px; font-size:11px; font-weight:800; letter-spacing:.08em; color:#54708f; }
        .cvk-title { margin:0; font-size:23px; line-height:1.15; font-weight:800; color:#123d72; }
        .cvk-subtitle { margin:4px 0 0; font-size:13px; color:#657792; }
        .cvk-card { background:#fff; border:1px solid #d9e4ef; border-radius:16px; box-shadow:0 5px 18px rgba(25,55,90,.06); overflow:hidden; }
        .cvk-person { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:13px 16px; background:#f8fbff; border-bottom:1px solid #e3ebf4; }
        .cvk-person-label { font-size:11px; color:#6f8097; }
        .cvk-person-name { margin-top:2px; font-size:16px; font-weight:800; }
        .cvk-person-code { margin-top:2px; font-size:12px; color:#687a92; }
        .cvk-badge { padding:6px 10px; border-radius:999px; background:#eaf3ff; color:#1769e0; font-size:12px; font-weight:800; white-space:nowrap; }
        .cvk-form { padding:16px; }
        .cvk-section { padding:0; }
        .cvk-section + .cvk-section { margin-top:18px; padding-top:18px; border-top:1px solid #e6edf5; }
        .cvk-section-title { display:flex; align-items:center; gap:7px; margin:0 0 12px; font-size:15px; font-weight:800; color:#173b66; }
        .cvk-section-title::before { content:""; width:4px; height:18px; border-radius:4px; background:#3b82d0; }
        .cvk-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
        .cvk-field { min-width:0; }
        .cvk-label { display:block; margin-bottom:6px; font-size:12px; font-weight:700; color:#52657e; }
        .cvk-input { width:100%; height:42px; box-sizing:border-box; border:1px solid #cbd8e7; border-radius:10px; padding:9px 11px; background:#fff; color:#172033; font-size:14px; outline:none; }
        .cvk-input:focus { border-color:#4d8ddd; box-shadow:0 0 0 3px rgba(52,116,205,.11); }
        textarea.cvk-input { height:auto; min-height:82px; resize:vertical; line-height:1.45; }
        .cvk-time-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr) 150px; gap:10px; align-items:end; }
        .cvk-total { height:42px; box-sizing:border-box; border:1px solid #dbe5f0; border-radius:10px; background:#f4f7fb; padding:7px 10px; display:flex; flex-direction:column; justify-content:center; }
        .cvk-total-label { font-size:10px; color:#718198; }
        .cvk-total-value { font-size:13px; font-weight:800; color:#24476e; }
        .cvk-summary { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin-top:10px; }
        .cvk-summary-item { padding:9px 10px; border:1px solid #e0e8f1; border-radius:10px; background:#f8fafc; }
        .cvk-summary-label { display:block; font-size:10px; color:#718198; }
        .cvk-summary-value { display:block; margin-top:2px; font-size:13px; font-weight:800; color:#27405f; }
        .cvk-deduction { margin-top:10px; border:1px solid #d9e4ef; border-radius:11px; overflow:hidden; }
        .cvk-deduction-head { width:100%; min-height:46px; border:0; background:#f7faff; padding:8px 11px; display:flex; align-items:center; justify-content:space-between; text-align:left; cursor:pointer; color:#213b5b; }
        .cvk-deduction-title { font-size:13px; font-weight:800; }
        .cvk-deduction-sub { margin-top:2px; font-size:11px; color:#718198; }
        .cvk-deduction-options { padding:7px 10px; border-top:1px solid #e3eaf2; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:4px 12px; }
        .cvk-check { display:flex; align-items:center; gap:8px; min-width:0; padding:7px 3px; font-size:12px; color:#40536d; }
        .cvk-check input { width:16px; height:16px; accent-color:#1769e0; }
        .cvk-deduction-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin-top:10px; }
        .cvk-deduction-card { padding:10px; border:1px solid #e0e8f1; border-radius:10px; background:#fbfcfe; }
        .cvk-deduction-row { display:flex; align-items:center; gap:7px; }
        .cvk-deduction-row .cvk-input { flex:1; }
        .cvk-unit { font-size:11px; font-weight:700; color:#718198; }
        .cvk-hint { margin-top:10px; padding:9px 11px; border-radius:9px; background:#f6f9fc; color:#68788e; font-size:11px; line-height:1.45; }
        .cvk-actions { display:flex; justify-content:flex-end; margin-top:18px; }
        .cvk-submit { min-width:180px; height:44px; border:0; border-radius:10px; background:#1769e0; color:#fff; font-size:14px; font-weight:800; cursor:pointer; box-shadow:0 4px 12px rgba(23,105,224,.18); }
        .cvk-submit:disabled { opacity:.65; cursor:wait; box-shadow:none; }
        .cvk-success { margin-bottom:14px; padding:10px 12px; border:1px solid #bfe3cc; border-radius:10px; background:#f0fbf4; color:#176b3a; font-size:13px; }
        @media (max-width:650px) {
          .cvk-page { padding:10px 9px 84px; }
          .cvk-form { padding:13px; }
          .cvk-person { padding:12px 13px; }
          .cvk-title { font-size:20px; }
          .cvk-grid { grid-template-columns:1fr; gap:10px; }
          .cvk-time-grid { grid-template-columns:1fr 1fr; }
          .cvk-total { grid-column:1/-1; }
          .cvk-summary,.cvk-deduction-grid,.cvk-deduction-options { grid-template-columns:1fr; }
          .cvk-actions,.cvk-submit { width:100%; }
          .cvk-badge { display:none; }
        }
      `}</style>

      <div className="cvk-shell">
        <header className="cvk-header">
          <button type="button" className="cvk-back" onClick={() => navigate("/worker/process/select")} aria-label="Quay lại">←</button>
          <div className="cvk-title-wrap">
            <p className="cvk-kicker">CÔNG VIỆC KHÁC · {PROCESS_CODE}</p>
            <h1 className="cvk-title">Ghi nhận công việc</h1>
            <p className="cvk-subtitle">Nhập thông tin theo mẫu chung của báo cáo sản xuất.</p>
          </div>
        </header>

        <section className="cvk-card">
          <div className="cvk-person">
            <div>
              <div className="cvk-person-label">Người thực hiện</div>
              <div className="cvk-person-name">{workerName}</div>
              <div className="cvk-person-code">Mã NV: {workerCode}</div>
            </div>
            <span className="cvk-badge">CVK · Không SP</span>
          </div>

          <form className="cvk-form" onSubmit={submit}>
            {message && message.toLowerCase().includes("thành công") && <div className="cvk-success">✓ {message}</div>}

            <section className="cvk-section">
              <h2 className="cvk-section-title">Thông tin công việc</h2>
              <div className="cvk-grid">
                <label className="cvk-field"><span className="cvk-label">Ngày báo cáo</span><input className="cvk-input" type="date" value={workDate} onChange={e => setWorkDate(e.target.value)} required /></label>
                <label className="cvk-field"><span className="cvk-label">Ca làm việc</span><select className="cvk-input" value={shift} onChange={e => setShift(e.target.value)}>{SHIFTS.map(item => <option key={item}>{item}</option>)}</select></label>
                <label className="cvk-field"><span className="cvk-label">Loại công việc</span><select className="cvk-input" value={workType} onChange={e => setWorkType(e.target.value)}>{WORK_TYPES.map(item => <option key={item}>{item}</option>)}</select></label>
              </div>
            </section>

            <section className="cvk-section">
              <h2 className="cvk-section-title">Hiệu suất &amp; Thời gian</h2>
              <div className="cvk-time-grid">
                <label className="cvk-field"><span className="cvk-label">Thời gian làm việc thực tế · Giờ</span><input className="cvk-input" inputMode="numeric" min="0" max="12" type="number" value={hours} onChange={e => updateActualTime(e.target.value, minutes)} placeholder="0" /></label>
                <label className="cvk-field"><span className="cvk-label">Phút</span><input className="cvk-input" inputMode="numeric" min="0" max="59" type="number" value={minutes} onChange={e => updateActualTime(hours, e.target.value)} placeholder="0" /></label>
                <div className="cvk-total"><span className="cvk-total-label">Tổng thời gian</span><span className="cvk-total-value">{totalHours > 0 ? `${totalHours.toFixed(2)} giờ` : "Chưa nhập"}</span></div>
              </div>

              <div className="cvk-summary">
                <div className="cvk-summary-item"><span className="cvk-summary-label">Thực tế</span><span className="cvk-summary-value">{actualHours.toFixed(2)} giờ</span></div>
                <div className="cvk-summary-item"><span className="cvk-summary-label">Thời gian trừ</span><span className="cvk-summary-value">{deductionHours.toFixed(2)} giờ</span></div>
                <div className="cvk-summary-item"><span className="cvk-summary-label">Tổng</span><span className="cvk-summary-value">{totalHours.toFixed(2)} / 12 giờ</span></div>
              </div>

              <div className="cvk-deduction">
                <button type="button" className="cvk-deduction-head" onClick={() => setShowDeduction(prev => !prev)} aria-expanded={showDeduction}>
                  <span><span className="cvk-deduction-title">⏱ Thời gian trừ</span><span className="cvk-deduction-sub">{selectedDeductions.length > 0 ? `${selectedDeductions.length} loại · ${deductionMinutes} phút` : loadingDeductions ? "Đang tải danh sách…" : "Không có thời gian trừ"}</span></span>
                  <span>{showDeduction ? "▲" : "▼"}</span>
                </button>
                {showDeduction && <div className="cvk-deduction-options">
                  {loadingDeductions ? <div className="cvk-hint">Đang tải danh sách trừ giờ…</div> : deductionOptions.length === 0 ? <div className="cvk-hint">Chưa có loại thời gian trừ cho Công việc khác.</div> : deductionOptions.map(item => {
                    const key = deductionKey(item);
                    return <label key={key} className="cvk-check"><input type="checkbox" checked={selectedDeductions.includes(key)} onChange={e => toggleDeduction(key, e.target.checked)} /><span>{item.deduction_name}</span></label>;
                  })}
                </div>}
              </div>

              {selectedDeductions.length > 0 && <div className="cvk-deduction-grid">
                {deductionOptions.filter(item => selectedDeductions.includes(deductionKey(item))).map(item => {
                  const key = deductionKey(item);
                  return <div key={key} className="cvk-deduction-card"><label className="cvk-label" htmlFor={`cvk-deduction-${key}`}>{item.deduction_name}</label><div className="cvk-deduction-row"><input id={`cvk-deduction-${key}`} className="cvk-input" inputMode="numeric" min="0" type="number" value={deductions[key] ?? ""} onChange={e => updateDeduction(key, e.target.value)} placeholder="0" /><span className="cvk-unit">phút</span></div></div>;
                })}
              </div>}

              <div className="cvk-hint">Thời gian trừ được cộng vào tổng thời gian để tính công. Tổng thời gian thực tế + thời gian trừ không được vượt quá <b>12 giờ</b>.</div>
            </section>

            <section className="cvk-section">
              <h2 className="cvk-section-title">Ghi chú</h2>
              <label className="cvk-field"><span className="cvk-label">Nội dung công việc</span><textarea className="cvk-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Mô tả ngắn công việc đã thực hiện..." rows={3} /></label>
            </section>

            <div className="cvk-actions"><button type="submit" className="cvk-submit" disabled={busy}>{busy ? "Đang nộp..." : "Nộp báo cáo"}</button></div>
          </form>
        </section>
      </div>
    </main>
  );
}
