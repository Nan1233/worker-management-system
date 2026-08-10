import api from './api';

export interface NotificationItem {
  id:number; type:string; title:string; message:string; link_url?:string|null;
  is_read:number; created_at:string;
}

export interface ActivityItem {
  id:number;
  action:string;
  description?:string|null;
  entity_type?:string|null;
  entity_id?:number|string|null;
  full_name?:string|null;
  username?:string|null;
  role?:string|null;
  metadata_json?:unknown;
  ip_address?:string|null;
  user_agent?:string|null;
  created_at:string;
}

export interface ActivityFilters {
  search?:string;
  action?:string;
  entityType?:string;
  from?:string;
  to?:string;
  limit?:number;
}

export interface ReportVersion {
  id:number;
  version_no:number;
  change_reason?:string|null;
  created_at:string;
  created_by_name?:string|null;
  snapshot_json:unknown;
}

export async function getNotifications(){
 const r=await api.get('/system/notifications');
 const payload=r.data || {};
 return {
  data:Array.isArray(payload.data)?payload.data:[],
  unread:Number(payload.unread||0)
 } as {data:NotificationItem[];unread:number};
}
export async function markNotificationRead(id:number){ await api.patch(`/system/notifications/${id}/read`); }
export async function markAllNotificationsRead(){ await api.patch('/system/notifications/read-all'); }

export async function getActivities(filters:ActivityFilters={}){
 const r=await api.get('/system/activities',{params:{
  search:filters.search?.trim()||undefined,
  action:filters.action||undefined,
  entity_type:filters.entityType||undefined,
  from:filters.from||undefined,
  to:filters.to||undefined,
  limit:filters.limit||100
 }});
 return r.data.data as ActivityItem[];
}

export async function getReportVersions(id:number,type:'temp'|'approved'='approved'){
 const r=await api.get(`/system/reports/${id}/versions`,{params:{type}});
 return r.data.data as ReportVersion[];
}

export async function restoreApprovedReportVersion(id:number,versionNo:number,reason:string){
 const r=await api.post(`/production/${id}/versions/${versionNo}/restore`,{reason});
 return r.data;
}

export async function getUnreadNotificationCount(){
 const r=await api.get('/system/notifications/unread-count');
 return Number(r.data?.data?.unreadCount ?? r.data?.unread ?? 0);
}

export interface DeletedReportItem {
  id:number;
  work_date:string;
  shift?:string|null;
  machine_no?:string|null;
  product_name?:string|null;
  review_note?:string|null;
  updated_at?:string|null;
  worker_code?:string|null;
  full_name?:string|null;
  process_code?:string|null;
  process_name?:string|null;
}

export async function getDeletedReports(){
 const r=await api.get('/system/deleted-reports');
 return (r.data?.data || []) as DeletedReportItem[];
}

export interface ObservabilitySnapshot {
  startedAt:string;
  uptimeSeconds:number;
  http:{requests:number;errors4xx:number;errors5xx:number;slowRequests:number;averageDurationMs:number;maxDurationMs:number;byStatus:Record<string,number>};
  memory:{rssMb:number;heapUsedMb:number;heapTotalMb:number};
  database:{status:string;latencyMs?:number};
  recentErrors:Array<{requestId?:string;method?:string;path?:string;status?:number;at?:string}>;
}
export async function getObservability(){
 const r=await api.get('/system/observability');
 return r.data.data as ObservabilitySnapshot;
}

export interface ReadinessSnapshot {
  status:string;
  database?:{status?:string;latencyMs?:number};
  timestamp?:string;
}
export async function getReadiness(){
 const r=await api.get('/health/ready',{validateStatus:(status)=>status===200||status===503});
 return r.data as ReadinessSnapshot;
}
