import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createTempReport } from "../../services/productionService";
import { getStoredUser } from "../../utils/authStorage";
import { createClientRequestId } from "../../utils/workerSubmitGuard";

const PROCESS_ID = 60006;
const PROCESS_CODE = "CVK";
const SHIFTS = ["A", "B", "C", "D", "Ca 1", "Ca 2", "Ca 3"];
const WORK_TYPES = ["Xuất nhập", "Hỗ trợ", "Kho", "Vệ sinh", "Công việc khác"];

export default function NonProductWorkPage() {
  const navigate = useNavigate();
  const storedUser = useMemo(() => getStoredUser() as any, []);
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [shift, setShift] = useState("A");
  const [workType, setWorkType] = useState("Hỗ trợ");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;

    const h = Number(hours || 0);
    const m = Number(minutes || 0);
    const total = h + m / 60;
    if (!workDate || !shift || !workType || total <= 0 || m > 59) {
      setMessage("Vui lòng nhập đủ ngày, ca, loại công việc và thời gian hợp lệ.");
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
      setMessage("Đã gửi báo cáo công việc. Báo cáo sẽ chờ duyệt như các báo cáo khác.");
      setHours("");
      setMinutes("");
      setNote("");
    } catch (error: any) {
      setMessage(error?.response?.data?.message || error?.message || "Không thể gửi báo cáo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "16px 12px 96px" }}>
      <section style={{ background: "var(--surface, #fff)", border: "1px solid var(--border, #dbe4f0)", borderRadius: 18, padding: 18, boxShadow: "0 8px 24px rgba(15,23,42,.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", opacity: .65 }}>CÔNG ĐOẠN {PROCESS_CODE}</div>
            <h1 style={{ margin: "4px 0 4px", fontSize: 24 }}>Công việc khác</h1>
            <div style={{ fontSize: 14, opacity: .72 }}>Dành cho Xuất nhập, Hỗ trợ và các công việc không có mã sản phẩm.</div>
          </div>
          <button type="button" onClick={() => navigate("/worker/process/select")} style={{ border: 0, background: "transparent", cursor: "pointer", fontWeight: 700 }}>← Quay lại</button>
        </div>

        <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
          <label>Ngày báo cáo<input type="date" value={workDate} onChange={e => setWorkDate(e.target.value)} required style={inputStyle} /></label>
          <label>Ca<select value={shift} onChange={e => setShift(e.target.value)} style={inputStyle}>{SHIFTS.map(item => <option key={item}>{item}</option>)}</select></label>
          <label>Loại công việc<select value={workType} onChange={e => setWorkType(e.target.value)} style={inputStyle}>{WORK_TYPES.map(item => <option key={item}>{item}</option>)}</select></label>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 7 }}>Thời gian thực hiện</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label>Giờ<input inputMode="numeric" min="0" type="number" value={hours} onChange={e => setHours(e.target.value)} placeholder="0" style={inputStyle} /></label>
              <label>Phút<input inputMode="numeric" min="0" max="59" type="number" value={minutes} onChange={e => setMinutes(e.target.value)} placeholder="0" style={inputStyle} /></label>
            </div>
          </div>

          <label>Ghi chú<textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Mô tả ngắn công việc đã thực hiện..." rows={4} style={{ ...inputStyle, resize: "vertical" }} /></label>

          <div style={{ background: "#f7f9fc", borderRadius: 12, padding: 12, fontSize: 13, lineHeight: 1.5 }}>
            <b>Mã sản phẩm:</b> Không áp dụng &nbsp;•&nbsp; <b>Thực tích:</b> Không áp dụng<br />
            Hệ thống lưu người làm, loại công việc, thời gian và ghi chú; không tạo mã sản phẩm giả.
          </div>

          {message && <div role="status" style={{ padding: 11, borderRadius: 10, background: "#eef5ff", fontSize: 14 }}>{message}</div>}
          <button type="submit" disabled={busy} style={{ border: 0, borderRadius: 12, padding: "13px 16px", fontWeight: 800, cursor: busy ? "wait" : "pointer", background: "#1769e0", color: "#fff" }}>
            {busy ? "Đang gửi..." : "Gửi báo cáo"}
          </button>
        </form>
      </section>
    </main>
  );
}

const inputStyle: CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  marginTop: 6,
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "11px 12px",
  background: "#fff",
  fontSize: 15,
};
