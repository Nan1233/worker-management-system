import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createTempReport, getDeductionOptionsByProcess } from "../../services/productionService";
import type { ProductionDeduction } from "../../types/production";
import { getStoredUser } from "../../utils/authStorage";
import { createClientRequestId } from "../../utils/workerSubmitGuard";
import { useToast } from "../../components/feedback/toastContext";

const PROCESS_ID = 60006;
const WORK_TYPES = ["XUATNHAP", "KTCD", "TAIPP"] as const;
const SHIFTS = ["A", "B", "C", "D"] as const;
const MAX_MINUTES = 720;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dates = () => Array.from({ length: 14 }, (_, i) => {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
  const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { value, label: i === 0 ? "Hôm nay" : value.split("-").reverse().join("/") };
});
const deductionKey = (x: ProductionDeduction) => String(x.id ?? x.deduction_type_id ?? x.deduction_code ?? x.deduction_name);

export default function CvkWorkPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const user = useMemo(() => getStoredUser() as any, []);
  const dateOptions = useMemo(dates, []);
  const [workDate, setWorkDate] = useState(today);
  const [shift, setShift] = useState<(typeof SHIFTS)[number]>("A");
  const [workType, setWorkType] = useState<(typeof WORK_TYPES)[number]>("XUATNHAP");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");
  const [deductions, setDeductions] = useState<ProductionDeduction[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [deductionValues, setDeductionValues] = useState<Record<string, string>>({});
  const [showDeduction, setShowDeduction] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getDeductionOptionsByProcess(PROCESS_ID).then(rows => { if (active) setDeductions(Array.isArray(rows) ? rows : []); }).catch(() => { if (active) setDeductions([]); });
    return () => { active = false; };
  }, []);

  const actualMinutes = Math.max(0, Number(hours || 0) * 60 + Number(minutes || 0));
  const deductionMinutes = selected.reduce((sum, key) => sum + Math.max(0, Number(deductionValues[key] || 0)), 0);
  const totalMinutes = actualMinutes + deductionMinutes;

  const setTime = (h: string, m: string) => {
    const hh = Math.max(0, Math.min(12, Number(h || 0)));
    const mm = Math.max(0, Math.min(59, Number(m || 0)));
    if (hh * 60 + mm + deductionMinutes > MAX_MINUTES) return showToast("Tổng thời gian không được vượt quá 12 giờ.", "warning");
    setHours(h); setMinutes(m);
  };

  const setDeduction = (key: string, raw: string) => {
    const value = raw.replace(/\D/g, "");
    const old = Number(deductionValues[key] || 0);
    if (actualMinutes + deductionMinutes - old + Number(value || 0) > MAX_MINUTES) return showToast("Tổng thời gian không được vượt quá 12 giờ.", "warning");
    setDeductionValues(v => ({ ...v, [key]: value }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!workDate || !shift || !workType || actualMinutes <= 0 || totalMinutes > MAX_MINUTES) {
      showToast("Vui lòng nhập đủ thông tin và bảo đảm tổng thời gian không vượt quá 12 giờ.", "error"); return;
    }
    const deductionPayload = selected.map(key => {
      const option = deductions.find(x => deductionKey(x) === key);
      const value = Number(deductionValues[key] || 0);
      return option && value > 0 ? { deduction_type_id: option.id ?? option.deduction_type_id, deduction_code: option.deduction_code, deduction_name: option.deduction_name, hours: value / 60 } : null;
    }).filter(Boolean);
    setBusy(true);
    try {
      await createTempReport({
        process_id: PROCESS_ID, work_date: workDate, shift, worker_id: user?.worker_id,
        machine_no: "", product_name: "", operation_mode: "MANUAL", total_time: totalMinutes / 60,
        actual_time: actualMinutes / 60, deduction_time: deductionMinutes / 60, standard_output: 0,
        actual_output: 0, tt_ok: 0, tt_ng: 0, kqd_dap_lai: 0, kqd_tuot: 0, vo_do_long: 0,
        xuoc_do_long: 0, cong_gay: 0, xoay: 0, khong_dut: 0, bavia_hut: 0, ppcm: 0,
        loi_cao_su: 0, ng_kich_thuoc: 0, cat_lem: 0, note: note.trim(),
        client_request_id: createClientRequestId(), extra_data: { work_type: workType, process_code: "CVK", non_product_work: true },
        defects: [], deductions: deductionPayload,
      } as any);
      showToast("Nộp báo cáo thành công. Báo cáo đã được gửi chờ duyệt.", "success");
      setHours(""); setMinutes(""); setNote(""); setSelected([]); setDeductionValues({}); setShowDeduction(false);
    } catch (error: any) {
      showToast(error?.response?.data?.message || error?.message || "Không thể gửi báo cáo.", "error");
    } finally { setBusy(false); }
  };

  const workerName = user?.worker_name || user?.name || user?.full_name || "Công nhân";
  const workerCode = user?.worker_code || user?.code || user?.username || "---";

  return <main className="worker-form-page cvk-new-page"><style>{`
    .cvk-new-page{min-height:100%;padding:14px 12px 90px;background:#f3f7fc;color:#172033}.cvk-new-shell{max-width:940px;margin:auto}.cvk-new-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}.cvk-new-back{width:40px;height:40px;border:1px solid #d6e1ee;border-radius:10px;background:#fff;color:#17375f;font-size:20px}.cvk-new-title{margin:0;font-size:21px;color:#123d72}.cvk-new-context{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.cvk-new-name{font-size:14px;font-weight:800;color:#1760ad}.cvk-new-code{font-size:12px;color:#718198;margin-left:7px}.cvk-new-date{height:34px;border:1px solid #cfe0f3;border-radius:9px;background:#fff;padding:0 8px}.cvk-new-card{background:#fff;border:1px solid #d9e4ef;border-radius:15px;box-shadow:0 4px 16px rgba(25,55,90,.06);padding:15px}.cvk-new-section+.cvk-new-section{border-top:1px solid #e5ecf4;margin-top:16px;padding-top:16px}.cvk-new-label{display:block;margin-bottom:7px;font-size:12px;font-weight:700;color:#52657e}.cvk-new-buttons{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.cvk-new-buttons button{height:42px;border:1px solid #cfddec;border-radius:9px;background:#fff;color:#49627d;font-weight:800;cursor:pointer}.cvk-new-buttons button.active{background:#eaf3ff;border-color:#1769e0;color:#1769e0;box-shadow:inset 0 0 0 1px #1769e0}.cvk-new-shifts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.cvk-new-shifts button{height:38px;border:1px solid #d7e2ee;border-radius:8px;background:#fff;font-weight:700;color:#52657e}.cvk-new-shifts button.active{background:#eaf3ff;border-color:#1769e0;color:#1769e0}.cvk-new-time{display:grid;grid-template-columns:1fr 1fr 180px;gap:10px}.cvk-new-input{width:100%;height:42px;box-sizing:border-box;border:1px solid #d5e0ec;border-radius:9px;padding:0 10px;background:#fff;outline:none}.cvk-new-total{height:42px;border:1px solid #dfe7f0;border-radius:9px;background:#f6f9fc;padding:5px 10px;box-sizing:border-box}.cvk-new-total small{display:block;color:#718198;font-size:10px}.cvk-new-total strong{font-size:13px;color:#27476d}.cvk-new-note{min-height:76px;resize:vertical}.cvk-new-deduction{margin-top:10px;border:1px solid #d9e4ef;border-radius:10px;overflow:hidden}.cvk-new-deduction>button{width:100%;height:43px;border:0;background:#f7faff;text-align:left;padding:0 11px;font-weight:800;color:#294666}.cvk-new-deduction-list{padding:7px 10px;border-top:1px solid #e4ebf3;display:grid;grid-template-columns:repeat(2,1fr);gap:4px}.cvk-new-check{display:flex;gap:7px;align-items:center;padding:7px 2px;font-size:12px}.cvk-new-deduction-values{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;padding:8px 10px}.cvk-new-deduction-value{border:1px solid #e1e8f0;border-radius:9px;padding:8px}.cvk-new-actions{display:flex;justify-content:flex-end;margin-top:16px}.cvk-new-submit{min-width:190px;height:44px;border:0;border-radius:10px;background:#1769e0;color:#fff;font-weight:800}.cvk-new-submit:disabled{opacity:.65}@media(max-width:650px){.cvk-new-page{padding:9px 8px 80px}.cvk-new-context{align-items:stretch;flex-direction:column;gap:8px}.cvk-new-date{width:100%}.cvk-new-time{grid-template-columns:1fr 1fr}.cvk-new-total{grid-column:1/-1}.cvk-new-deduction-list,.cvk-new-deduction-values{grid-template-columns:1fr}.cvk-new-actions,.cvk-new-submit{width:100%}}
  `}</style><div className="cvk-new-shell">
    <header className="cvk-new-head"><button className="cvk-new-back" type="button" onClick={() => navigate("/worker/process/select")}>←</button><h1 className="cvk-new-title">Công việc không có định mức</h1></header>
    <div className="cvk-new-context"><div><span className="cvk-new-name">{workerName}</span><span className="cvk-new-code">{workerCode}</span></div><select className="cvk-new-date" value={workDate} onChange={e => setWorkDate(e.target.value)}>{dateOptions.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}</select></div>
    <form className="cvk-new-card" onSubmit={submit}>
      <section className="cvk-new-section"><label className="cvk-new-label">Công việc <em>*</em></label><div className="cvk-new-buttons">{WORK_TYPES.map(x => <button key={x} type="button" className={workType === x ? "active" : ""} onClick={() => setWorkType(x)}>{x}</button>)}</div></section>
      <section className="cvk-new-section"><label className="cvk-new-label">Ca làm việc <em>*</em></label><div className="cvk-new-shifts">{SHIFTS.map(x => <button key={x} type="button" className={shift === x ? "active" : ""} onClick={() => setShift(x)}>Ca {x}</button>)}</div></section>
      <section className="cvk-new-section"><label className="cvk-new-label">Thời gian làm việc <em>*</em></label><div className="cvk-new-time"><input className="cvk-new-input" type="number" min="0" max="12" placeholder="Giờ" value={hours} onChange={e => setTime(e.target.value, minutes)} /><input className="cvk-new-input" type="number" min="0" max="59" placeholder="Phút" value={minutes} onChange={e => setTime(hours, e.target.value)} /><div className="cvk-new-total"><small>Tổng thời gian</small><strong>{Math.floor(totalMinutes / 60)} giờ {totalMinutes % 60} phút</strong></div></div>
        <div className="cvk-new-deduction"><button type="button" onClick={() => setShowDeduction(v => !v)}>Trừ giờ {showDeduction ? "▲" : "▼"}</button>{showDeduction && <><div className="cvk-new-deduction-list">{deductions.map(x => { const key = deductionKey(x); return <label className="cvk-new-check" key={key}><input type="checkbox" checked={selected.includes(key)} onChange={e => setSelected(v => e.target.checked ? [...v, key] : v.filter(k => k !== key))} />{x.deduction_name || x.deduction_code || key}</label>; })}</div><div className="cvk-new-deduction-values">{selected.map(key => <label className="cvk-new-deduction-value" key={key}><span className="cvk-new-label">Số phút</span><input className="cvk-new-input" type="number" min="0" value={deductionValues[key] || ""} onChange={e => setDeduction(key, e.target.value)} /></label>)}</div></>}</div>
      </section>
      <section className="cvk-new-section"><label className="cvk-new-label">Ghi chú</label><textarea className="cvk-new-input cvk-new-note" value={note} onChange={e => setNote(e.target.value)} placeholder="Nhập ghi chú nếu có..." /></section>
      <div className="cvk-new-actions"><button className="cvk-new-submit" disabled={busy} type="submit">{busy ? "Đang gửi..." : "Nộp báo cáo"}</button></div>
    </form>
  </div></main>;
}
