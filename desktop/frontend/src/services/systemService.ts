import api from './api';
export interface NotificationItem { id:number; type:string; title:string; message:string; link_url?:string|null; is_read:number; created_at:string; }
export interface ActivityItem { id:number; action:string; description?:string|null; entity_type?:string|null; entity_id?:number|null; full_name?:string|null; username?:string|null; created_at:string; }
export interface ReportVersion { id:number; version_no:number; change_reason?:string|null; created_at:string; created_by_name?:string|null; snapshot_json:unknown; }
export async function getNotifications(){ const r=await api.get('/system/notifications'); return r.data as {data:NotificationItem[];unread:number}; }
export async function markNotificationRead(id:number){ await api.patch(`/system/notifications/${id}/read`); }
export async function markAllNotificationsRead(){ await api.patch('/system/notifications/read-all'); }
export async function getActivities(){ const r=await api.get('/system/activities'); return r.data.data as ActivityItem[]; }
export async function getReportVersions(id:number,type:'temp'|'approved'='approved'){ const r=await api.get(`/system/reports/${id}/versions`,{params:{type}}); return r.data.data as ReportVersion[]; }

export async function getUnreadNotificationCount(){ const r=await api.get('/system/notifications/unread-count'); return Number(r.data.unread||0); }
