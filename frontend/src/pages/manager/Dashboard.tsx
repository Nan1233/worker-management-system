import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, BarChart3, CheckCircle2, ClipboardCheck, Clock3, Layers3, PackageCheck, RefreshCw, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { getApiError } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";
import "./Dashboard.css";

type PeriodKey="today"|"yesterday"|"last7"|"thisMonth"|"lastMonth";
type DashboardSummary={
 pending_count:number;approved_count:number;total_ok:number;total_ng:number;
 daily_summary?:{work_date:string;report_count:number;ok:number;ng:number}[];
 worker_performance?:{actual_worker_hours:number};
};
type PendingReport={id:number;work_date?:string;worker_name?:string;worker_code?:string;process_name?:string;actual_output?:number;tt_ok?:number;tt_ng?:number};
const PERIOD_LABELS:Record<PeriodKey,string>={today:"Hôm nay",yesterday:"Hôm qua",last7:"7 ngày gần nhất",thisMonth:"Tháng này",lastMonth:"Tháng trước"};
const EMPTY:DashboardSummary={pending_count:0,approved_count:0,total_ok:0,total_ng:0};
const fmt=(n:number)=>Number(n||0).toLocaleString("vi-VN",{maximumFractionDigits:1});
function localDate(d:Date){const o=d.getTimezoneOffset();return new Date(d.getTime()-o*60000).toISOString().slice(0,10)}
function rangeFor(p:PeriodKey){const now=new Date(),s=new Date(now),e=new Date(now);if(p==="yesterday"){s.setDate(s.getDate()-1);e.setDate(e.getDate()-1)}else if(p==="last7")s.setDate(s.getDate()-6);else if(p==="thisMonth")s.setDate(1);else if(p==="lastMonth"){s.setMonth(s.getMonth()-1,1);e.setDate(0)}return{from:localDate(s),to:localDate(e)}}
function dateText(v?:string){if(!v)return"—";const d=new Date(v);return Number.isNaN(d.getTime())?v:d.toLocaleDateString("vi-VN",{day:"2-digit",month:"2-digit"})}
function timeText(hours:number){if(!hours)return"—";return `${Math.floor(hours).toString().padStart(2,"0")}:${Math.round((hours%1)*60).toString().padStart(2,"0")}`}

export default function Dashboard(){
 const navigate=useNavigate(),user=useMemo(()=>getStoredUser(),[]);
 const basePath=user?.role==="admin"?"/admin":user?.role==="admin_ops"?"/admin-ops":user?.role==="lead"?"/lead":"/manager";
 const name=user?.full_name||user?.username||"Quản lý";
 const [period,setPeriod]=useState<PeriodKey>("today"),[summary,setSummary]=useState<DashboardSummary>(EMPTY),[pending,setPending]=useState<PendingReport[]>([]);
 const [loading,setLoading]=useState(true),[summaryError,setSummaryError]=useState<string|null>(null),[pendingError,setPendingError]=useState(false),[retryKey,setRetryKey]=useState(0);
 useEffect(()=>{
  const controller=new AbortController(),range=rangeFor(period);let settled=false;
  setLoading(true);setSummaryError(null);setPendingError(false);setPending([]);
  const guard=window.setTimeout(()=>{if(settled||controller.signal.aborted)return;settled=true;controller.abort();setSummaryError("Máy chủ phản hồi quá lâu. Vui lòng thử tải lại.");setLoading(false)},20000);
  void api.get("/dashboard/summary",{params:range,signal:controller.signal}).then(r=>{if(!controller.signal.aborted)setSummary({...EMPTY,...(r.data?.data||{})})}).catch(e=>{if(!controller.signal.aborted)setSummaryError(getApiError(e,"Không thể tải dữ liệu tổng quan").message)}).finally(()=>{if(!controller.signal.aborted){settled=true;window.clearTimeout(guard);setLoading(false)}});
  void api.get("/production-temp/pending",{params:{date_from:range.from,date_to:range.to,page:1,page_size:5,include_meta:1},signal:controller.signal}).then(r=>{if(controller.signal.aborted)return;const list=Array.isArray(r.data?.data)?r.data.data:Array.isArray(r.data)?r.data:[];setPending(list.slice(0,5))}).catch(()=>{if(!controller.signal.aborted)setPendingError(true)});
  return()=>{window.clearTimeout(guard);controller.abort()};
 },[period,retryKey]);
 const daily=useMemo(()=>summary.daily_summary||[],[summary]);
 const maxDaily=Math.max(1,...daily.map(d=>Number(d.ok||0)+Number(d.ng||0)));
 const total=Number(summary.total_ok||0)+Number(summary.total_ng||0);
 const hours=Number(summary.worker_performance?.actual_worker_hours||0);
 const days= daily.slice(-10);
 if(loading)return <main className="manager-dashboard dashboard-loading" aria-busy="true" aria-label="Đang tải dữ liệu tổng quan"><div className="dashboard-loading-heading"/><div className="dashboard-loading-body"/></main>;
 if(summaryError)return <main className="manager-dashboard dashboard-error-state"><section role="alert" className="dashboard-error-card"><span className="dashboard-error-icon"><AlertTriangle size={22}/></span><div><h1>Không thể tải dữ liệu tổng quan</h1><p>{summaryError}</p><small>Vui lòng kiểm tra kết nối hoặc phiên đăng nhập.</small></div><button type="button" onClick={()=>{setLoading(true);setRetryKey(v=>v+1)}}>Thử tải lại</button></section></main>;
 return <main className="manager-dashboard manager-dashboard-compact">
  <section className="dashboard-welcome"><div><h1>Chào bạn, {name}!</h1><p>Chúc bạn một ngày làm việc hiệu quả.</p><div className="dashboard-tags"><span>KTC-{user?.worker_code||user?.username||"—"}</span><span>Vai trò: {user?.role==="admin_ops"?"Admin vận hành":user?.role==="lead"?"Lead":user?.role==="manager"?"Manager":"Admin"}</span></div></div></section>
  <div className="dashboard-period-context"><span>Phạm vi dữ liệu</span><strong>{PERIOD_LABELS[period]}</strong><select aria-label="Chọn khoảng thời gian" value={period} onChange={e=>setPeriod(e.target.value as PeriodKey)}>{Object.entries(PERIOD_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
  <section className="dashboard-kpi-row dashboard-kpi-row-compact">
   <article className="dashboard-kpi-card"><span><PackageCheck size={18}/></span><div><small>Sản lượng OK</small><strong>{fmt(summary.total_ok)}</strong></div></article>
   <article className="dashboard-kpi-card"><span><AlertTriangle size={18}/></span><div><small>Sản lượng NG</small><strong>{fmt(summary.total_ng)}</strong></div></article>
   <article className="dashboard-kpi-card"><span><Clock3 size={18}/></span><div><small>Tổng giờ công</small><strong>{fmt(hours)} <em>giờ</em></strong></div></article>
   <article className="dashboard-kpi-card"><span><ClipboardCheck size={18}/></span><div><small>Chờ duyệt</small><strong>{fmt(summary.pending_count)}</strong></div></article>
  </section>
  <section className="dashboard-compact-main">
   <article className="dashboard-panel dashboard-daily-panel">
    <div className="dashboard-panel-title"><div><span>SẢN XUẤT</span><h2>Sản lượng OK / NG theo ngày</h2></div><span className="dashboard-chart-period">{PERIOD_LABELS[period]}</span></div>
    <div className="dashboard-daily-legend"><span><i className="daily-ok-dot"/>OK</span><span><i className="daily-ng-dot"/>NG</span></div>
    {days.length?<div className="dashboard-daily-chart">{days.map(d=>{const ok=Number(d.ok||0),ng=Number(d.ng||0),value=ok+ng;return <div className="dashboard-daily-column" key={d.work_date} title={`${dateText(d.work_date)} · OK ${fmt(ok)} · NG ${fmt(ng)}`}><strong>{fmt(value)}</strong><div className="dashboard-daily-stack"><i className="daily-ok-bar" style={{height:`${ok/maxDaily*100}%`}}/><i className="daily-ng-bar" style={{height:`${ng/maxDaily*100}%`}}/></div><label>{dateText(d.work_date)}</label></div>})}</div>:<div className="dashboard-compact-empty"><BarChart3 size={24}/><strong>Chưa có dữ liệu sản lượng</strong><span>Không có báo cáo sản xuất trong khoảng thời gian đã chọn.</span></div>}
    <div className="dashboard-daily-summary"><span>Tổng sản lượng: <b>{fmt(total)}</b></span><span>Tỷ lệ NG: <b>{total?((Number(summary.total_ng||0)/total)*100).toLocaleString("vi-VN",{maximumFractionDigits:1}):"0"}%</b></span></div>
   </article>
   <article className="dashboard-panel dashboard-focus-panel">
    <div className="dashboard-panel-title"><div><span>QUẢN LÝ SẢN XUẤT</span><h2>Công việc cần chú ý</h2></div></div>
    <button className="dashboard-focus-row" type="button" onClick={()=>navigate(`${basePath}/reports`)}><span className="dashboard-focus-icon"><ClipboardCheck size={18}/></span><span><strong>Báo cáo chờ duyệt</strong><small>Các báo cáo cần kiểm tra và xử lý</small></span><b>{fmt(summary.pending_count)}</b><ArrowUpRight size={16}/></button>
    <button className="dashboard-focus-row" type="button" onClick={()=>navigate(`${basePath}/edit-proposals`)}><span className="dashboard-focus-icon"><RefreshCw size={18}/></span><span><strong>Yêu cầu chỉnh sửa</strong><small>Kiểm tra đề xuất thay đổi báo cáo</small></span><ArrowUpRight size={16}/></button>
    <button className="dashboard-process-entry" type="button" onClick={()=>navigate(`${basePath}/processes`)}><span className="dashboard-process-entry-icon"><Layers3 size={20}/></span><span><strong>Theo dõi công đoạn</strong><small>Chọn công đoạn để xem tình hình chi tiết</small></span><ArrowUpRight size={18}/></button>
   </article>
  </section>
  <section className="dashboard-panel pending-table-panel dashboard-pending-compact">
   <div className="dashboard-panel-title"><div><span>CẦN XỬ LÝ</span><h2>Báo cáo chờ duyệt gần đây</h2></div><button type="button" onClick={()=>navigate(`${basePath}/reports`)}>Xem tất cả <ArrowUpRight size={14}/></button></div>
   {pendingError?<div className="dashboard-table-state">Không thể tải danh sách báo cáo chờ duyệt.</div>:<div className="pending-table-wrap"><table><thead><tr><th>Ngày</th><th>Công nhân</th><th>Công đoạn</th><th>Sản lượng</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{pending.length?pending.map(r=><tr key={r.id}><td>{dateText(r.work_date)}</td><td>{r.worker_name||r.worker_code||"—"}</td><td>{r.process_name||"—"}</td><td>{fmt(Number(r.actual_output??r.tt_ok??0)+Number(r.tt_ng||0))}</td><td><span className="pending-status">Chờ duyệt</span></td><td><button className="view-btn" type="button" onClick={()=>navigate(`${basePath}/reports`)}>Xem</button></td></tr>):<tr><td colSpan={6} className="table-empty">Không có báo cáo chờ duyệt</td></tr>}</tbody></table></div>}
  </section>
  <div className="dashboard-data-footnote"><CheckCircle2 size={14}/> Dữ liệu tổng hợp theo phạm vi quyền được cấp. {fmt(summary.approved_count)} báo cáo đã duyệt trong kỳ.</div>
 </main>;
}
