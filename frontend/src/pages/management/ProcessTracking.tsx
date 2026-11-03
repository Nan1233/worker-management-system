import { useEffect, useState } from "react";
import { ArrowRight, Layers3, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import "./ProcessTracking.css";

type Process = { id:number; process_code?:string; process_name:string; status?:string };
export default function ProcessTracking(){
 const [items,setItems]=useState<Process[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const navigate=useNavigate();
 const load=async()=>{setLoading(true);setError("");try{const now=new Date(),pad=(n:number)=>String(n).padStart(2,"0"),to=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`,from=to.slice(0,8)+"01";const response=await api.get("/dashboard/summary",{params:{from,to}});const rows=Array.isArray(response.data?.data?.processes)?response.data.data.processes:[];setItems(rows);}catch(e:any){setError(e?.response?.data?.message||"Không thể tải danh sách công đoạn.");}finally{setLoading(false);}};
 useEffect(()=>{void load();},[]);
 return <main className="process-tracking-page">
  <header className="process-tracking-heading"><div><span className="process-tracking-eyebrow">SẢN XUẤT</span><h1>Theo dõi công đoạn</h1><p>Chọn công đoạn được phân công để xem tình hình sản xuất chi tiết.</p></div><button className="process-tracking-refresh" type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/> Làm mới</button></header>
  {loading?<div className="process-tracking-state" role="status">Đang tải danh sách công đoạn…</div>:error?<div className="process-tracking-state error" role="alert">{error}<button type="button" onClick={()=>void load()}>Thử lại</button></div>:items.length===0?<div className="process-tracking-state">Tài khoản hiện chưa được phân công công đoạn nào.</div>:<section className="process-tracking-grid" aria-label="Danh sách công đoạn">{items.map(process=><button className="process-tracking-card" key={process.id} type="button" onClick={()=>navigate(String(process.id))}><span className="process-tracking-card-icon"><Layers3 size={21}/></span><span className="process-tracking-card-copy"><strong>{process.process_name}</strong><small>{process.process_code||"Công đoạn sản xuất"}</small></span><ArrowRight className="process-tracking-card-arrow" size={19}/></button>)}</section>}
 </main>;
}
