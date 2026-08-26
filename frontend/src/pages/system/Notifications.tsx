import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, CircleCheck, FileText, Info, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getNotifications, markAllNotificationsRead, markNotificationRead, type NotificationItem } from "../../services/systemService";
import { publishNotificationCount } from "../../hooks/useNotificationBadge";
import "./Notifications.css";

const dateText=(value:string)=>new Date(value).toLocaleString("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
const iconFor=(type:string)=>{const t=String(type||"").toLowerCase();if(t.includes("approve")||t.includes("success"))return <CircleCheck/>;if(t.includes("report"))return <FileText/>;if(t.includes("system"))return <Info/>;return <Bell/>;};

export default function Notifications(){
 const navigate=useNavigate();
 const [items,setItems]=useState<NotificationItem[]>([]);
 const [loading,setLoading]=useState(true);
 const [refreshing,setRefreshing]=useState(false);
 const [filter,setFilter]=useState<"all"|"unread">("all");
 const [error,setError]=useState("");
 const load=useCallback(async(showRefresh=false)=>{if(showRefresh)setRefreshing(true);else setLoading(true);setError("");try{const result=await getNotifications();setItems(result.data||[]);publishNotificationCount(result.unread||0);}catch{setError("Không tải được thông báo. Vui lòng thử lại.");}finally{setLoading(false);setRefreshing(false);}},[]);
 useEffect(()=>{void load();},[load]);
 const unread=useMemo(()=>items.filter(x=>!x.is_read).length,[items]);
 const visible=useMemo(()=>filter==="unread"?items.filter(x=>!x.is_read):items,[items,filter]);
 const open=async(item:NotificationItem)=>{try{if(!item.is_read){await markNotificationRead(item.id);setItems(v=>v.map(x=>x.id===item.id?{...x,is_read:1}:x));publishNotificationCount(Math.max(0,unread-1));}}finally{if(item.link_url)navigate(item.link_url);}};
 const readAll=async()=>{if(!unread)return;await markAllNotificationsRead();setItems(v=>v.map(x=>({...x,is_read:1})));publishNotificationCount(0);};
 return <section className="notifications-page">
   <header className="notifications-header"><div><div className="notifications-eyebrow">TRUNG TÂM THÔNG BÁO</div><h1><Bell size={25}/> Thông báo</h1><p>Các thông tin mới liên quan đến báo cáo và hoạt động của bạn.</p></div><div className="notifications-actions"><button type="button" className="notifications-refresh" onClick={()=>void load(true)} disabled={refreshing}><RefreshCw className={refreshing?"spin":""} size={16}/> Làm mới</button><button type="button" className="notifications-readall" onClick={()=>void readAll()} disabled={!unread}><CheckCheck size={16}/> Đánh dấu tất cả đã đọc</button></div></header>
   <section className="notifications-summary"><div><span className="notifications-summary-icon"><Bell size={20}/></span><div><small>Tổng thông báo</small><strong>{items.length}</strong></div></div><div><span className="notifications-summary-icon unread"><CircleCheck size={20}/></span><div><small>Chưa đọc</small><strong>{unread}</strong></div></div></section>
   <section className="notifications-card"><div className="notifications-tabs"><button className={filter==="all"?"active":""} onClick={()=>setFilter("all")}>Tất cả <b>{items.length}</b></button><button className={filter==="unread"?"active":""} onClick={()=>setFilter("unread")}>Chưa đọc <b>{unread}</b></button></div>
    {error&&<div className="notifications-error">{error}<button onClick={()=>void load(true)}>Thử lại</button></div>}
    <div className="notifications-list">{loading?<div className="notifications-empty">Đang tải thông báo...</div>:visible.length?visible.map(item=><button type="button" key={item.id} className={`notification-row ${!item.is_read?"unread":""}`} onClick={()=>void open(item)}><span className="notification-icon">{iconFor(item.type)}</span><span className="notification-body"><strong>{item.title||"Thông báo"}</strong><span>{item.message}</span><small>{dateText(item.created_at)}</small></span>{!item.is_read&&<span className="notification-new">Mới</span>}</button>):<div className="notifications-empty"><Bell size={28}/><strong>{filter==="unread"?"Không còn thông báo chưa đọc":"Chưa có thông báo"}</strong><span>Các thông báo mới sẽ xuất hiện tại đây.</span></div>}</div>
   </section>
 </section>;
}
