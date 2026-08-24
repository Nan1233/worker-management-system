import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Download, Edit3, Filter, History, Plus, Search, Trash2, UserRound, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getActivities, getNotifications, markAllNotificationsRead, markNotificationRead, type ActivityItem, type NotificationItem } from "../../services/systemService";
import { publishNotificationCount } from "../../hooks/useNotificationBadge";
import { getStoredUser } from "../../utils/authStorage";
import { usePermissions } from "../../hooks/usePermissions";
import "./SystemCenter.css";

const actionLabel: Record<string,string> = {
  CREATE:"Thêm mới", CREATED:"Thêm mới", INSERT:"Thêm mới", ADD:"Thêm mới",
  UPDATE:"Cập nhật", UPDATED:"Cập nhật", EDIT:"Cập nhật",
  DELETE:"Xóa", DELETED:"Xóa", REMOVE:"Xóa",
  APPROVE:"Duyệt", APPROVED:"Duyệt", REJECT:"Từ chối", REJECTED:"Từ chối",
  LOGIN:"Đăng nhập", LOGOUT:"Đăng xuất"
};
const actionTone: Record<string,string> = { CREATE:"add",CREATED:"add",INSERT:"add",ADD:"add",UPDATE:"update",UPDATED:"update",EDIT:"update",DELETE:"delete",DELETED:"delete",REMOVE:"delete",APPROVE:"approve",APPROVED:"approve",REJECT:"reject",REJECTED:"reject",LOGIN:"login",LOGOUT:"logout" };
const entityLabel: Record<string,string> = { production_report:"Báo cáo sản xuất", report:"Báo cáo sản xuất", worker:"Công nhân", user:"Người dùng", machine:"Máy móc", product:"Sản phẩm", process:"Quy trình", formula_setting:"Công thức", deduction:"Trừ giờ", defect:"Lỗi", system:"Hệ thống" };
const roleLabel: Record<string,string> = { admin:"Quản trị viên", manager:"Quản lý", lead:"Tổ trưởng", worker:"Công nhân" };
const actionIcon = (action:string) => { const tone=actionTone[action]||"update"; if(tone==="add")return <Plus size={15}/>; if(tone==="delete")return <Trash2 size={15}/>; if(tone==="approve")return <CheckCircle2 size={15}/>; return <Edit3 size={15}/>; };
const dateText = (value:unknown) => value ? new Date(String(value)).toLocaleString("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}) : "—";

function valueText(value:unknown):string { if(value===null||value===undefined||value==="")return "—"; if(typeof value === "object") return JSON.stringify(value); return String(value); }
function ActivityDetail({item,onClose}:{item:ActivityItem;onClose:()=>void}) {
  const row=item as ActivityItem & Record<string,unknown>;
  let metadata:Record<string,unknown>={};
  try { const parsed=typeof row.metadata_json === "string" ? JSON.parse(row.metadata_json) : row.metadata_json; if(parsed&&typeof parsed === "object"&&!Array.isArray(parsed))metadata=parsed as Record<string,unknown>; } catch { /* ignore malformed metadata */ }
  return <div className="audit-modal-backdrop" onMouseDown={onClose}><aside className="audit-modal" onMouseDown={e=>e.stopPropagation()}><header><div><span>CHI TIẾT HOẠT ĐỘNG</span><h2>{row.description||actionLabel[row.action]||row.action}</h2></div><button type="button" onClick={onClose} aria-label="Đóng"><X size={19}/></button></header><div className="audit-detail-grid"><div><span>Thời gian</span><strong>{dateText(row.created_at)}</strong></div><div><span>Người thực hiện</span><strong>{valueText(row.full_name||row.username)}</strong></div><div><span>Vai trò</span><strong>{roleLabel[String(row.role||"")]||valueText(row.role)}</strong></div><div><span>Hành động</span><strong>{actionLabel[row.action]||row.action}</strong></div><div><span>Chức năng</span><strong>{entityLabel[String(row.entity_type||"")]||valueText(row.entity_type)}</strong></div><div><span>ID đối tượng</span><strong>{valueText(row.entity_id)}</strong></div><div><span>IP thiết bị</span><strong>{valueText(row.ip_address)}</strong></div><div><span>Nội dung</span><strong>{valueText(row.description)}</strong></div></div>{Object.keys(metadata).length>0&&<div className="audit-detail-meta"><h3>Dữ liệu chi tiết</h3>{Object.entries(metadata).map(([key,val])=><div key={key}><span>{key.replace(/_/g," ")}</span><strong>{valueText(val)}</strong></div>)}</div>}</aside></div>;
}

export default function SystemCenter() {
  const navigate=useNavigate();
  const currentUser=getStoredUser();
  const {can}=usePermissions();
  const isWorker=currentUser?.role==="worker";
  const canAudit=!isWorker&&can("AUDIT_VIEW");
  const [activities,setActivities]=useState<ActivityItem[]>([]);
  const [notifications,setNotifications]=useState<NotificationItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [action,setAction]=useState("");
  const [role,setRole]=useState("");
  const [entity,setEntity]=useState("");
  const [from,setFrom]=useState("");
  const [to,setTo]=useState("");
  const [page,setPage]=useState(1);
  const [selected,setSelected]=useState<ActivityItem|null>(null);
  const pageSize=10;

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try {
      const [activityResult,notificationResult]=await Promise.allSettled([
        canAudit ? getActivities({search,action,from,to,limit:150}) : Promise.resolve([] as ActivityItem[]),
        getNotifications()
      ]);
      if(activityResult.status==="fulfilled")setActivities(activityResult.value||[]); else setError("Không tải được nhật ký hoạt động.");
      if(notificationResult.status==="fulfilled"){setNotifications(notificationResult.value.data||[]);publishNotificationCount(notificationResult.value.unread||0);}
      setPage(1);
    } finally { setLoading(false); }
  },[canAudit,search,action,from,to]);
  useEffect(()=>{void load();},[load]);

  const roles=useMemo(()=>Array.from(new Set(activities.map(x=>String((x as any).role||"")).filter(Boolean))),[activities]);
  const entities=useMemo(()=>Array.from(new Set(activities.map(x=>String((x as any).entity_type||"")).filter(Boolean))),[activities]);
  const filtered=useMemo(()=>activities.filter(item=>{
    const row=item as ActivityItem & Record<string,unknown>;
    const text=`${row.full_name||""} ${row.username||""} ${row.description||""} ${row.action||""} ${row.entity_type||""}`.toLowerCase();
    return (!role||String(row.role||"")===role)&&(!entity||String(row.entity_type||"")===entity)&&text.includes(search.toLowerCase());
  }),[activities,role,entity,search]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
  const currentRows=filtered.slice((page-1)*pageSize,page*pageSize);
  const countBy=(names:string[])=>activities.filter(x=>names.includes(String(x.action||"").toUpperCase())).length;
  const exportCsv=()=>{const header=["Thời gian","Người dùng","Vai trò","Hành động","Chức năng","Nội dung","IP thiết bị"];const rows=filtered.map(x=>{const r=x as any;return [dateText(r.created_at),r.full_name||r.username||"",roleLabel[r.role]||r.role||"",actionLabel[r.action]||r.action||"",entityLabel[r.entity_type]||r.entity_type||"",r.description||"",r.ip_address||""];});const csv=[header,...rows].map(r=>r.map((v:string)=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`KTC_NhatKyHoatDong_${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);};
  const openNotification=async(item:NotificationItem)=>{if(!item.is_read){await markNotificationRead(item.id);setNotifications(v=>v.map(x=>x.id===item.id?{...x,is_read:1}:x));}if(item.link_url)navigate(item.link_url);};

  if(isWorker) return <section className="system-center"><header className="audit-page-header"><div><span className="audit-eyebrow">TRUNG TÂM THÔNG BÁO</span><h1>Thông báo của tôi</h1><p>Theo dõi trạng thái duyệt và phản hồi báo cáo.</p></div><button className="audit-secondary" onClick={async()=>{await markAllNotificationsRead();setNotifications(v=>v.map(x=>({...x,is_read:1})));publishNotificationCount(0);}}>Đánh dấu đã đọc</button></header><div className="audit-notification-list">{notifications.length?notifications.map(item=><button key={item.id} className={!item.is_read?"unread":""} onClick={()=>void openNotification(item)}><span className="audit-notification-dot"/><div><strong>{item.title}</strong><p>{item.message}</p><small>{dateText(item.created_at)}</small></div></button>):<div className="audit-empty">Chưa có thông báo</div>}</div></section>;

  return <section className="system-center audit-page">
    <header className="audit-page-header"><div><h1><History size={28}/> Nhật ký hoạt động</h1><p>Theo dõi các hoạt động trên hệ thống của quản lý và công nhân.</p></div></header>
    <section className="audit-filter-card"><div className="audit-filter-date"><CalendarDays size={16}/><input aria-label="Từ ngày" type="date" value={from} onChange={e=>{setFrom(e.target.value);setPage(1)}}/><span>–</span><input aria-label="Đến ngày" type="date" min={from||undefined} value={to} onChange={e=>{setTo(e.target.value);setPage(1)}}/><span className="audit-date-chevron">⌄</span></div><label className="audit-select"><select value={role} onChange={e=>{setRole(e.target.value);setPage(1)}}><option value="">Tất cả người dùng</option>{roles.map(x=><option key={x} value={x}>{roleLabel[x]||x}</option>)}</select></label><label className="audit-select"><select value={action} onChange={e=>{setAction(e.target.value);setPage(1)}}><option value="">Tất cả hành động</option>{Object.entries(actionLabel).filter(([k])=>k===k.toUpperCase()).slice(0,20).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label className="audit-select"><select value={entity} onChange={e=>{setEntity(e.target.value);setPage(1)}}><option value="">Tất cả chức năng</option>{entities.map(x=><option key={x} value={x}>{entityLabel[x]||x}</option>)}</select></label><label className="audit-search"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Tìm kiếm nội dung..."/><Search size={17}/></label><button className="audit-export" type="button" onClick={exportCsv}><Download size={16}/> Xuất Excel</button></section>
    <section className="audit-stat-grid"><article><span className="audit-stat-icon blue"><Activity size={22}/></span><div><small>Tổng hoạt động</small><strong>{filtered.length.toLocaleString("vi-VN")}</strong><em>Hoạt động</em></div></article><article><span className="audit-stat-icon green"><UserRound size={22}/></span><div><small>Người dùng</small><strong>{new Set(activities.map(x=>(x as any).user_id||(x as any).username||(x as any).full_name)).size}</strong><em>Đã thực hiện</em></div></article><article><span className="audit-stat-icon orange"><Plus size={22}/></span><div><small>Thêm mới</small><strong>{countBy(["CREATE","CREATED","INSERT","ADD"])}</strong><em>Hoạt động</em></div></article><article><span className="audit-stat-icon purple"><Edit3 size={22}/></span><div><small>Cập nhật</small><strong>{countBy(["UPDATE","UPDATED","EDIT"])}</strong><em>Hoạt động</em></div></article><article><span className="audit-stat-icon red"><Trash2 size={22}/></span><div><small>Xóa</small><strong>{countBy(["DELETE","DELETED","REMOVE"])}</strong><em>Hoạt động</em></div></article></section>
    {error&&<div className="audit-error">{error}<button onClick={()=>void load()}>Thử lại</button></div>}
    <section className="audit-table-card"><div className="audit-table-wrap"><table><thead><tr><th>Thời gian <span className="audit-sort">↕</span></th><th>Người dùng</th><th>Vai trò</th><th>Hành động</th><th>Chức năng</th><th>Nội dung</th><th>IP thiết bị</th><th></th></tr></thead><tbody>{loading?<tr><td colSpan={8} className="audit-empty">Đang tải nhật ký...</td></tr>:currentRows.length?currentRows.map(item=>{const row=item as ActivityItem & Record<string,unknown>;const act=String(row.action||"");return <tr key={String(row.id)}><td className="nowrap">{dateText(row.created_at)}</td><td><strong>{valueText(row.full_name||row.username)}</strong></td><td><span className={`audit-role ${String(row.role||"")}`}>{roleLabel[String(row.role||"")]||valueText(row.role)}</span></td><td><span className={`audit-action ${actionTone[act]||"update"}`}>{actionIcon(act)} {actionLabel[act]||act}</span></td><td>{entityLabel[String(row.entity_type||"")]||valueText(row.entity_type)}</td><td className="audit-content">{valueText(row.description)}</td><td className="nowrap">{valueText(row.ip_address)}</td><td><button className="audit-detail-btn" onClick={()=>setSelected(item)}>Chi tiết</button></td></tr>;}):<tr><td colSpan={8} className="audit-empty">Không có hoạt động phù hợp.</td></tr>}</tbody></table></div><footer className="audit-table-footer"><span>Hiển thị {filtered.length?((page-1)*pageSize+1):0} đến {Math.min(page*pageSize,filtered.length)} của {filtered.length.toLocaleString("vi-VN")} hoạt động</span><div><select value={pageSize} disabled><option>10 / trang</option></select><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={16}/></button>{Array.from({length:Math.min(totalPages,5)},(_,i)=>i+1).map(p=><button key={p} className={p===page?"active":""} onClick={()=>setPage(p)}>{p}</button>)}{totalPages>5&&<span>…</span>}<button disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}><ChevronRight size={16}/></button></div></footer></section>
    {selected&&<ActivityDetail item={selected} onClose={()=>setSelected(null)}/>} 
  </section>;
}
