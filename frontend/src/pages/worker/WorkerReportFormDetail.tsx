import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getReportById } from "../../services/productionService";

const EDIT_WINDOW_MS = 10 * 60 * 1000;
const n = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const text = (v: any, fallback = "") => String(v ?? fallback);
const fmt = (v: any, d = 0) => n(v).toLocaleString("vi-VN", { maximumFractionDigits: d });
const dateMs = (v: any) => { if (!v) return NaN; const s = String(v); const x = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(s) ? `${s.replace(" ", "T")}Z` : s; return new Date(x).getTime(); };

function Field({ label, value }: { label: string; value: any }) {
  return <div className="wrfd-field"><label>{label}</label><div className="wrfd-input">{value === null || value === undefined || value === "" ? "—" : value}</div></div>;
}
function parseList(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") { try { return parseList(JSON.parse(v)); } catch { return []; } }
  return [];
}
function DefectList({ title, rows }: { title: string; rows: any[] }) {
  const items = parseList(rows).filter(x => n(x?.quantity) > 0);
  return <div className="wrfd-block"><div className="wrfd-block-title">{title}</div>{items.length ? items.map((x,i) => <div className="wrfd-row" key={`${x.defect_type_id || x.defect_code || i}-${i}`}><span>{x.defect_code || "NG"} — {x.defect_name || "Chưa phân loại"}</span><b>{fmt(x.quantity)}</b></div>) : <div className="wrfd-empty">Không có chi tiết được lưu ở cấp này.</div>}</div>;
}

export default function WorkerReportFormDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const source = String(params.get("source") || "pending").toLowerCase() === "approved" ? "approved" : "pending";
  const navigate = useNavigate();
  const [report,setReport] = useState<any>(null); const [loading,setLoading] = useState(true); const [error,setError] = useState(""); const [now,setNow] = useState(Date.now());
  useEffect(() => { let live=true; (async()=>{ try { const rid=Number(id); if(!Number.isInteger(rid)||rid<=0) throw new Error("ID báo cáo không hợp lệ."); const raw:any=await getReportById(rid,source); const data=raw?.report||raw?.data||raw; if(!data) throw new Error("Không tìm thấy báo cáo."); if(live) setReport(data); } catch(e:any){ if(live) setError(e?.response?.data?.message||e?.message||"Không thể tải chi tiết báo cáo."); } finally { if(live) setLoading(false); } })(); return ()=>{live=false;}; },[id,source]);
  useEffect(()=>{const t=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(t);},[]);
  const remaining=useMemo(()=>{if(!report||source==="approved")return 0;const created=dateMs(report.created_at);return Number.isFinite(created)?Math.max(0,created+EDIT_WINDOW_MS-now):0;},[report,source,now]);
  if(loading) return <main className="worker-form-page"><div className="wrfd-shell">Đang tải báo cáo...</div></main>;
  if(error) return <main className="worker-form-page"><div className="wrfd-shell"><div className="wrfd-error">{error}</div></div></main>;
  const r=report||{}; const machines=parseList(r.machine_lines); const workerDefects=parseList(r.defects); const deductions=parseList(r.deductions); const status=text(r.status,"pending").toLowerCase(); const canEdit=source!=="approved"&&["pending","need_fix"].includes(status)&&remaining>0; const sec=Math.ceil(remaining/1000);
  return <main className="worker-form-page wrfd-page"><div className="wrfd-shell">
    <header className="wrfd-header"><button className="wrfd-back" onClick={()=>navigate(-1)}>←</button><div><h1>Chi tiết báo cáo sản xuất</h1><small>{canEdit?`Có thể sửa · còn ${Math.floor(sec/60)}:${String(sec%60).padStart(2,"0")}`:"Chỉ xem · dữ liệu đã khóa"}</small></div>{canEdit&&<button className="wrfd-edit" onClick={()=>navigate(`/worker/history/${id}/edit`)}>Sửa báo cáo</button>}</header>
    <section className="wrfd-card"><h2>Thông tin nhập báo cáo</h2><div className="wrfd-grid">
      <Field label="Công nhân" value={r.full_name||r.worker_name}/><Field label="Mã công nhân" value={r.worker_code}/><Field label="Công đoạn" value={r.process_name||r.process_code}/>
      <Field label="Ngày sản xuất" value={r.work_date?new Date(r.work_date).toLocaleDateString("vi-VN"):"—"}/><Field label="Ca" value={r.shift}/><Field label="Sản phẩm" value={r.product_name||r.product_code}/>
      <Field label="Hình thức" value={r.operation_mode||r.execution_mode}/><Field label="Loại gia công" value={r.work_type||r.process_type}/><Field label="Máy" value={r.machine_no||machines.map(x=>x.machine_code||x.machine_no).filter(Boolean).join(", ")}/>
      <Field label="Thời gian thực tế" value={`${fmt(r.actual_time??r.total_time,2)} giờ`}/><Field label="Thời gian trừ" value={`${fmt(r.deduction_time,2)} giờ`}/><Field label="Tổng thời gian" value={`${fmt(r.total_time,2)} giờ`}/>
    </div></section>
    <section className="wrfd-card"><h2>Sản lượng</h2><div className="wrfd-grid wrfd-four"><Field label="Sản lượng OK" value={fmt(r.tt_ok??r.ok_quantity??r.total_ok)}/><Field label="Sản lượng NG" value={fmt(r.tt_ng??r.ng_quantity??r.total_ng)}/><Field label="Tổng sản lượng" value={fmt(r.actual_output??r.tt_sl??r.total_output)}/><Field label="% đạt" value={r.achievement_percent!=null?`${fmt(r.achievement_percent,2)}%`:"—"}/></div></section>
    <section className="wrfd-card"><h2>Chi tiết lỗi NG của người</h2><div className="wrfd-total">Tổng NG người: <b>{fmt(r.tt_ng??r.ng_quantity??r.total_ng)}</b></div><DefectList title="Lỗi đã nhập/lưu ở cấp công nhân" rows={workerDefects}/>{n(r.tt_ng)>0&&!workerDefects.length&&<div className="wrfd-warning">Báo cáo có NG nhưng API không trả về dòng lỗi người. Không tự lấy lỗi máy để thay thế.</div>}</section>
    {machines.map((m,i)=>{const defects=parseList(m.defects||m.defects_json); const people=parseList(m.participants||m.workers); return <section className="wrfd-card" key={m.id||i}><h2>Máy {i+1}: {m.machine_code||m.machine_no||"—"}</h2><div className="wrfd-grid"><Field label="Sản phẩm" value={m.product_code||m.product_name||r.product_name}/><Field label="Thời gian chạy máy" value={`${fmt(m.machine_time_hours??m.time_hours,2)} giờ`}/><Field label="OK máy" value={fmt(m.ok_quantity??m.tt_ok)}/><Field label="NG máy" value={fmt(m.ng_quantity??m.tt_ng)}/></div><DefectList title="Chi tiết lỗi NG máy" rows={defects}/>{people.length>0&&<div className="wrfd-block"><div className="wrfd-block-title">Người tham gia / chịu trách nhiệm</div>{people.map((p:any,j:number)=><div className="wrfd-row" key={p.worker_id||j}><span>{p.full_name||p.worker_name||p.worker_code||`Worker #${p.worker_id||"?"}`}</span><b>{p.responsible?"Chịu trách nhiệm":"Tham gia"}</b></div>)}</div>}</section>})}
    <section className="wrfd-card"><h2>Chi tiết trừ giờ</h2>{deductions.length?deductions.map((d:any,i:number)=><div className="wrfd-row" key={i}><span>{d.deduction_code||"TRỪ GIỜ"} — {d.deduction_name||"Chưa phân loại"}</span><b>{fmt(d.hours,2)} giờ</b></div>):<div className="wrfd-empty">Không có thời gian trừ.</div>}</section>
    <section className="wrfd-card"><h2>Ghi chú</h2><div className="wrfd-note">{r.note||r.remark||r.comment||"Không có ghi chú."}</div></section>
    <style>{`.wrfd-page{min-height:100dvh;background:#f5f8fc}.wrfd-shell{width:min(100%,1000px);margin:auto;padding:0 12px 40px}.wrfd-header{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:12px;padding:10px 4px;background:#f5f8fc;border-bottom:1px solid #dce5ef}.wrfd-header h1{font-size:18px;margin:0;color:#123e70}.wrfd-header small{color:#64748b}.wrfd-back,.wrfd-edit{border:1px solid #d7e2ef;border-radius:8px;padding:9px 14px;background:#fff}.wrfd-edit{margin-left:auto;background:#2678c9;color:#fff;border:0;font-weight:700}.wrfd-card{margin-top:12px;background:#fff;border:1px solid #dce5ef;border-radius:10px;padding:15px}.wrfd-card h2{font-size:14px;color:#0f477f;margin:0 0 13px}.wrfd-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}.wrfd-four{grid-template-columns:repeat(4,minmax(0,1fr))}.wrfd-field label{display:block;font-size:11px;color:#64748b;margin-bottom:4px}.wrfd-input{min-height:38px;box-sizing:border-box;border:1px solid #cfd9e5;background:#f8fafc;border-radius:7px;padding:9px 10px;font-size:13px;color:#172b4d}.wrfd-total{padding:10px;border-radius:7px;background:#f7f9fc;margin-bottom:10px}.wrfd-block{margin-top:12px;border:1px solid #dce5ef;border-radius:8px;overflow:hidden}.wrfd-block-title{padding:9px 11px;background:#f7f9fc;font-weight:700;font-size:12px;color:#164a7c}.wrfd-row{display:flex;justify-content:space-between;gap:10px;padding:9px 11px;border-top:1px solid #edf1f5;font-size:12px}.wrfd-row b{white-space:nowrap}.wrfd-empty{padding:11px;color:#64748b;font-size:12px}.wrfd-warning{margin-top:10px;padding:10px;border:1px solid #f2c7cd;background:#fff4f5;border-radius:7px;color:#a71932;font-size:12px}.wrfd-note{min-height:55px;border:1px solid #dce5ef;border-radius:7px;background:#f8fafc;padding:10px;font-size:13px}.wrfd-error{padding:20px;background:#fff;border:1px solid #efc5ca;color:#a71932;border-radius:10px}@media(max-width:700px){.wrfd-grid,.wrfd-four{grid-template-columns:1fr 1fr}.wrfd-header h1{font-size:15px}}@media(max-width:430px){.wrfd-grid,.wrfd-four{grid-template-columns:1fr}.wrfd-shell{padding:0 8px 30px}}`}</style>
  </div></main>;
}
