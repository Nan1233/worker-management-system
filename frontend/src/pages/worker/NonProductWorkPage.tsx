import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createTempReport } from "../../services/productionService";
import { getStoredUser } from "../../utils/authStorage";
import { createClientRequestId } from "../../utils/workerSubmitGuard";
import { useToast } from "../../components/feedback/toastContext";

const PROCESS_ID = 60006;
const PROCESS_CODE = "CVK";
const SHIFTS = ["A", "B", "C", "D", "Ca 1", "Ca 2", "Ca 3"];
const WORK_TYPES = ["Xuất nhập", "Hỗ trợ", "Kho", "Vệ sinh", "Công việc khác"];

const today = () => new Date().toISOString().slice(0, 10);

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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const totalMinutes = (Number(hours || 0) * 60) + Number(minutes || 0);
  const totalHours = totalMinutes / 60;
  const workerName = storedUser?.worker_name || storedUser?.name || storedUser?.full_name || "Công nhân";
  const workerCode = storedUser?.worker_code || storedUser?.code || storedUser?.username || "---";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;

    const h = Number(hours || 0);
    const m = Number(minutes || 0);
    const total = h + m / 60;
    if (!workDate || !shift || !workType || total <= 0 || m > 59 || h < 0 || m < 0) {
      const errorMessage = "Vui lòng nhập đủ thông tin và thời gian hợp lệ.";
      setMessage(errorMessage);
      showToast(errorMessage, "error");
      return;
    }
    if (totalMinutes > 12 * 60) {
      const errorMessage = "Thời gian thực hiện không được vượt quá 12 giờ.";
      setMessage(errorMessage);
      showToast(errorMessage, "error");
      return;
    }

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
        total_time: total,
        actual_time: total,
        deduction_time: 0,
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
        extra_data: {
          work_type: workType,
          process_code: PROCESS_CODE,
          non_product_work: true,
        },
        defects: [],
        deductions: [],
      } as any);

      const successMessage = "Nộp báo cáo thành công. Báo cáo đã được gửi chờ duyệt.";
      setMessage(successMessage);
      showToast(successMessage, "success");
      setHours("");
      setMinutes("");
      setNote("");
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
        .cvk-page {
          min-height: 100%;
          box-sizing: border-box;
          padding: 16px 14px 96px;
          background: var(--page-bg, #f5f8fc);
          color: var(--text, #172033);
        }
        .cvk-shell { max-width: 760px; margin: 0 auto; }
        .cvk-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }
        .cvk-back {
          width: 40px; height: 40px; flex: 0 0 40px;
          border: 1px solid #dbe4ef; border-radius: 12px;
          background: #fff; color: #24344d; cursor: pointer;
          font-size: 20px; line-height: 1;
        }
        .cvk-title-wrap { min-width: 0; }
        .cvk-kicker { margin: 0 0 2px; font-size: 11px; font-weight: 800; letter-spacing: .09em; color: #58708f; }
        .cvk-title { margin: 0; font-size: 23px; line-height: 1.15; font-weight: 800; }
        .cvk-subtitle { margin: 4px 0 0; font-size: 13px; color: #66758c; }
        .cvk-card {
          background: #fff;
          border: 1px solid #e1e8f1;
          border-radius: 18px;
          box-shadow: 0 7px 24px rgba(30, 55, 90, .07);
          overflow: hidden;
        }
        .cvk-person {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 14px 16px;
          background: linear-gradient(180deg, #f8fbff 0%, #f4f8fd 100%);
          border-bottom: 1px solid #e7edf5;
        }
        .cvk-person-main { min-width: 0; }
        .cvk-person-label { font-size: 11px; color: #72829a; margin-bottom: 2px; }
        .cvk-person-name { font-size: 16px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cvk-person-code { margin-top: 2px; font-size: 12px; color: #65758e; }
        .cvk-badge {
          flex: 0 0 auto; padding: 7px 10px; border-radius: 999px;
          background: #eaf3ff; color: #1769e0; font-size: 12px; font-weight: 800;
        }
        .cvk-form { padding: 16px; }
        .cvk-section + .cvk-section { margin-top: 18px; padding-top: 18px; border-top: 1px solid #edf1f6; }
        .cvk-section-title { margin: 0 0 11px; font-size: 14px; font-weight: 800; }
        .cvk-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .cvk-field { min-width: 0; }
        .cvk-label { display: block; margin-bottom: 6px; font-size: 12px; font-weight: 700; color: #52637b; }
        .cvk-input {
          display: block; width: 100%; box-sizing: border-box; height: 42px;
          border: 1px solid #cfd9e7; border-radius: 11px; padding: 9px 11px;
          background: #fff; color: #172033; font-size: 14px; outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .cvk-input:focus { border-color: #5a93e6; box-shadow: 0 0 0 3px rgba(58, 123, 213, .11); }
        textarea.cvk-input { height: auto; min-height: 88px; resize: vertical; line-height: 1.45; }
        .cvk-time-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: end; }
        .cvk-total {
          height: 42px; min-width: 96px; box-sizing: border-box; padding: 7px 10px;
          border-radius: 11px; background: #f2f6fb; border: 1px solid #e1e8f1;
          display: flex; flex-direction: column; justify-content: center;
        }
        .cvk-total-label { font-size: 10px; color: #718198; }
        .cvk-total-value { font-size: 13px; font-weight: 800; color: #27405f; }
        .cvk-note { margin-top: 10px; padding: 10px 11px; border-radius: 10px; background: #f8fafc; color: #68778c; font-size: 12px; line-height: 1.45; }
        .cvk-success {
          display: flex; align-items: flex-start; gap: 10px; margin-bottom: 14px;
          padding: 11px 12px; border: 1px solid #bce4cc; border-radius: 11px;
          background: #f0fbf4; color: #176b3a; font-size: 13px; line-height: 1.4;
        }
        .cvk-success-icon { width: 22px; height: 22px; flex: 0 0 22px; border-radius: 50%; background: #20a05a; color: #fff; display: grid; place-items: center; font-weight: 900; }
        .cvk-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
        .cvk-submit {
          min-width: 170px; height: 44px; border: 0; border-radius: 11px; padding: 0 18px;
          background: #1769e0; color: #fff; font-size: 14px; font-weight: 800; cursor: pointer;
          box-shadow: 0 5px 14px rgba(23, 105, 224, .2);
        }
        .cvk-submit:hover:not(:disabled) { background: #125bc2; }
        .cvk-submit:disabled { opacity: .65; cursor: wait; box-shadow: none; }
        @media (max-width: 560px) {
          .cvk-page { padding: 10px 9px 84px; }
          .cvk-header { margin-bottom: 9px; }
          .cvk-title { font-size: 20px; }
          .cvk-subtitle { font-size: 12px; }
          .cvk-card { border-radius: 15px; }
          .cvk-person, .cvk-form { padding: 13px; }
          .cvk-grid { grid-template-columns: 1fr; gap: 10px; }
          .cvk-time-row { grid-template-columns: 1fr 1fr; }
          .cvk-total { grid-column: 1 / -1; height: 38px; min-width: 0; }
          .cvk-actions { margin-top: 15px; }
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

        <section className="cvk-card">
          <div className="cvk-person">
            <div className="cvk-person-main">
              <div className="cvk-person-label">Người thực hiện</div>
              <div className="cvk-person-name">{workerName}</div>
              <div className="cvk-person-code">Mã NV: {workerCode}</div>
            </div>
            <span className="cvk-badge">CVK · Không SP</span>
          </div>

          <form className="cvk-form" onSubmit={submit}>
            {message && message.toLowerCase().includes("thành công") && (
              <div className="cvk-success" role="status">
                <span className="cvk-success-icon">✓</span>
                <span>{message}</span>
              </div>
            )}

            <section className="cvk-section">
              <h2 className="cvk-section-title">Thông tin công việc</h2>
              <div className="cvk-grid">
                <label className="cvk-field">
                  <span className="cvk-label">Ngày báo cáo</span>
                  <input className="cvk-input" type="date" value={workDate} onChange={e => setWorkDate(e.target.value)} required />
                </label>
                <label className="cvk-field">
                  <span className="cvk-label">Ca làm việc</span>
                  <select className="cvk-input" value={shift} onChange={e => setShift(e.target.value)}>
                    {SHIFTS.map(item => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label className="cvk-field">
                  <span className="cvk-label">Loại công việc</span>
                  <select className="cvk-input" value={workType} onChange={e => setWorkType(e.target.value)}>
                    {WORK_TYPES.map(item => <option key={item}>{item}</option>)}
                  </select>
                </label>
              </div>
            </section>

            <section className="cvk-section">
              <h2 className="cvk-section-title">Thời gian thực hiện</h2>
              <div className="cvk-time-row">
                <label className="cvk-field">
                  <span className="cvk-label">Giờ</span>
                  <input className="cvk-input" inputMode="numeric" min="0" type="number" value={hours} onChange={e => setHours(e.target.value)} placeholder="0" />
                </label>
                <label className="cvk-field">
                  <span className="cvk-label">Phút</span>
                  <input className="cvk-input" inputMode="numeric" min="0" max="59" type="number" value={minutes} onChange={e => setMinutes(e.target.value)} placeholder="0" />
                </label>
                <div className="cvk-total" aria-live="polite">
                  <span className="cvk-total-label">Tổng thời gian</span>
                  <span className="cvk-total-value">{totalHours > 0 ? `${totalHours.toFixed(2)} giờ` : "Chưa nhập"}</span>
                </div>
              </div>
            </section>

            <section className="cvk-section">
              <h2 className="cvk-section-title">Ghi chú</h2>
              <label className="cvk-field">
                <span className="cvk-label">Nội dung công việc</span>
                <textarea className="cvk-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Mô tả ngắn công việc đã thực hiện..." rows={3} />
              </label>
              <div className="cvk-note">
                Hệ thống tự lưu <b>người thực hiện, ngày, ca, loại công việc, thời gian và ghi chú</b>. Công việc này không sử dụng máy, sản phẩm hoặc sản lượng.
              </div>
            </section>

            <div className="cvk-actions">
              <button type="submit" className="cvk-submit" disabled={busy}>
                {busy ? "Đang nộp..." : "Nộp báo cáo"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
