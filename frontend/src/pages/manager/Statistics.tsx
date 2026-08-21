import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, CheckCircle2, Clock3, FileText, Filter, Gauge, HardDrive, XCircle } from "lucide-react";
import api from "../../services/api";
import { useToast } from "../../components/feedback/toastContext";
import "./Statistics.css";

type TabKey="day"|"process"|"shift"|"worker"|"machine";
type Summary={
 pending_count:number; approved_count:number; total_ok:number; total_ng:number; ng_rate:number;
 processes:{id:number;process_code?:string;process_name:string}[];
 process_summary:{process_id:number;process_code?:string;process_name:string;report_count:number;ok:number;ng:number}[];
 shift_summary:{shift:string;report_count:number;ok:number;ng:number}[];
 daily_summary:{work_date:string;report_count:number;ok:number;ng:number}[];
 worker_performance:{actual_worker_hours:number;earned_standard_hours:number;efficiency_percent:number};
 machine_performance:{machine_count:number;machine_line_count:number;total_machine_hours:number;maximum_output:number;counted_output:number;total_ok:number;total_ng:number;efficiency_percent:number};
 machine_summary:{machine_id:number;machine_code?:string;run_count:number;machine_hours:number;maximum_output:number;counted_output:number;ok:number;ng:number;efficiency_percent:number}[];
};
const EMPTY:Summary={pending_count:0,approved_count:0,total_ok:0,total_ng:0,ng_rate:0,processes:[],process_summary:[],shift_summary:[],daily_summary:[],worker_performance:{actual_worker_hours:0,earned_standard_hours:0,efficiency_percent:0},machine_performance:{machine_count:0,machine_line_count:0,total_machine_hours:0,maximum_output:0,counted_output:0,total_ok:0,total_ng:0,efficiency_percent:0},machine_summary:[]};
const pad=(v:number)=>String(v).padStart(2,"0");
const today=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
const monthStart=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-01`;};
const num=(v:number)=>Number(v||0).toLocaleString("vi-VN",{maximumFractionDigits:1});
const pct=(v:number)=>`${Number(v||0).toLocaleString("vi-VN",{maximumFractionDigits:2)}%`;
const totalOf=(r:{ok:number;ng:number})=>Number(r.ok||0)+Number(r.ng||0);
const rateOf=(r:{ok:number;ng:number})=>{const t=totalOf(r);return t?Number(r.ok||0)/t*100:0;};
const dateLabel=(v:string)=>{const [y,m,d]=String(v).slice(0,10).split("-");return y&&m&&d?`${d}/${m}/${y}`:v;};

export default function Statistics(){
 const toast=useToast();
 const [from,setFrom]=useState(monthStart()),[to,setTo]=useState(today());
 const [draftFrom,setDraftFrom]=useState(monthStart()),[draftTo,setDraftTo]=useState(today());
 const [process,setProcess]=useState(""),[shift,setShift]=useState(""),[tab,setTab]=useState<TabKey>("day");
 const [summary,setSummary]=useState<Summary>(EMPTY),[loading,setLoading]=useState(true);
 const load=async()=>{setLoading(true);try{const r=await api.get("/dashboard/summary",{params:{from,to}});setSummary({...EMPTY,...(r.data?.data||{})});}catch(e:any){toast.showToast(e?.response?.data?.message||"Không thể tải thống kê","error");setSummary(EMPTY);}finally{setLoading(false);}};
 useEffect(()=>{void load();},[from,to]);
 const processOptions=summary.processes;
 const filteredProcessRows=useMemo(()=>summary.process_summary.filter(r=>!process||String(r.process_id)===process),[summary,process]);
 const filteredShiftRows=useMemo(()=>summary.shift_summary.filter(r=>!shift||r.shift===shift),[summary,shift]);
 const selectedProcessRow=process?summary.process_summary.find(r=>String(r.process_id)===process):null;
 const selectedShiftRow=shift?summary.shift_summary.find(r=>r.shift===shift):null;
 const filteredTotals=useMemo(()=>{
  if(selectedProcessRow)return {ok:selectedProcessRow.ok,ng:selectedProcessRow.ng,reports:selectedProcessRow.report_count};
  if(selectedShiftRow)return {ok:selectedShiftRow.ok,ng:selectedShiftRow.ng,reports:selectedShiftRow.report_count};
  return {ok:summary.total_ok,ng:summary.total_ng,reports:summary.approved_count+summary.pending_count};
 },[summary,selectedProcessRow,selectedShiftRow]);
 const total=filteredTotals.ok+filteredTotals.ng;
 const applyFilter=()=>{if(!draftFrom||!draftTo||draftFrom>draftTo){toast.showToast("Khoảng thời gian không hợp lệ","error");return;}setFrom(draftFrom);setTo(draftTo);};
 const reset=()=>{const a=monthStart(),b=today();setDraftFrom(a);setDraftTo(b);setFrom(a);setTo(b);setProcess("");setShift("");};
 const dayRows=useMemo(()=>summary.daily_summary.filter(r=>r.ok+r.ng>0).slice().reverse(),[summary]);
 return <main className="statistics-page manager-page">
  <header className="statistics-title"><div><h1>Thống kê báo cáo</h1><p>Thống kê tổng hợp tình hình sản xuất theo thời gian và công đoạn</p></div></header>
  <section className="statistics-filter-card">
   <label className="statistics-range-label"><span>Khoảng thời gian</span><div className="statistics-date-range"><CalendarDays size={16}/><input type="date" value={draftFrom} onChange={e=>setDraftFrom(e.target.value)}/><b>→</b><input type="date" value={draftTo} onChange={e=>setDraftTo(e.target.value)}/></div></label>
   <label><span>Từ ngày</span><input type="date" value={draftFrom} onChange={e=>setDraftFrom(e.target.value)}/></label>
   <label><span>Đến ngày</span><input type="date" value={draftTo} onChange={e=>setDraftTo(e.target.value)}/></label>
   <label><span>Công đoạn</span><select value={process} onChange={e=>setProcess(e.target.value)}><option value="">Tất cả</option>{processOptions.map(p=><option key={p.id} value={p.id}>{p.process_name}</option>)}</select></label>
   <label><span>Ca làm việc</span><select value={shift} onChange={e=>setShift(e.target.value)}><option value="">Tất cả</option>{summary.shift_summary.map(s=><option key={s.shift} value={s.shift}>{s.shift}</option>)}</select></label>
   <div className="statistics-filter-actions"><button className="statistics-filter-btn" onClick={applyFilter}><Filter size={15}/> Lọc dữ liệu</button><button className="statistics-reset-btn" onClick={reset}>Đặt lại</button></div>
  </section>
  {loading?<section className="statistics-loading"><div/><div/><div/><div/><div/></section>:<>
   <section className="statistics-kpis">
    <Kpi icon={<FileText/>} label="Tổng số báo cáo" value={num(filteredTotals.reports)} note="Báo cáo trong kỳ" kind="blue"/>
    <Kpi icon={<CheckCircle2/>} label="Tổng sản lượng OK" value={num(filteredTotals.ok)} note="Sản phẩm đạt" kind="green"/>
    <Kpi icon={<XCircle/>} label="Tổng sản lượng NG" value={num(filteredTotals.ng)} note="Sản phẩm lỗi" kind="red"/>
    <Kpi icon={<BarChart3/>} label="Tỷ lệ OK trung bình" value={pct(total?filteredTotals.ok/total*100:0)} note="Tỷ lệ chất lượng" kind="blue"/>
    <Kpi icon={<Clock3/>} label="Tổng giờ làm" value={num(summary.worker_performance.actual_worker_hours)} note="Giờ công thực tế" kind="orange"/>
   </section>
   <section className="statistics-card statistics-tabs-card"><div className="statistics-tabs">{([["day","Theo ngày"],["process","Theo công đoạn"],["shift","Theo ca làm việc"],["worker","Theo công nhân"],["machine","Theo máy móc"]] as [TabKey,string][]).map(([k,t])=><button key={k} className={tab===k?"active":""} onClick={()=>setTab(k)}>{t}</button>)}</div>
    {tab==="day"&&<DailyTable rows={dayRows}/>} {tab==="process"&&<ProcessTable rows={filteredProcessRows}/>} {tab==="shift"&&<ShiftTable rows={filteredShiftRows}/>} {tab==="worker"&&<WorkerTable summary={summary}/>} {tab==="machine"&&<MachineTable rows={summary.machine_summary}/>} 
    {tab==="day"&&<div className="statistics-footer"><span>Hiển thị {dayRows.length} ngày trong kỳ</span><span className="statistics-footer-note">Dữ liệu lấy từ báo cáo đã duyệt</span></div>}
   </section>
   <section className="statistics-bottom-grid"><article className="statistics-card stats-summary-card"><div className="stats-card-head"><div><span>CHẤT LƯỢNG</span><h2>Tổng quan chất lượng</h2></div></div><div className="stats-quality"><div className="stats-quality-donut" style={{background:`conic-gradient(#22a56b 0 ${total?filteredTotals.ok/total*100:0}%, #e84552 ${total?filteredTotals.ok/total*100:0}% 100%)`}}><strong>{pct(total?filteredTotals.ok/total*100:0)}</strong><small>OK</small></div><div className="stats-quality-list"><p><i className="green"/>OK <b>{num(filteredTotals.ok)}</b></p><p><i className="red"/>NG <b>{num(filteredTotals.ng)}</b></p><p><i className="blue"/>Tổng <b>{num(total)}</b></p></div></div></article><article className="statistics-card stats-summary-card"><div className="stats-card-head"><div><span>HIỆU SUẤT</span><h2>Hiệu suất máy móc</h2></div></div><div className="stats-metric-grid"><div><HardDrive/><b>{num(summary.machine_performance.machine_count)}</b><span>Máy hoạt động</span></div><div><Gauge/><b>{pct(summary.machine_performance.efficiency_percent)}</b><span>Hiệu suất máy</span></div><div><Clock3/><b>{num(summary.machine_performance.total_machine_hours)}</b><span>Giờ máy</span></div><div><BarChart3/><b>{num(summary.worker_performance.earned_standard_hours)}</b><span>Giờ chuẩn</span></div></div></article></section>
  </>}
 </main>;
}
function Kpi({icon,label,value,note,kind}:{icon:React.ReactNode;label:string;value:string;note:string;kind:string}){return <article className={`statistics-kpi ${kind}`}><div className="statistics-kpi-icon">{icon}</div><span>{label}</span><strong>{value}</strong><small>{note}</small></article>}
function DailyTable({rows}:{rows:Summary["daily_summary"]}){return <TableWrap><table><thead><tr><th>Ngày</th><th>Số báo cáo</th><th>Sản lượng OK</th><th>Sản lượng NG</th><th>Tổng sản lượng</th><th>Tỷ lệ OK</th><th>Giờ làm</th></tr></thead><tbody>{rows.length?rows.map(r=><tr key={r.work_date}><td className="date-link">{dateLabel(r.work_date)}</td><td>{num(r.report_count)}</td><td className="ok-cell">{num(r.ok)}</td><td className="ng-cell">{num(r.ng)}</td><td>{num(totalOf(r))}</td><td className="rate-cell">{pct(rateOf(r))}</td><td>—</td></tr>):<EmptyRow/>}</tbody>{rows.length>0&&<tfoot><tr><td>Tổng cộng</td><td>{num(rows.reduce((n,r)=>n+r.report_count,0))}</td><td>{num(rows.reduce((n,r)=>n+r.ok,0))}</td><td>{num(rows.reduce((n,r)=>n+r.ng,0))}</td><td>{num(rows.reduce((n,r)=>n+totalOf(r),0))}</td><td>{pct(rows.reduce((n,r)=>n+totalOf(r),0)?rows.reduce((n,r)=>n+r.ok,0)/rows.reduce((n,r)=>n+totalOf(r),0)*100:0)}</td><td>—</td></tr></tfoot>}</table></TableWrap>}
function ProcessTable({rows}:{rows:Summary["process_summary"]}){return <TableWrap><table><thead><tr><th>Công đoạn</th><th>Số báo cáo</th><th>OK</th><th>NG</th><th>Tổng sản lượng</th><th>Tỷ lệ OK</th></tr></thead><tbody>{rows.length?rows.map(r=><tr key={r.process_id}><td className="strong-cell">{r.process_name}</td><td>{num(r.report_count)}</td><td className="ok-cell">{num(r.ok)}</td><td className="ng-cell">{num(r.ng)}</td><td>{num(totalOf(r))}</td><td className="rate-cell">{pct(rateOf(r))}</td></tr>):<EmptyRow/>}</tbody></table></TableWrap>}
function ShiftTable({rows}:{rows:Summary["shift_summary"]}){return <TableWrap><table><thead><tr><th>Ca làm việc</th><th>Số báo cáo</th><th>OK</th><th>NG</th><th>Tổng sản lượng</th><th>Tỷ lệ OK</th></tr></thead><tbody>{rows.length?rows.map(r=><tr key={r.shift}><td className="strong-cell">{r.shift}</td><td>{num(r.report_count)}</td><td className="ok-cell">{num(r.ok)}</td><td className="ng-cell">{num(r.ng)}</td><td>{num(totalOf(r))}</td><td className="rate-cell">{pct(rateOf(r))}</td></tr>):<EmptyRow/>}</tbody></table></TableWrap>}
function WorkerTable({summary}:{summary:Summary}){return <div className="worker-stat-panel"><div className="worker-stat-hero"><UsersIcon/><div><strong>Hiệu suất tổng hợp công nhân</strong><span>Tổng hợp theo kỳ đã chọn</span></div></div><div className="worker-stat-grid"><div><b>{num(summary.worker_performance.actual_worker_hours)}</b><span>Giờ công thực tế</span></div><div><b>{num(summary.worker_performance.earned_standard_hours)}</b><span>Giờ chuẩn đạt được</span></div><div><b>{pct(summary.worker_performance.efficiency_percent)}</b><span>Hiệu suất công nhân</span></div><div><b>{num(summary.approved_count)}</b><span>Báo cáo đã duyệt</span></div></div></div>}
function UsersIcon(){return <span className="worker-stat-icon">👥</span>}
function MachineTable({rows}:{rows:Summary["machine_summary"]}){return <TableWrap><table><thead><tr><th>Máy móc</th><th>Số lần chạy</th><th>Giờ máy</th><th>Sản lượng</th><th>OK</th><th>NG</th><th>Hiệu suất</th></tr></thead><tbody>{rows.length?rows.map(r=><tr key={r.machine_id}><td className="strong-cell">{r.machine_code||`Máy ${r.machine_id}`}</td><td>{num(r.run_count)}</td><td>{num(r.machine_hours)}</td><td>{num(r.counted_output)}</td><td className="ok-cell">{num(r.ok)}</td><td className="ng-cell">{num(r.ng)}</td><td className="rate-cell">{pct(r.efficiency_percent)}</td></tr>):<EmptyRow/>}</tbody></table></TableWrap>}
function TableWrap({children}:{children:React.ReactNode}){return <div className="statistics-table-wrap">{children}</div>}
function EmptyRow(){return <tr><td colSpan={8} className="statistics-empty">Chưa có dữ liệu trong khoảng thời gian này</td></tr>}
