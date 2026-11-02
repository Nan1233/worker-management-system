import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, ClipboardList, PackageCheck, RefreshCw, XCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../services/api";
import "./ProcessTracking.css";

type Process={id:number;process_code?:string;process_name:string;status?:string};
type Summary={processes:Process[];process_summary:{process_id:number;process_code?:string;process_name:string;report_count:number;ok:number;ng:number}[];plan_summary:{process_id:number;planned_quantity:number;planned_minutes:number;plan_count:number}[]};
const pad=(n:number)=>String(n).padStart(2,"0");
const today=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
const monthStart=()=>today().slice(0,8)+"01";
const number=(v:number)=>Number(v||0).toLocaleString("vi-VN",{maximumFractionDigits:1});
export default function ProcessTrackingDetail(){
 const {processId}=useParams(),navigate=useNavigate();
 const [from,setFrom]=useState(monthStart()),[to,setTo]=useState(today()),[appliedFrom,setAppliedFrom]=useState(monthStart()),[appliedTo,setAppliedTo]=useState(today());
 const [processes,setProcesses]=useState<Process[]>([]),[summary,setSummary]=useState<Summary|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const process=useMemo(()=>processes.find(p=>String(p.id)===String(processId)),[processes,processId]);
 const processRow=summary?.process_summary.find(p=>String(p.process_id)===String(processId));
 const planRow=summary?.plan_summary.find(p=>String(p.process_id)===String(processId));
 const load=async(start=appliedFrom,end=appliedTo)=>{setLoading(true);setError("");try{const [master,stats]=await Promise.all([api.get("/admin/master/processes"),api.get("/dashboard/summary",{params:{from:start,to:end}})]);const allowed=(Array.isArray(master.data?.data)?master.data.data:[]).filter((p:Process)=>String(p.status||"active").toLowerCase()==="active");setProcesses(allowed);setSummary(stats.data?.data||null);if(!allowed.some((p:Process)=>String(p.id)===String(processId)))setError("Công đoạn không tồn tại hoặc nằm ngoài phạm vi được phân công.");}catch(e:any){setError(e?.response?.status===403?"Bạn không có quyền xem công đoạn này.":e?.response?.data?.message||"Không thể tải dữ liệu công đoạn.");}finally{setLoading(false);}};
 useEffect(()=>{void load();},[processId,appliedFrom,appliedTo]);
 const apply=()=>{if(!from||!to||from>to){setError("Khoảng thời gian không hợp lệ.");return;}setAppliedFrom(from);setAppliedTo(to);};
 const total=(processRow?.ok||0)+(processRow?.ng||0);
 return <main className="process-tracking-page">
  <button className="process-tracking-back" type="button" onClick={()=>navigate("..")}><ArrowLeft size={16}/> Danh sách công đoạn</button>
  <header className="process-tracking-heading"><div><span className="process-tracking-eyebrow">CHI TIẾT CÔNG ĐOẠN</span><h1>{process?.process_name||"Công đoạn"}</h1><p>{process?.process_code||"Theo dõi tình hình sản xuất"} · Dữ liệu trong phạm vi được phân công</p></div><button className="process-tracking-refresh" type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/> Làm mới</button></header>
  <section className="process-tracking-filter"><label><span>Từ ngày</span><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label><span>Đến ngày</span><input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><button type="button" onClick={apply}><CalendarDays size={16}/> Áp dụng</button></section>
  {loading?<div className="process-tracking-state" role="status">Đang tải dữ liệu…</div>:error?<div className="process-tracking-state error" role="alert">{error}</div>:!processRow?<div className="process-tracking-state">Chưa có báo cáo sản xuất đã duyệt trong khoảng thời gian này.</div>:<>
   <div className="process-tracking-period">Dữ liệu từ {appliedFrom.split("-").reverse().join("/")} đến {appliedTo.split("-").reverse().join("/")}</div>
   <section className="process-tracking-metrics">
    <article><span className="metric-icon blue"><ClipboardList size={19}/></span><small>Số báo cáo đã duyệt</small><strong>{number(processRow.report_count)}</strong></article>
    <article><span className="metric-icon green"><CheckCircle2 size={19}/></span><small>Sản lượng OK</small><strong>{number(processRow.ok)}</strong></article>
    <article><span className="metric-icon red"><XCircle size={19}/></span><small>Sản lượng NG</small><strong>{number(processRow.ng)}</strong></article>
    <article><span className="metric-icon purple"><PackageCheck size={19}/></span><small>Sản lượng kế hoạch</small><strong>{number(planRow?.planned_quantity||0)}</strong></article>
   </section>
   <section className="process-tracking-summary"><div><span>Tỷ lệ OK</span><strong>{total?((processRow.ok/total)*100).toLocaleString("vi-VN",{maximumFractionDigits:2}):"0"}%</strong></div><div><span>Tổng sản lượng ghi nhận</span><strong>{number(total)}</strong></div><div><span>Số dòng kế hoạch</span><strong>{number(planRow?.plan_count||0)}</strong></div></section>
   <p className="process-tracking-footnote">Các chỉ số trên được tổng hợp từ báo cáo đã duyệt của công đoạn. Chi tiết máy, nhân viên và giờ công sẽ được bổ sung ở các phần tiếp theo; trang này không tự suy diễn các số liệu chưa có API phân tách theo công đoạn.</p>
  </>}
 </main>;
}
