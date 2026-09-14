import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createTempReport, getDeductionOptionsByProcess } from "../../services/productionService";
import type { ProductionDeduction } from "../../types/production";
import { getStoredUser } from "../../utils/authStorage";
import { createClientRequestId } from "../../utils/workerSubmitGuard";
import { useToast } from "../../components/feedback/toastContext";

const PROCESS_ID = 60006;
const PROCESS_CODE = "CVK";
const SHIFTS = ["A", "B", "C", "D"];
const WORK_TYPES = ["Xuất nhập", "Hỗ trợ", "Kho", "Vệ sinh", "Công việc khác"];
const MAX_WORK_MINUTES = 12 * 60;
const localDate = () => { const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const day = String(d.getDate()).padStart(2, "0"); return `${y}-${m}-${day}`; };
const dateLabel = (value: string) => { const d = new Date(`${value}T00:00:00`); const days = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"]; return `${days[d.getDay()]}, ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
const dateOptions = () => Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; return { value, label: i === 0 ? `Hôm nay - ${dateLabel(value)}` : dateLabel(value) }; });
const deductionKey = (item: ProductionDeduction) => String(item.id ?? item.deduction_type_id ?? item.deduction_code ?? item.deduction_name);

export default function NonProductWorkPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const storedUser = useMemo(() => getStoredUser() as any, []);
  const dates = useMemo(dateOptions, []);
  const [workDate, setWorkDate] = useState(localDate);
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
    getDeductionOptionsByProcess(PROCESS_ID).then(rows => { if (!cancelled) setDeductionOptions(Array.isArray(rows) ? rows : []); }).catch(error => { if (!cancelled) { setDeductionOptions([]); showToast(error?.response?.data?.message || "Không tải được danh sách trừ giờ.", "error"); } }).finally(() => { if (!cancelled) setLoadingDeductions(false); });
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
  const trainingPercent = Math.round(Number(storedUser?.training_percent ?? storedUser?.trainingPercent ?? 100) || 100);

  const updateActualTime = (h: string, m: string) => {
    const hh = Number(h || 0), mm = Number(m || 0);
    if (hh < 0 || hh > 12 || mm < 0 || mm > 59) return;
    if (hh * 60 + mm + deductionMinutes > MAX_WORK_MINUTES) { showToast("Tổng thời gian không được vượt quá 12 giờ.", "warning"); return; }
    setHours(h); setMinutes(m);
  };
  const updateDeduction = (key: string, raw: string) => {
    const value = raw.replace(/\D/g, ""); const next = Number(value || 0);
    if (actualMinutes + deductionMinutes - Number(deductions[key] || 0) + next > MAX_WORK_MINUTES) { showToast("Tổng thời gian không được vượt quá 12 giờ.", "warning"); return; }
    setDeductions(prev => ({ ...prev, [key]: value }));
  };
  const toggleDeduction = (key: string, checked: boolean) => {
    if (checked) { setSelectedDeductions(prev => prev.includes(key) ? prev : [...prev, key]); setDeductions(prev => ({ ...prev, [key]: prev[key] ?? "" })); }
    else { setSelectedDeductions(prev => prev.filter(x => x !== key)); setDeductions(prev => { const next = { ...prev }; delete next[key]; return next; }); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!workDate || !shift || !workType || actualMinutes <= 0 || Number(minutes || 0) > 59) { const msg = "Vui lòng nhập đủ thông tin và thời gian làm việc hợp lệ."; setMessage(msg); showToast(msg, "error"); return; }
    if (totalMinutes > MAX_WORK_MINUTES) { const msg = "Tổng thời gian làm việc + thời gian trừ không được vượt quá 12 giờ."; setMessage(msg); showToast(msg, "error"); return; }
    const deductionPayload = selectedDeductions.map(key => { const option = deductionOptions.find(item => deductionKey(item) === key); const value = Number(deductions[key] || 0); return option && value > 0 ? { deduction_type_id: option.id ?? option.deduction_type_id, deduction_code: option.deduction_code, deduction_name: option.deduction_name, hours: value / 60 } : null; }).filter(Boolean);
    setBusy(true); setMessage("");
    try {
      await createTempReport({ process_id: PROCESS_ID, work_date: workDate, shift, worker_id: storedUser?.worker_id, machine_no: "", product_name: "", operation_mode: "MANUAL", total_time: totalHours, actual_time: actualHours, deduction_time: deductionHours, standard_output: 0, actual_output: 0, tt_ok: 0, tt_ng: 0, kqd_dap_lai: 0, kqd_tuot: 0, vo_do_long: 0, xuoc_do_long: 0, cong_gay: 0, xoay: 0, khong_dut: 0, bavia_hut: 0, ppcm: 0, loi_cao_su: 0, ng_kich_thuoc: 0, cat_lem: 0, note: note.trim(), client_request_id: createClientRequestId(), extra_data: { work_type: workType, process_code: PROCESS_CODE, non_product_work: true }, defects: [], deductions: deductionPayload } as any);
      const msg = "Nộp báo cáo thành công. Báo cáo đã được gửi chờ duyệt."; setMessage(msg); showToast(msg, "success"); setHours(""); setMinutes(""); setNote(""); setDeductions({}); setSelectedDeductions([]); setShowDeduction(false);
    } catch (error: any) { const msg = error?.response?.data?.message || error?.message || "Không thể gửi báo cáo."; setMessage(msg); showToast(msg, "error"); }
    finally { setBusy(false); }
  };

  return <main className="worker-form-page cvk-page"><style>{`
    .cvk-page{min-height:100%;box-sizing:border-box;padding:18px 14px 96px;background:#f3f7fc;color:#172033}.cvk-shell{max-width:940px;margin:auto}.cvk-top{display:flex;align-items:center;gap:12px;margin-bottom:8px}.cvk-back{width:40px;height:40px;border:1px solid #d6e1ee;border-radius:11px;background:#fff;color:#17375f;font-size:20px;cursor:pointer}.cvk-title{margin:0;font-size:22px;font-weight:800;color:#123d72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cvk-context{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.cvk-person{display:flex;align-items:baseline;gap:8px;min-width:0}.cvk-name{font-size:14px;font-weight:800;color:#1760ad;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cvk-code{font-size:12px;color:#74869d}.cvk-meta{display:flex;gap:7px;align-items:center}.cvk-training,.cvk-date{height:32px;box-sizing:border-box;border:1px solid #cfe0f3;border-radius:9px;background:#fff;color:#1760ad;font-size:12px;font-weight:800;padding:0 10px;display:flex;align-items:center;white-space:nowrap}.cvk-date{color:#24517d;font-weight:600;max-width:220px;outline:none}.cvk-card{background:#fff;border:1px solid #d9e4ef;border-radius:16px;box-shadow:0 5px 18px rgba(25,55,90,.06);overflow:hidden}.cvk-form{padding:16px}.cvk-section+.cvk-section{margin-top:18px;padding-top:18px;border-top:1px solid #e6edf5}.cvk-section-title{display:flex;align-items:center;gap:7px;margin:0 0 12px;font-size:15px;color:#173b66}.cvk-section-title:before{content:"";width:4px;height:18px;border-radius:4px;background:#3b82d0}.cvk-shifts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;width:100%}.cvk-shift{display:flex;align-items:center;justify-content:center;gap:6px;min-height:34px;min-width:0;padding:0 6px;border-radius:7px;color:#52657e;font-size:13px;cursor:pointer;box-sizing:border-box}.cvk-shift:has(input:checked){background:#eaf3ff;color:#1769d1;font-weight:800}.cvk-shift input{width:17px;height:17px;margin:0;accent-color:#1769e0;flex:0 0 auto}.cvk-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.cvk-label{display:block;margin-bottom:6px;font-size:12px;font-weight:700;color:#52657e}.cvk-label em{color:#d33;font-style:normal}.cvk-input{width:100%;height:42px;box-sizing:border-box;border:1px solid #cbd8e7;border-radius:10px;padding:9px 11px;background:#fff;color:#172033;font-size:14px;outline:none}.cvk-input:focus{border-color:#4d8ddd;box-shadow:0 0 0 3px rgba(52,116,205,.11)}.cvk-time{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 150px;gap:10px}.cvk-total{height:42px;box-sizing:border-box;border:1px solid #dbe5f0;border-radius:10px;background:#f4f7fb;padding:7px 10px;display:flex;flex-direction:column;justify-content:center}.cvk-total small{font-size:10px;color:#718198}.cvk-total strong{font-size:13px;color:#24476e}.cvk-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}.cvk-summary>div{padding:9px 10px;border:1px solid #e0e8f1;border-radius:10px;background:#f8fafc}.cvk-summary small{display:block;font-size:10px;color:#718198}.cvk-summary strong{display:block;margin-top:2px;font-size:13px;color:#27405f}.cvk-deduction{margin-top:10px;border:1px solid #d9e4ef;border-radius:11px;overflow:hidden}.cvk-deduction-head{width:100%;min-height:46px;border:0;background:#f7faff;padding:8px 11px;display:flex;align-items:center;justify-content:space-between;text-align:left;cursor:pointer;color:#213b5b}.cvk-deduction-head b{font-size:13px}.cvk-deduction-head small{display:block;margin-top:2px;color:#718198}.cvk-options{padding:7px 10px;border-top:1px solid #e3eaf2;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 12px}.cvk-check{display:flex;align-items:center;gap:8px;padding:7px 3px;font-size:12px;color:#40536d;min-width:0}.cvk-check input{width:16px;height:16px;accent-color:#1769e0;flex:0 0 auto}.cvk-deduction-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:10px}.cvk-deduction-card{padding:10px;border:1px solid #e0e8f1;border-radius:10px;background:#fbfcfe}.cvk-row{display:flex;align-items:center;gap:7px}.cvk-row .cvk-input{flex:1}.cvk-unit{font-size:11px;font-weight:700;color:#718198}.cvk-hint{margin-top:10px;padding:9px 11px;border-radius:9px;background:#f6f9fc;color:#68788e;font-size:11px;line-height:1.45}.cvk-success{margin-bottom:14px;padding:10px 12px;border:1px solid #bfe3cc;border-radius:10px;background:#f0fbf4;color:#176b3a;font-size:13px}.cvk-actions{display:flex;justify-content:flex-end;margin-top:18px}.cvk-submit{min-width:180px;height:44px;border:0;border-radius:10px;background:#1769e0;color:#fff;font-size:14px;font-weight:800;cursor:pointer}.cvk-submit:disabled{opacity:.65;cursor:wait}@media(max-width:650px){.cvk-page{padding:10px 9px 84px}.cvk-title{font-size:20px}.cvk-context{align-items:stretch;flex-direction:column;gap:8px;margin-bottom:10px}.cvk-meta{display:grid;grid-template-columns:max-content minmax(0,1fr);width:100%}.cvk-date{width:100%;max-width:none}.cvk-form{padding:13px}.cvk-shifts{grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}.cvk-shift{padding:0 3px;font-size:12px}.cvk-grid{grid-template-columns:1fr}.cvk-time{grid-template-columns:1fr 1fr}.cvk-total{grid-column:1/-1}.cvk-summary,.cvk-options,.cvk-deduction-grid{grid-template-columns:1fr}.cvk-actions,.cvk-submit{width:100%}}
  `}</style><div className="cvk-shell">
    <header className="cvk-top"><button type="button" className="cvk-back" onClick={() => navigate("/worker/process/select")} aria-label="Quay lại">←</button><h1 className="cvk-title">Công việc khác - CVK</h1></header>
    <div className="cvk-context"><div className="cvk-person"><strong className="cvk-name">{workerName}</strong><span className="cvk-code">{workerCode}</span></div><div className="cvk-meta"><span className="cvk-training">Học việc: {trainingPercent}%</span><select className="cvk-date" value={workDate} onChange={e => setWorkDate(e.target.value)} aria-label="Chọn ngày báo cáo">{dates.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div></div>
    <section className="cvk-card"><form className="cvk-form" onSubmit={submit}>{message && message.toLowerCase().includes("thành công") && <div className="cvk-success">✓ {message}</div>}
      <section><h2 className="cvk-section-title">Thông tin công việc</h2><div><span className="cvk-label">Ca làm việc <em>*</em></span><div className="cvk-shifts">{SHIFTS.map(item => <label key={item} className="cvk-shift"><input type="radio" name="cvk-shift" value={item} checked={shift === item} onChange={e => setShift(e.target.value)} /><span>{item}</span></label>)}</div></div><div className="cvk-grid" style={{ marginTop: 10 }}><label><span className="cvk-label">Loại công việc <em>*</em></span><select className="cvk-input" value={workType} onChange={e => setWorkType(e.target.value)}>{WORK_TYPES.map(item => <option key={item}>{item}</option>)}</select></label></div></section>
      <section className="cvk-section"><h2 className="cvk-section-title">Hiệu suất &amp; Thời gian</h2><div className="cvk-time"><label><span className="cvk-label">Thời gian làm việc thực tế · Giờ</span><input className="cvk-input" inputMode="numeric" min="0" max="12" type="number" value={hours} onChange={e => updateActualTime(e.target.value, minutes)} placeholder="0" /></label><label><span className="cvk-label">Phút</span><input className="cvk-input" inputMode="numeric" min="0" max="59" type="number" value={minutes} onChange={e => updateActualTime(hours, e.target.value)} placeholder="0" /></label><div className="cvk-total"><small>Tổng thời gian</small><strong>{totalHours > 0 ? `${totalHours.toFixed(2)} giờ` : "Chưa nhập"}</strong></div></div><div className="cvk-summary"><div><small>Thực tế</small><strong>{actualHours.toFixed(2)} giờ</strong></div><div><small>Thời gian trừ</small><strong>{deductionHours.toFixed(2)} giờ</strong></div><div><small>Tổng</small><strong>{totalHours.toFixed(2)} / 12 giờ</strong></div></div>
        <div className="cvk-deduction"><button type="button" className="cvk-deduction-head" onClick={() => setShowDeduction(v => !v)} aria-expanded={showDeduction}><span><b>⏱ Thời gian trừ</b><small>{selectedDeductions.length ? `${selectedDeductions.length} loại · ${deductionMinutes} phút` : loadingDeductions ? "Đang tải danh sách…" : "Không có thời gian trừ"}</small></span><span>{showDeduction ? "▲" : "▼"}</span></button>{showDeduction && <div className="cvk-options">{loadingDeductions ? <div className="cvk-hint">Đang tải danh sách trừ giờ…</div> : deductionOptions.length === 0 ? <div className="cvk-hint">Chưa có loại thời gian trừ.</div> : deductionOptions.map(item => { const key = deductionKey(item); return <label key={key} className="cvk-check"><input type="checkbox" checked={selectedDeductions.includes(key)} onChange={e => toggleDeduction(key, e.target.checked)} /><span>{item.deduction_name}</span></label>; })}</div>}</div>
        {selectedDeductions.length > 0 && <div className="cvk-deduction-grid">{deductionOptions.filter(item => selectedDeductions.includes(deductionKey(item))).map(item => { const key = deductionKey(item); return <div key={key} className="cvk-deduction-card"><label className="cvk-label" htmlFor={`cvk-deduction-${key}`}>{item.deduction_name}</label><div className="cvk-row"><input id={`cvk-deduction-${key}`} className="cvk-input" inputMode="numeric" min="0" type="number" value={deductions[key] ?? ""} onChange={e => updateDeduction(key, e.target.value)} placeholder="0" /><span className="cvk-unit">phút</span></div></div>; })}</div>}
        <div className="cvk-hint">Thời gian trừ được cộng vào tổng thời gian để tính công. Tổng thời gian thực tế + thời gian trừ không được vượt quá <b>12 giờ</b>.</div></section>
      <section className="cvk-section"><h2 className="cvk-section-title">Ghi chú</h2><label><span className="cvk-label">Nội dung công việc</span><textarea className="cvk-input" style={{ height: 82, resize: "vertical" }} value={note} onChange={e => setNote(e.target.value)} placeholder="Mô tả ngắn công việc đã thực hiện..." rows={3} /></label></section>
      <div className="cvk-actions"><button type="submit" className="cvk-submit" disabled={busy}>{busy ? "Đang nộp..." : "Nộp báo cáo"}</button></div>
    </form></section>
  </div></main>;
}
