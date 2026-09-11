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

const today = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const deductionKey = (item: ProductionDeduction) =>
  String(item.id ?? item.deduction_type_id ?? item.deduction_code ?? item.deduction_name);

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
      .then((rows) => {
        if (!cancelled) setDeductionOptions(Array.isArray(rows) ? rows : []);
      })
      .catch((error) => {
        if (!cancelled) {
          setDeductionOptions([]);
          showToast(error?.response?.data?.message || "Không tải được danh sách trừ giờ.", "error");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDeductions(false);
      });
    return () => { cancelled = true; };
  }, [showToast]);

  const actualMinutes = Number(hours || 0) * 60 + Number(minutes || 0);
  const deductionMinutes = selectedDeductions.reduce(
    (sum, key) => sum + Math.max(0, Number(deductions[key] || 0)),
    0,
  );
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
    if (actualMinutes + (deductionMinutes - Number(deductions[key] || 0)) + nextMinutes > MAX_WORK_MINUTES) {
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

    const deductionPayload = selectedDeductions
      .map((key) => {
        const option = deductionOptions.find((item) => deductionKey(item) === key);
        const minutesValue = Number(deductions[key] || 0);
        return option && minutesValue > 0 ? {
          deduction_type_id: option.id ?? option.deduction_type_id,
          deduction_code: option.deduction_code,
          deduction_name: option.deduction_name,
          hours: minutesValue / 60,
        } : null;
      })
      .filter(Boolean);

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
    <main className="cvk-page">
      <style>{`
        .cvk-page { min-height: 100%; box-sizing: border-box; padding: 14px 16px 96px; background: var(--page-bg, #f5f8fc); color: var(--text, #172033); }
        .cvk-shell { max-width: 920px; margin: 0 auto; }
        .cvk-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
        .cvk-back { width: 40px; height: 40px; flex: 0 0 40px; border: 1px solid #dbe4ef; border-radius: 12px; background: #fff; color: #24344d; cursor: pointer; font-size: 20px; line-height: 1; }
        .cvk-title-wrap { min-width: 0; }
        .cvk-kicker { margin: 0 0 2px; font-size: 11px; font-weight: 800; letter-spacing: .08em; color: #58708f; }
        .cvk-title { margin: 0; font-size: 22px; line-height: 1.15; font-weight: 800; }
        .cvk-subtitle { margin: 3px 0 0; font-size: 13px; color: #66758c; }
        .cvk-worker { display: flex; align-items: baseline; gap: 7px; padding: 7px 2px 12px; font-size: 12px; color: #65758e; }
        .cvk-worker strong { color: #174c91; font-size: 13px; }
        .cvk-card { background: #fff; border: 1px solid #dce6f1; border-radius: 15px; box-shadow: 0 7px 24px rgba(30, 55, 90, .06); overflow: hidden; }
        .cvk-form { padding: 18px 18px 20px; }
        .cvk-section + .cvk-section { margin-top: 18px; padding-top: 18px; border-top: 1px solid #e8eef5; }
        .cvk-section-title { margin: 0 0 12px; font-size: 15px; font-weight: 800; color: #162d4d; }
        .cvk-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .cvk-grid .cvk-field:last-child { grid-column: 1 / -1; }
        .cvk-field { min-width: 0; }
        .cvk-label { display: block; margin-bottom: 6px; font-size: 12px; font-weight: 700; color: #52637b; }
        .cvk-input { display: block; width: 100%; box-sizing: border-box; height: 42px; border: 1px solid #cbd8e8; border-radius: 10px; padding: 9px 11px; background: #fff; color: #172033; font-size: 14px; outline: none; transition: border-color .15s, box-shadow .15s; }
        .cvk-input:focus { border-color: #3b82e8; box-shadow: 0 0 0 3px rgba(59, 130, 232, .11); }
        textarea.cvk-input { height: auto; min-height: 82px; resize: vertical; line-height: 1.45; }
        .cvk-time-row { display: grid; grid-template-columns: 1fr 1fr 110px; gap: 10px; align-items: end; }
        .cvk-total { height: 42px; box-sizing: border-box; padding: 6px 10px; border-radius: 10px; background: #f1f6fc; border: 1px solid #dce7f3; display: flex; flex-direction: column; justify-content: center; }
        .cvk-total-label { font-size: 10px; color: #718198; }
        .cvk-total-value { font-size: 12px; font-weight: 800; color: #27405f; }
        .cvk-time-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
        .cvk-summary-item { padding: 9px 10px; border: 1px solid #e0e8f2; border-radius: 10px; background: #f7faff; }
        .cvk-summary-label { display: block; font-size: 10px; color: #718198; }
        .cvk-summary-value { display: block; margin-top: 2px; font-size: 13px; font-weight: 800; color: #27405f; }
        .cvk-dropdown { margin-top: 10px; border: 1px solid #d7e2ef; border-radius: 10px; overflow: hidden; }
        .cvk-dropdown-title { width: 100%; border: 0; background: #f8fbff; color: #24344d; min-height: 46px; padding: 8px 11px; display: flex; align-items: center; justify-content: space-between; gap: 10px; text-align: left; cursor: pointer; }
        .cvk-dropdown-title-main { min-width: 0; }
        .cvk-dropdown-title-main span { display: block; font-size: 13px; font-weight: 800; }
        .cvk-dropdown-title-main small { display: block; margin-top: 2px; color: #72829a; font-size: 11px; }
        .cvk-dropdown-options { border-top: 1px solid #e4ebf3; padding: 7px 10px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 12px; background: #fff; }
        .cvk-check { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 7px 3px; font-size: 12px; color: #40536d; cursor: pointer; }
        .cvk-check input { width: 16px; height: 16px; flex: 0 0 16px; accent-color: #1769e0; }
        .cvk-deduction-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 10px; }
        .cvk-deduction-card { padding: 10px; border: 1px solid #e1e8f1; border-radius: 10px; background: #fbfcfe; }
        .cvk-deduction-input-row { display: flex; align-items: center; gap: 7px; }
        .cvk-deduction-input-row .cvk-input { flex: 1; min-width: 0; }
        .cvk-unit { color: #72829a; font-size: 11px; font-weight: 700; }
        .cvk-empty { padding: 10px; color: #718198; font-size: 12px; }
        .cvk-note { margin-top: 10px; padding: 9px 10px; border-radius: 9px; background: #f6f9fd; color: #68778c; font-size: 12px; line-height: 1.45; }
        .cvk-success { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 14px; padding: 11px 12px; border: 1px solid #bce4cc; border-radius: 10px; background: #f0fbf4; color: #176b3a; font-size: 13px; line-height: 1.4; }
        .cvk-success-icon { width: 22px; height: 22px; flex: 0 0 22px; border-radius: 50%; background: #20a05a; color: #fff; display: grid; place-items: center; font-weight: 900; }
        .cvk-actions { display: flex; justify-content: flex-end; margin-top: 18px; }
        .cvk-submit { min-width: 170px; height: 44px; border: 0; border-radius: 10px; padding: 0 18px; background: #1769e0; color: #fff; font-size: 14px; font-weight: 800; cursor: pointer; box-shadow: 0 5px 14px rgba(23, 105, 224, .18); }
        .cvk-submit:hover:not(:disabled) { background: #125bc2; }
        .cvk-submit:disabled { opacity: .65; cursor: wait; box-shadow: none; }
        @media (max-width: 620px) {
          .cvk-page { padding: 10px 9px 84px; }
          .cvk-shell { max-width: 100%; }
          .cvk-title { font-size: 20px; }
          .cvk-form { padding: 14px 12px 16px; }
          .cvk-grid { grid-template-columns: 1fr; gap: 10px; }
          .cvk-grid .cvk-field:last-child { grid-column: auto; }
          .cvk-time-row { grid-template-columns: 1fr 1fr; }
          .cvk-total { grid-column: 1 / -1; width: 100%; }
          .cvk-time-summary, .cvk-deduction-grid, .cvk-dropdown-options { grid-template-columns: 1fr; }
          .cvk-submit { width: 100%; }
        }
      `}</style>

      <div className="cvk-shell">
        <header className="cvk-header">
          <button type="button" className="cvk-back" onClick={() => navigate("/worker/process/select")} aria-label="Quay lại">←</button>
          <div className="cvk-title-wrap">
            <p className="cvk-kicker">CÔNG VIỆC KHÁC · {PROCESS_CODE}</p>
            <h1 className="cvk-title">Ghi nhận công việc</h1>
            <p className="cvk-subtitle">Nhập đủ thông tin cần thiết, không cần mã sản phẩm.</p>
          </div>
        </header>

        <div className="cvk-worker"><strong>{workerName}</strong><span>{workerCode}</span></div>

        <section className="cvk-card">
          <form className="cvk-form" onSubmit={submit}>
            {message && message.toLowerCase().includes("thành công") && (
              <div className="cvk-success" role="status"><span className="cvk-success-icon">✓</span><span>{message}</span></div>
            )}

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
              <div className="cvk-time-row">
                <label className="cvk-field"><span className="cvk-label">Thời gian làm việc thực tế · Giờ</span><input className="cvk-input" inputMode="numeric" min="0" max="12" type="number" value={hours} onChange={e => updateActualTime(e.target.value, minutes)} placeholder="0" /></label>
                <label className="cvk-field"><span className="cvk-label">Phút</span><input className="cvk-input" inputMode="numeric" min="0" max="59" type="number" value={minutes} onChange={e => updateActualTime(hours, e.target.value)} placeholder="0" /></label>
                <div className="cvk-total" aria-live="polite"><span className="cvk-total-label">Tổng thời gian</span><span className="cvk-total-value">{totalHours > 0 ? `${totalHours.toFixed(2)} giờ` : "Chưa nhập"}</span></div>
              </div>

              <div className="cvk-time-summary">
                <div className="cvk-summary-item"><span className="cvk-summary-label">Thực tế</span><span className="cvk-summary-value">{actualHours.toFixed(2)} giờ</span></div>
                <div className="cvk-summary-item"><span className="cvk-summary-label">Thời gian trừ</span><span className="cvk-summary-value">{deductionHours.toFixed(2)} giờ</span></div>
                <div className="cvk-summary-item"><span className="cvk-summary-label">Tổng</span><span className="cvk-summary-value">{totalHours.toFixed(2)} / 12 giờ</span></div>
              </div>

              <div className="cvk-dropdown">
                <button type="button" className="cvk-dropdown-title" onClick={() => setShowDeduction(prev => !prev)} aria-expanded={showDeduction}>
                  <span className="cvk-dropdown-title-main"><span>⏱ Thời gian trừ</span><small>{selectedDeductions.length > 0 ? `${selectedDeductions.length} loại · ${deductionMinutes} phút` : loadingDeductions ? "Đang tải danh sách…" : "Không có thời gian trừ"}</small></span>
                  <span aria-hidden="true">{showDeduction ? "▲" : "▼"}</span>
                </button>
                {showDeduction && <div className="cvk-dropdown-options">
                  {loadingDeductions ? <div className="cvk-empty">Đang tải danh sách trừ giờ…</div> : deductionOptions.length === 0 ? <div className="cvk-empty">Chưa có loại thời gian trừ cho Công việc khác.</div> : deductionOptions.map(item => {
                    const key = deductionKey(item);
                    return <label key={key} className="cvk-check"><input type="checkbox" checked={selectedDeductions.includes(key)} onChange={e => toggleDeduction(key, e.target.checked)} /><span>{item.deduction_name}</span></label>;
                  })}
                </div>}
              </div>

              {selectedDeductions.length > 0 && <div className="cvk-deduction-grid">
                {deductionOptions.filter(item => selectedDeductions.includes(deductionKey(item))).map(item => {
                  const key = deductionKey(item);
                  return <div key={key} className="cvk-deduction-card"><label className="cvk-label" htmlFor={`cvk-deduction-${key}`}>{item.deduction_name}</label><div className="cvk-deduction-input-row"><input id={`cvk-deduction-${key}`} className="cvk-input" inputMode="numeric" min="0" type="number" value={deductions[key] ?? ""} onChange={e => updateDeduction(key, e.target.value)} placeholder="0" /><span className="cvk-unit">phút</span></div></div>;
                })}
              </div>}

              <div className="cvk-note">Thời gian trừ được cộng vào tổng thời gian để tính công. Tổng thời gian thực tế + thời gian trừ không được vượt quá <b>12 giờ</b>.</div>
            </section>

            <section className="cvk-section">
              <h2 className="cvk-section-title">Ghi chú</h2>
              <label className="cvk-field"><span className="cvk-label">Nội dung công việc</span><textarea className="cvk-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Mô tả ngắn công việc đã thực hiện..." rows={3} /></label>
              <div className="cvk-note">Hệ thống tự lưu <b>người thực hiện, ngày, ca, loại công việc, thời gian, trừ giờ và ghi chú</b>. Công việc này không sử dụng máy, sản phẩm hoặc sản lượng.</div>
            </section>

            <div className="cvk-actions"><button type="submit" className="cvk-submit" disabled={busy}>{busy ? "Đang nộp..." : "Nộp báo cáo"}</button></div>
          </form>
        </section>
      </div>
    </main>
  );
}
