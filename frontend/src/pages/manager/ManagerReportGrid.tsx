import { useEffect, useRef, useState } from "react";
import { detectIncompleteMachineData } from "../../utils/machineLinesIntegrity";
import axios from "axios";
import { createApprovedReportFromExcel, deleteReport, getApprovedReports, getReportById, invalidateManagerReportCaches, updateReport } from "../../services/productionService";
import { getCachedDefects, getCachedDeductions } from "../../services/masterDataCache";
import { getAllWorkers } from "../../services/workerService";
import { normalizeDefectOptions, normalizeDeductionOptions, type WorkerMasterOption } from "../worker/processMasterDataNormalization";
import type { ProductionDeduction, ProductionDefect, ProductionReport } from "../../types/production";
import { useToast } from "../../components/feedback/toastContext";
import { getToday } from "./managerReportDateLogic";
import { getCanonicalProcessId } from "../../utils/processAccess";
import "./ManagerExcelReports.css";

type Preset = "today" | "yesterday" | "week" | "last-week" | "month" | "last-month" | "custom";
type ProcessTab = { label: string; processId: number; processCode: string };
const PROCESSES: ProcessTab[] = [
  { label: "CÁN", processId: 8, processCode: "CAN" }, { label: "ÉP", processId: 7, processCode: "EP" },
  { label: "XLBV", processId: 6, processCode: "XLBV" }, { label: "Cắt lồng", processId: 1, processCode: "GC" },
  { label: "TT Mài", processId: 2, processCode: "MAI" }, { label: "TT Đo", processId: 3, processCode: "DO" },
  { label: "TT Kiểm 1", processId: 4, processCode: "K1" }, { label: "TT Kiểm 2", processId: 5, processCode: "K2" },
  { label: "Sản xuất 3", processId: 9, processCode: "SX3" },
];
const n=(v:unknown)=>Number(v||0),fmt=(v:unknown)=>n(v).toLocaleString("vi-VN",{maximumFractionDigits:2}),pct=(v:unknown)=>`${fmt(v)}%`,txt=(v:unknown)=>v===undefined||v===null||v===""?"—":String(v);
const dateFmt=(v?:string)=>{if(!v)return "—";const s=String(v).trim();if(/^\d{2}\/\d{2}\/\d{4}$/.test(s))return s;const m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}/${m[2]}/${m[1]}`:"—"};
const dateInputValue=(v:unknown)=>{if(v===undefined||v===null||v==="")return "";const s=String(v).trim();if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(m)return `${m[3]}-${m[2]}-${m[1]}`;const isoMatch=s.match(/^(\d{4})-(\d{2})-(\d{2})[T\s]/);if(isoMatch)return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;return ""};
const parse=(v:string)=>{const [y,m,d]=v.split("-").map(Number);return new Date(y,(m||1)-1,d||1)},iso=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`,ms=(d:Date)=>new Date(d.getFullYear(),d.getMonth(),1),me=(d:Date)=>new Date(d.getFullYear(),d.getMonth()+1,0);
const ws=(d:Date)=>{const x=new Date(d),day=x.getDay();x.setDate(x.getDate()+(day===0?-6:1-day));return x},we=(d:Date)=>{const x=ws(d);x.setDate(x.getDate()+6);return x};
const initial=()=>{const d=parse(getToday());return{from:iso(ms(d)),to:iso(me(d))}};
function findDeduction(r:ProductionReport,o:WorkerMasterOption){return(r.deductions||[]).find(x=>(o.deduction_type_id&&x.deduction_type_id===o.deduction_type_id)||(o.deduction_code&&x.deduction_code===o.deduction_code)||x.deduction_name.trim().toUpperCase()===o.label.trim().toUpperCase())}
function findDefect(r:ProductionReport,o:WorkerMasterOption){return(r.defects||[]).find(x=>(o.defect_type_id&&x.defect_type_id===o.defect_type_id)||(o.defect_code&&x.defect_code===o.code)||x.defect_name.trim().toUpperCase()===o.label.trim().toUpperCase())}
function putDeduction(r:ProductionReport,o:WorkerMasterOption,v:number):ProductionDeduction[]{const a=[...(r.deductions||[])],i=a.findIndex(x=>(o.deduction_type_id&&x.deduction_type_id===o.deduction_type_id)||(o.deduction_code&&x.deduction_code===o.deduction_code)||x.deduction_name.trim().toUpperCase()===o.label.trim().toUpperCase()),x:ProductionDeduction={id:i>=0?a[i].id:undefined,deduction_type_id:o.deduction_type_id,deduction_code:o.deduction_code||o.code,deduction_name:o.label,hours:Math.max(0,v)};if(i>=0)a[i]=x;else if(v>0)a.push(x);return a}
function putDefect(r:ProductionReport,o:WorkerMasterOption,v:number):ProductionDefect[]{const a=[...(r.defects||[])],i=a.findIndex(x=>(o.defect_type_id&&x.defect_type_id===o.defect_type_id)||(o.defect_code&&x.defect_code===o.code)||x.defect_name.trim().toUpperCase()===o.label.trim().toUpperCase()),x:ProductionDefect={id:i>=0?a[i].id:undefined,defect_type_id:o.defect_type_id,defect_code:o.defect_code||o.code,defect_name:o.label,quantity:Math.max(0,Math.round(v))};if(i>=0)a[i]=x;else if(v>0)a.push(x);return a}
export default function ManagerReportGrid(){
 const{showToast}=useToast(),init=initial();
 const[process,setProcess]=useState<ProcessTab>(PROCESSES[0]),[from,setFrom]=useState(init.from),[to,setTo]=useState(init.to),[preset,setPreset]=useState<Preset>("month"),[search,setSearch]=useState(""),[page,setPage]=useState(1),[total,setTotal]=useState(0),[rows,setRows]=useState<ProductionReport[]>([]),[drafts,setDrafts]=useState<Record<number,ProductionReport>>({}),[editing,setEditing]=useState<number|null>(null),[selectedId,setSelectedId]=useState<number|null>(null),[dirty,setDirty]=useState(false),[unsavedPrompt,setUnsavedPrompt]=useState(false),[pendingAction,setPendingAction]=useState<(() => void)|null>(null),[saving,setSaving]=useState(false),[loading,setLoading]=useState(true),[processId,setProcessId]=useState<number|null>(PROCESSES[0].processId),[deductions,setDeductions]=useState<WorkerMasterOption[]>([]),[defects,setDefects]=useState<WorkerMasterOption[]>([]),[workerDirectory,setWorkerDirectory]=useState<Record<string,{worker_id:number;full_name:string}>>({});
 const pageSize=20;
 const requestSeqRef=useRef(0);
 const [loadError,setLoadError]=useState("");
 const [searchDraft,setSearchDraft]=useState("");
 const [actionMessage,setActionMessage]=useState("");
 const lastPage=Math.max(1,Math.ceil(total/pageSize));
 const canEdit=!loading&&!saving;
 const goPage=(target:number)=>requestLeave(()=>setPage(Math.max(1,Math.min(lastPage,target))));
 const apply=(p:Preset)=>{const d=parse(getToday());let a:Date,b:Date;if(p==="today"){a=new Date(d);b=new Date(d)}else if(p==="yesterday"){a=new Date(d);a.setDate(a.getDate()-1);b=new Date(a)}else if(p==="week"){a=ws(d);b=we(d)}else if(p==="last-week"){b=ws(d);b.setDate(b.getDate()-1);a=new Date(b);a.setDate(a.getDate()-6)}else if(p==="month"){a=ms(d);b=me(d)}else if(p==="last-month"){a=new Date(d.getFullYear(),d.getMonth()-1,1);b=new Date(d.getFullYear(),d.getMonth(),0)}else{setPreset("custom");return}setPreset(p);setFrom(iso(a));setTo(iso(b));setPage(1)};
 const load=async(forceRefresh=false)=>{
  const sequence=++requestSeqRef.current;
  try{
   setLoading(true);setLoadError("");
   if(forceRefresh)invalidateManagerReportCaches();
   if(!from||!to||from>to){setLoadError("Khoảng ngày không hợp lệ. Vui lòng chọn lại từ ngày và đến ngày.");return}
   const res=await getApprovedReports({dateFrom:from,dateTo:to,processId:getCanonicalProcessId(process.processId,process.processCode),search:search.trim()||undefined,page,pageSize});
   if(requestSeqRef.current!==sequence)return;
   const last=Math.max(1,Number(res.pagination?.total_pages||1));
   setTotal(Number(res.pagination?.total??res.data?.length??0));
   if(page>last){setPage(last);return}
   const list=res.data||[];
   const full=await Promise.all(list.map(async x=>{try{return await getReportById(Number(x.id),"approved")}catch{return {...x,detail_load_failed:true} as ProductionReport}}));
   if(requestSeqRef.current===sequence)setRows(full);
  }catch(e){
   if(requestSeqRef.current===sequence){
    const message=axios.isAxiosError(e)?e.response?.data?.message||"Không thể tải báo cáo đã duyệt":"Không thể tải báo cáo đã duyệt";
    setLoadError(message);
    showToast(message,"error");
   }
  }finally{if(requestSeqRef.current===sequence)setLoading(false)}
 };
 useEffect(()=>{void load();return()=>{requestSeqRef.current+=1}},[process,from,to,search,page]);
 useEffect(()=>{void getAllWorkers().then(list=>setWorkerDirectory(Object.fromEntries(list.map(w=>[String(w.worker_code||"").trim(),{worker_id:Number(w.worker_id),full_name:String(w.full_name||"")}]).filter(([code])=>Boolean(code))))).catch(()=>{})},[]);
 useEffect(()=>{setPage(1);if(!dirty){setEditing(null);setSelectedId(null);setDrafts({});}setProcessId(process.processId)},[process,from,to,search]);
 useEffect(()=>{const before=(e:BeforeUnloadEvent)=>{if(!dirty)return;e.preventDefault();e.returnValue=""};addEventListener("beforeunload",before);return()=>removeEventListener("beforeunload",before)},[dirty]);
 useEffect(()=>{let alive=true;if(!processId){setDeductions([]);setDefects([]);return}Promise.all([getCachedDefects(processId),getCachedDeductions(processId)]).then(([a,b])=>{if(!alive)return;setDefects(normalizeDefectOptions(a,processId));setDeductions(normalizeDeductionOptions(b,processId))}).catch(()=>{if(alive){setDefects([]);setDeductions([])}});return()=>{alive=false}},[processId]);
 const row=(r:ProductionReport)=>drafts[Number(r.id)]||r,workerName=(r:ProductionReport)=>{const x=row(r),code=String((x as any).worker_code||"").trim();return workerDirectory[code]?.full_name||String((x as any).full_name||(x as any).worker_name||"").trim()||"—"},
 dsum=(r:ProductionReport)=>(r.deductions||[]).reduce((sum,item)=>sum+n(item.hours),0),
 ng=(r:ProductionReport)=>(r.defects||[]).length
  ?(r.defects||[]).reduce((sum,item)=>sum+n(item.quantity),0)
  :n(r.tt_ng),
dm=(r:ProductionReport)=>n((r as any).standard_output??(r as any).target_output),tt=(r:ProductionReport)=>n(r.actual_output),ok=(r:ProductionReport)=>n(r.tt_ok),ttdm=(r:ProductionReport)=>n((r as any).tt_dinh_muc)||dm(r)*n(r.actual_time),ns=(r:ProductionReport)=>n((r as any).nang_suat_percent)||(ttdm(r)>0?tt(r)/ttdm(r)*100:0),dat=(r:ProductionReport)=>tt(r)>0?ok(r)/tt(r)*100:0,pp=(r:ProductionReport)=>n((r as any).pp_percent)||(tt(r)>0?ng(r)/tt(r)*100:0);
 const edit=(r:ProductionReport)=>{
  const id=Number(r.id);
  if(loading||saving)return;
  if(dirty&&editing!==null&&editing!==id){
   setActionMessage("Dòng hiện tại còn thay đổi chưa lưu. Hãy Lưu hoặc Hủy trước khi chọn báo cáo khác.");
   return;
  }
  setActionMessage("");
  setSelectedId(id);setDrafts(p=>p[id]?p:{...p,[id]:{...r,deductions:[...(r.deductions||[])],defects:[...(r.defects||[])]}});setEditing(id)};
 const selectRow=(r:ProductionReport)=>{const id=Number(r.id);if(editing===id||saving||loading)return;edit(r)};
 const field=(id:number,k:keyof ProductionReport,v:string|number)=>{setDirty(true);setDrafts(p=>{const current=p[id]||rows.find(x=>Number(x.id)===id);if(!current)return p;const next={...current,[k]:v} as ProductionReport;if(k==="worker_code"){const info=workerDirectory[String(v||"").trim()];if(info){(next as any).worker_id=info.worker_id;(next as any).full_name=info.full_name;}}return{...p,[id]:next}})};
 const save=async(r:ProductionReport)=>{const id=Number(r.id),d=drafts[id];if(!d||saving||loading)return;
  const validNumber=(value:unknown)=>Number.isFinite(Number(value))&&Number(value)>=0;
  if(![d.actual_time,d.actual_output,d.tt_ok].every(validNumber)||!Number.isSafeInteger(Number(d.tt_ok))||!Number.isSafeInteger(ng(d))||
     (d.deductions||[]).some(x=>!validNumber(x.hours))||
     (d.defects||[]).some(x=>!validNumber(x.quantity)||!Number.isSafeInteger(Number(x.quantity)))){
   showToast("Giờ làm, OK, NG và các mục trừ giờ phải là số không âm hợp lệ.","error");return;
  }if(id<0){try{setSaving(true);await createApprovedReportFromExcel({...d,id:undefined,process_code:process.processCode,worker_code:String(d.worker_code||''),work_date:String(d.work_date||''),operation_mode:d.operation_mode||'MANUAL',operation_type:d.operation_type||undefined});showToast("Đã thêm báo cáo","success");setEditing(null);setSelectedId(null);setDirty(false);setDrafts({});invalidateManagerReportCaches();await load()}catch(e){showToast(axios.isAxiosError(e)?e.response?.data?.message||"Không thể thêm báo cáo":(e as Error).message||"Không thể thêm báo cáo")}finally{setSaving(false)}return}if((d as ProductionReport&{detail_load_failed?:boolean}).detail_load_failed||(r as ProductionReport&{detail_load_failed?:boolean}).detail_load_failed){showToast("Chưa tải được chi tiết báo cáo (lỗi, máy, trừ giờ) nên không thể lưu. Vui lòng tải lại trang.");return}const incompleteMachine=detectIncompleteMachineData(d as never);if(incompleteMachine){showToast(incompleteMachine);return}const totalHours=n(d.actual_time)+dsum(d);if(totalHours>12){showToast("Tổng giờ không được vượt quá 12 giờ");return}const payload:ProductionReport={...d,actual_time:n(d.actual_time),deduction_time:dsum(d),total_time:totalHours,actual_output:n(d.actual_output),tt_ok:n(d.tt_ok),tt_ng:ng(d),deductions:(d.deductions||[]).filter(x=>n(x.hours)>0),defects:(d.defects||[]).filter(x=>n(x.quantity)>0)};try{setSaving(true);await updateReport(id,payload,"approved",d.updated_at||null);showToast("Đã cập nhật báo cáo","success");setEditing(null);setSelectedId(null);setDirty(false);setDrafts(p=>{const x={...p};delete x[id];return x});invalidateManagerReportCaches();await load()}catch(e){showToast(axios.isAxiosError(e)?e.response?.data?.message||"Không thể cập nhật báo cáo":"Không thể cập nhật báo cáo")}finally{setSaving(false)}};
 const cancel=(id:number)=>{setEditing(null);setSelectedId(null);setDrafts(p=>{const x={...p};delete x[id];setDirty(Object.keys(x).length>0);return x})};
 const excelKey=(id:number)=>(e:React.KeyboardEvent<HTMLInputElement>)=>{if(e.key==='Escape'){e.preventDefault();cancel(id);return}if(e.key==='Enter'||(e.ctrlKey&&e.key.toLowerCase()==='s')){e.preventDefault();const r=rows.find(x=>Number(x.id)===id);if(r)void save(r)}};
 const toolbarAdd=()=>{if(editing!=null){showToast("Hãy lưu hoặc hủy dòng đang sửa trước");return}setActionMessage("Thêm báo cáo trực tiếp chưa khả dụng tại bảng này. Hãy dùng công cụ nhập Excel Desktop hoặc biểu mẫu tạo báo cáo.");};
 const toolbarCancel=()=>{if(editing!=null)cancel(editing)};
 const toolbarSave=async()=>{
  if(saving||loading)return;
  if(editing==null){showToast("Chưa chọn báo cáo để lưu");return}
  const current=rows.find(x=>Number(x.id)===editing);
  if(current)await save(current);
 };
 const toolbarDelete=async()=>{if(saving||loading||dirty||editing!==null)return;if(selectedId==null){showToast("Hãy chọn một dòng trước khi Xóa");return}if(dirty){showToast("Hãy lưu hoặc hủy thay đổi trước khi xóa báo cáo.");return}if(!confirm("Xóa báo cáo đã chọn?"))return;try{setSaving(true);await deleteReport(selectedId,"Quản lý xóa báo cáo đã duyệt");setEditing(null);setSelectedId(null);setDrafts(p=>{const x={...p};delete x[selectedId!];return x});setDirty(false);invalidateManagerReportCaches();showToast("Đã xóa báo cáo","success");await load()}catch(e){showToast(axios.isAxiosError(e)?e.response?.data?.message||"Không thể xóa báo cáo":"Không thể xóa báo cáo")}finally{setSaving(false)}};
 const requestLeave=(a:()=>void)=>{if(saving||loading)return;if(!dirty){a();return}setPendingAction(()=>a);setUnsavedPrompt(true)};
 const input=(r:ProductionReport,k:keyof ProductionReport,type="text")=>{const id=Number(r.id),v=(row(r) as any)[k]??"";return <input className="manager-excel-input" type={type} value={type==="date"?dateInputValue(v):v} onChange={e=>field(id,k,type==="number"?Number(e.target.value):type==="date"?e.target.value:e.target.value)} onKeyDown={excelKey(id)} onClick={e=>e.stopPropagation()} />};
 const cell=(r:ProductionReport,content:React.ReactNode,editor?:React.ReactNode,cls="")=>{const active=editing===Number(r.id);return <td className={`manager-excel-cell ${active?"is-active":""} ${cls}`} onClick={()=>selectRow(r)}>{active&&editor?editor:content}</td>};
 return <div className="manager-report-grid" onClick={()=>{}}>
  <div className="manager-excel-toolbar" aria-label="Thao tác báo cáo"><button type="button" onClick={toolbarAdd} disabled={!canEdit}>＋ Thêm</button><button type="button" onClick={()=>void toolbarSave()} disabled={!canEdit||!dirty||editing==null}>{saving?"Đang lưu...":"Lưu"}</button><button type="button" onClick={toolbarCancel} disabled={!canEdit||editing==null}>Hủy</button><button type="button" onClick={()=>void toolbarDelete()} disabled={!canEdit||selectedId==null||dirty}>Xóa</button></div>
  {actionMessage&&<div className="manager-grid-notice" role="status">{actionMessage}<button type="button" onClick={()=>setActionMessage("")} aria-label="Đóng thông báo">×</button></div>}
  <div className="manager-report-tabs">{PROCESSES.map(p=><button key={p.processId} className={process.processId===p.processId?"active":""} aria-pressed={process.processId===p.processId} disabled={saving} onClick={()=>requestLeave(()=>setProcess(p))}>{p.label}</button>)}</div>
  <div className="manager-report-filters" role="group" aria-label="Bộ lọc tất cả báo cáo">
   <label><span>Khoảng thời gian</span><select aria-label="Khoảng thời gian" value={preset} disabled={saving} onChange={e=>requestLeave(()=>apply(e.target.value as Preset))}><option value="today">Hôm nay</option><option value="yesterday">Hôm qua</option><option value="week">Tuần này</option><option value="last-week">Tuần trước</option><option value="month">Tháng này</option><option value="last-month">Tháng trước</option><option value="custom">Tùy chọn</option></select></label>
   <label><span>Từ ngày</span><input type="date" value={from} disabled={saving} onChange={e=>requestLeave(()=>{setPreset("custom");setFrom(e.target.value)})}/></label>
   <label><span>Đến ngày</span><input type="date" value={to} disabled={saving} onChange={e=>requestLeave(()=>{setPreset("custom");setTo(e.target.value)})}/></label>
   <label className="manager-report-search"><span>Tìm báo cáo</span><input type="search" value={searchDraft} disabled={saving} onChange={e=>setSearchDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")requestLeave(()=>{setSearch(searchDraft.trim());setPage(1)})}} placeholder="Mã CN, họ tên, sản phẩm..."/></label>
   <button type="button" disabled={saving} onClick={()=>requestLeave(()=>{setSearch(searchDraft.trim());setPage(1);if(search===searchDraft.trim())void load(true)})}>Lọc</button>
   <button type="button" disabled={saving||loading} onClick={()=>requestLeave(()=>void load(true))}>↻ Làm mới</button>
  </div>
  {loadError&&<div className="manager-grid-error" role="alert">{loadError}<button type="button" onClick={()=>void load(true)} disabled={loading}>Thử tải lại</button></div>}
  {dirty&&<div className="manager-grid-unsaved" role="status">Đang có thay đổi chưa lưu. Hãy lưu hoặc hủy trước khi đổi công đoạn, ngày hay trang.</div>}
  <div className="manager-excel-scroll" role="region" aria-label="Bảng báo cáo đã duyệt theo công đoạn, có thể cuộn ngang" tabIndex={0}><table><caption className="manager-grid-caption">Bảng dữ liệu báo cáo đã duyệt</caption><thead><tr><th>Ngày</th><th>Mã CN</th><th>Họ tên</th><th className="shift-col">Ca</th><th>Máy</th><th>Sản phẩm</th><th>% HV</th><th>TT giờ</th><th>Trừ giờ</th>{deductions.map(o=><th key={`d-${o.deduction_type_id||o.code}`}>{o.label}</th>)}<th>Tổng giờ</th><th>Định mức/h</th><th>TT định mức</th><th>TT OK</th><th>NG</th>{defects.map(o=><th key={`f-${o.defect_type_id||o.code}`}>{o.label}</th>)}<th>% năng suất</th><th>% đạt</th><th>% PP</th><th>Ghi chú</th></tr></thead><tbody>{loading?<tr><td colSpan={30} className="manager-grid-empty">Đang tải báo cáo...</td></tr>:loadError?<tr><td colSpan={30} className="manager-grid-empty">Không thể cập nhật danh sách. Vui lòng thử tải lại.</td></tr>:rows.length===0?<tr><td colSpan={30} className="manager-grid-empty">Không có báo cáo đã duyệt của công đoạn này.</td></tr>:rows.map(r=>{const x=row(r);return <tr key={r.id} data-manager-row-id={r.id} className={selectedId===Number(r.id)?"is-row-selected":""}>{cell(r,dateFmt(x.work_date),input(r,"work_date","date"))}{cell(r,txt(x.worker_code),input(r,"worker_code"))}<td className={`manager-excel-cell ${editing===Number(r.id)?"is-active":""}`} onClick={()=>selectRow(r)}>{workerName(r)}</td>{cell(r,txt(x.shift),input(r,"shift"),"shift-col")}{cell(r,txt(x.machine_no),input(r,"machine_no"))}{cell(r,txt(x.product_name),input(r,"product_name"))}{cell(r,pct((x as any).training_percent ?? (x as any).training_percent_snapshot ?? (x as any).hv_percent),input(r,"training_percent" as keyof ProductionReport,"number"))}{cell(r,fmt(x.actual_time),input(r,"actual_time","number"))}<td className="manager-excel-cell">{fmt(x.deduction_time)}</td>{deductions.map(o=>{const d=findDeduction(x,o);return <td key={`dv-${o.deduction_type_id||o.code}`} className="manager-excel-cell" onClick={()=>selectRow(r)}>{editing===Number(r.id)?<input className="manager-excel-input" type="number" value={d?.hours??0} onChange={e=>{setDirty(true);setDrafts(p=>({...p,[Number(r.id)]:{...p[Number(r.id)],deductions:putDeduction(p[Number(r.id)],o,Number(e.target.value))}}))}} onKeyDown={excelKey(Number(r.id))} onClick={e=>e.stopPropagation()}/>:fmt(d?.hours)}</td>})}{cell(r,fmt(n(x.actual_time)+dsum(x)))}{cell(r,fmt(dm(x)),input(r,"standard_output","number"))}{cell(r,fmt(ttdm(x)))}{cell(r,fmt(ok(x)),input(r,"tt_ok","number"))}<td className="manager-excel-cell">{fmt(ng(x))}</td>{defects.map(o=>{const d=findDefect(x,o);return <td key={`fv-${o.defect_type_id||o.code}`} className="manager-excel-cell" onClick={()=>selectRow(r)}>{editing===Number(r.id)?<input className="manager-excel-input" type="number" value={d?.quantity??0} onChange={e=>{setDirty(true);setDrafts(p=>({...p,[Number(r.id)]:{...p[Number(r.id)],defects:putDefect(p[Number(r.id)],o,Number(e.target.value))}}))}} onKeyDown={excelKey(Number(r.id))} onClick={e=>e.stopPropagation()}/>:fmt(d?.quantity)}</td>})}{cell(r,pct(ns(x)))}{cell(r,pct(dat(x)))}{cell(r,pct(pp(x)))}{cell(r,txt(x.notes),input(r,"notes"))}</tr>})}</tbody></table></div>
  <div className="manager-excel-footer" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
   <span>{total} báo cáo đã duyệt · Đang hiển thị {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} · Tổng giờ = TT giờ + các loại Trừ giờ · Tổng giờ tối đa 12h</span>
   <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <button type="button" onClick={() => goPage(page - 1)} disabled={loading || saving || page <= 1} style={{ padding: "6px 12px", border: "1px solid #cbd8e8", borderRadius: 7, background: page <= 1 ? "#f1f5f9" : "#fff", color: page <= 1 ? "#94a3b8" : "#244564", cursor: page <= 1 ? "not-allowed" : "pointer" }}>← Trang trước</button>
    <span style={{ color: "#526b88", fontSize: 12, whiteSpace: "nowrap" }}>Trang {page}/{Math.max(1, Math.ceil(total / pageSize))}</span>
    <button type="button" onClick={() => goPage(page + 1)} disabled={loading || saving || page >= Math.ceil(total / pageSize)} style={{ padding: "6px 12px", border: "1px solid #cbd8e8", borderRadius: 7, background: page >= Math.ceil(total / pageSize) ? "#f1f5f9" : "#fff", color: page >= Math.ceil(total / pageSize) ? "#94a3b8" : "#244564", cursor: page >= Math.ceil(total / pageSize) ? "not-allowed" : "pointer" }}>Trang sau →</button>
   </div>
  </div>
  {unsavedPrompt&&<div className="manager-excel-unsaved-overlay"><div className="manager-excel-unsaved"><h3>Bạn có thay đổi chưa lưu</h3><p>Chọn “Ở lại” để lưu dòng đang sửa, hoặc “Không lưu” để hủy thay đổi và tiếp tục.</p><button onClick={()=>{setUnsavedPrompt(false);setPendingAction(null);showToast("Hãy lưu dòng đang sửa bằng nút Lưu trước khi chuyển bộ lọc.");}}>Về dòng đang sửa</button><button onClick={()=>{const a=pendingAction;setPendingAction(null);setUnsavedPrompt(false);if(editing!=null)cancel(editing);a?.()}}>Không lưu</button><button onClick={()=>{setUnsavedPrompt(false);setPendingAction(null)}}>Ở lại</button></div></div>}
 </div>;
}