import api from '../services/api';
import { getStoredUser } from '../utils/authStorage';

export type PermissionCode =
  | 'DASHBOARD_VIEW' | 'REPORT_PENDING_VIEW' | 'REPORT_APPROVE' | 'REPORT_PENDING_EDIT'
  | 'REPORT_APPROVED_VIEW' | 'REPORT_APPROVED_EDIT' | 'REPORT_DELETE' | 'REPORT_EXPORT'
  | 'EXCEL_DB_SYNC' | 'EXCEL_MASTER_SYNC' | 'USER_VIEW' | 'USER_CREATE' | 'USER_EDIT'
  | 'MASTER_VIEW' | 'MASTER_EDIT' | 'GOVERNANCE_VIEW'
  | 'PERIOD_LOCK' | 'PERIOD_UNLOCK' | 'STATISTICS_VIEW' | 'NOTIFICATION_VIEW' | 'AUDIT_VIEW'
  | 'SYSTEM_HEALTH_VIEW' | 'PERMISSION_MANAGE' | 'WORKER_ENTRY' | 'WORKER_HISTORY' | 'PROFILE_VIEW';

const all: PermissionCode[] = ['DASHBOARD_VIEW','REPORT_PENDING_VIEW','REPORT_APPROVE','REPORT_PENDING_EDIT','REPORT_APPROVED_VIEW','REPORT_APPROVED_EDIT','REPORT_DELETE','REPORT_EXPORT','EXCEL_DB_SYNC','EXCEL_MASTER_SYNC','USER_VIEW','USER_CREATE','USER_EDIT','MASTER_VIEW','MASTER_EDIT','GOVERNANCE_VIEW','PERIOD_LOCK','PERIOD_UNLOCK','STATISTICS_VIEW','NOTIFICATION_VIEW','AUDIT_VIEW','SYSTEM_HEALTH_VIEW','PERMISSION_MANAGE','WORKER_ENTRY','WORKER_HISTORY','PROFILE_VIEW'];
const defaults: Record<string, Set<PermissionCode>> = {
  admin: new Set(all),
  manager: new Set(all.filter(code => !['PERIOD_UNLOCK','PERMISSION_MANAGE','WORKER_ENTRY','WORKER_HISTORY'].includes(code))),
  lead: new Set(['DASHBOARD_VIEW','REPORT_PENDING_VIEW','REPORT_APPROVE','REPORT_APPROVED_VIEW','REPORT_EXPORT','USER_VIEW','MASTER_VIEW','STATISTICS_VIEW','NOTIFICATION_VIEW','AUDIT_VIEW','SYSTEM_HEALTH_VIEW','PROFILE_VIEW']),
  worker: new Set(['NOTIFICATION_VIEW','WORKER_ENTRY','WORKER_HISTORY','PROFILE_VIEW'])
};

let cache: { userId:number; values:Set<PermissionCode>; expiresAt:number } | null = null;
let inFlight: { userId:number; promise:Promise<Set<PermissionCode>> } | null = null;

export function defaultPermissionsForRole(role?: string): Set<PermissionCode> { return new Set(defaults[String(role||'').toLowerCase()] || []); }
export function clearPermissionClientCache(){ cache=null; }

export async function loadMyPermissions(force=false): Promise<Set<PermissionCode>> {
  const user=getStoredUser();
  if(!user) return new Set();
  const userId=Number(user.id);
  if(user.role==='admin') return new Set(all);
  if(!force && cache && cache.userId===userId && cache.expiresAt>Date.now()) return new Set(cache.values);
  if(inFlight?.userId===userId) return new Set(await inFlight.promise);
  const request = (async () => {
    try {
      const response=await api.get('/permissions/me');
      const values=new Set<PermissionCode>((response.data?.data?.permissions || []) as PermissionCode[]);
      cache={userId,values,expiresAt:Date.now()+60_000};
      return new Set(values);
    } catch { return defaultPermissionsForRole(user.role); }
  })();
  inFlight={userId,promise:request};
  try { return new Set(await request); } finally { if(inFlight?.promise===request) inFlight=null; }
}
