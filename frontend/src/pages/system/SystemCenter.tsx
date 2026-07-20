import {  useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getActivities, getNotifications, markAllNotificationsRead, markNotificationRead, type ActivityItem, type NotificationItem } from '../../services/systemService';
import './SystemCenter.css';

export default function SystemCenter(){
 const [tab,setTab]=useState<'notifications'|'activities'>('notifications');
 const [notifications,setNotifications]=useState<NotificationItem[]>([]);
 const [activities,setActivities]=useState<ActivityItem[]>([]);
 const [loading,setLoading]=useState(true); const navigate=useNavigate();
const [error, setError] = useState("");
{error && (
    <div className="system-error">
        {error}
        <button
            type="button"
            onClick={() => void load()}
        >
            Thử lại
        </button>
    </div>
)}
const load = async () => {
    setLoading(true);
    setError("");

    const results = await Promise.allSettled([
        getNotifications(),
        getActivities()
    ]);

    const notificationResult = results[0];
    const activityResult = results[1];

    if (notificationResult.status === "fulfilled") {
        setNotifications(
            notificationResult.value.data || []
        );
    } else {
        console.error(
            "GET NOTIFICATIONS ERROR:",
            notificationResult.reason
        );

        setError(
            notificationResult.reason?.response?.data?.message ||
            "Không tải được thông báo"
        );
    }

    if (activityResult.status === "fulfilled") {
        setActivities(
            activityResult.value || []
        );
    } else {
        console.error(
            "GET ACTIVITIES ERROR:",
            activityResult.reason
        );

        setError((current) =>
            current ||
            activityResult.reason?.response?.data?.message ||
            "Không tải được lịch sử hoạt động"
        );
    }

    setLoading(false);
};
 const open=async(n:NotificationItem)=>{if(!n.is_read){await markNotificationRead(n.id);setNotifications(v=>v.map(x=>x.id===n.id?{...x,is_read:1}:x));}if(n.link_url)navigate(n.link_url)};
 return <section className="system-center"><header><div><h1>Trung tâm hệ thống</h1><p>Theo dõi thông báo và lịch sử hoạt động</p></div><button onClick={async()=>{await markAllNotificationsRead();setNotifications(v=>v.map(x=>({...x,is_read:1})))}}>Đánh dấu đã đọc</button></header>
 <div className="system-tabs"><button className={tab==='notifications'?'active':''} onClick={()=>setTab('notifications')}>Thông báo ({notifications.filter(x=>!x.is_read).length})</button><button className={tab==='activities'?'active':''} onClick={()=>setTab('activities')}>Lịch sử hoạt động</button></div>
 {loading?<div className="system-empty">Đang tải...</div>:tab==='notifications'?<div className="system-list">{notifications.length?notifications.map(n=><button key={n.id} className={`system-item ${!n.is_read?'unread':''}`} onClick={()=>void open(n)}><span className="dot"/><div><strong>{n.title}</strong><p>{n.message}</p><small>{new Date(n.created_at).toLocaleString('vi-VN')}</small></div></button>):<div className="system-empty">Chưa có thông báo</div>}</div>:<div className="system-list">{activities.length?activities.map(a=><article key={a.id} className="system-item"><span className="activity-icon">↺</span><div><strong>{a.description||a.action}</strong><p>{a.full_name||a.username||'Hệ thống'} · {a.entity_type||'system'} {a.entity_id?`#${a.entity_id}`:''}</p><small>{new Date(a.created_at).toLocaleString('vi-VN')}</small></div></article>):<div className="system-empty">Chưa có hoạt động</div>}</div>}</section>
}
