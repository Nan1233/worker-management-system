import { useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, RefreshCw, Upload } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../../services/api";
import { usePermissions } from "../../hooks/usePermissions";
import { getApiError } from "../../utils/apiError";

type Resource = "machines" | "standards" | "deductions" | "defects";
const labels:Record<Resource,string>={machines:"Máy móc",standards:"Sản phẩm",deductions:"Trừ giờ",defects:"Lỗi"};

export default function MasterDataTransferActions(){
 const location=useLocation(); const navigate=useNavigate(); const {can}=usePermissions();
 const inputRef=useRef<HTMLInputElement>(null); const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
 const resource=useMemo<Resource|null>(()=>{const match=location.pathname.match(/\/master\/(machines|standards|deductions|defects)(?:\/|$)/);return match?.[1] as Resource||null;},[location.pathname]);
 if(!resource||!can("MASTER_VIEW"))return null;
 const label=labels[resource];
 const exportData=async()=>{setBusy(true);setMessage("");try{const response=await api.get(`/admin/master/transfer/export/${resource}`,{responseType:"blob"});const blob=new Blob([response.data],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});const url=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=url;anchor.download=`KTC_${resource}_${new Date().toISOString().slice(0,10)}.xlsx`;document.body.appendChild(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);setMessage(`Đã tải dữ liệu ${label}.`);}catch(error){setMessage(getApiError(error,"Không thể tải dữ liệu").message);}finally{setBusy(false);}};
 const importData=()=>inputRef.current?.click();
 const onFile=async(file:File|null)=>{if(!file)return;if(!/\.xlsx$/i.test(file.name)){setMessage("Chỉ hỗ trợ file Excel .xlsx");return;}setBusy(true);setMessage("");try{const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||""));reader.onerror=()=>reject(reader.error||new Error("Không đọc được file"));reader.readAsDataURL(file);});const response=await api.post(`/admin/master/transfer/import/${resource}`,{file_base64:base64});setMessage(response.data?.message||`Đã nhập dữ liệu ${label}.`);window.setTimeout(()=>navigate(0),500);}catch(error){setMessage(getApiError(error,"Không thể nhập dữ liệu").message);}finally{setBusy(false);if(inputRef.current)inputRef.current.value="";}};
 return <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",padding:"11px 13px",background:"var(--ktc-surface)",border:"1px solid var(--ktc-border)",borderRadius:12,boxShadow:"0 3px 12px rgba(15,23,42,.04)"}}>
  <div style={{display:"flex",alignItems:"center",gap:9,minWidth:0}}><span style={{width:34,height:34,borderRadius:9,display:"grid",placeItems:"center",background:"#eff6ff",color:"#2563eb",flex:"0 0 auto"}}><FileSpreadsheet size={17}/></span><div style={{display:"grid",gap:2}}><strong style={{fontSize:12,color:"var(--ktc-ink-900)"}}>Dữ liệu {label}</strong><small style={{fontSize:10,color:"var(--ktc-ink-600)"}}>Database là nguồn chính · Excel chỉ dùng để tải về / nhập lại</small></div></div>
  <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>{message&&<span style={{fontSize:11,color:message.toLowerCase().includes("không")?"#b91c1c":"#15803d"}}>{message}</span>}<button type="button" disabled={busy} onClick={()=>void exportData()} style={{display:"inline-flex",alignItems:"center",gap:6,height:36,padding:"0 11px",border:"1px solid var(--ktc-border-strong)",borderRadius:8,background:"var(--ktc-surface)",color:"var(--ktc-ink-800)",fontWeight:700,cursor:"pointer"}}><Download size={15}/> Tải Excel</button>{can("MASTER_EDIT")&&<><button type="button" disabled={busy} onClick={importData} style={{display:"inline-flex",alignItems:"center",gap:6,height:36,padding:"0 11px",border:"1px solid var(--ktc-brand-600)",borderRadius:8,background:"var(--ktc-brand-600)",color:"#fff",fontWeight:700,cursor:"pointer"}}><Upload size={15}/> Nhập Excel</button><input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event=>void onFile(event.target.files?.[0]||null)} style={{display:"none"}/></>}{busy&&<RefreshCw size={15} style={{animation:"spin 1s linear infinite"}}/>}</div>
 </div>;
}
