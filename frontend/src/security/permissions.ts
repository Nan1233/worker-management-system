import api from '../services/api';
import { getStoredUser } from '../utils/authStorage';

export type PermissionCode =
  | 'DASHBOARD_VIEW' | 'REPORT_PENDING_VIEW' | 'REPORT_APPROVE' | 'REPORT_PENDING_EDIT'
  | 'REPORT_APPROVED_VIEW' | 'REPORT_APPROVED_EDIT' | 'REPORT_DELETE' | 'REPORT_EXPORT'
  | 'EXCEL_DB_SYNC' | 'EXCEL_MASTER_SYNC' | 'USER_VIEW' | 'USER_CREATE' | 'USER_EDIT'
  | 'MASTER_VIEW' | 'MASTER_EDIT' | 'GOVERNANCE_VIEW'
  | 'STATISTICS_VIEW' | 'NOTIFICATION_VIEW' | 'AUDIT_VIEW'
  | 'SYSTEM_HEALTH_VIEW' | 'PERMISSION_MANAGE' | 'WORKER_ENTRY' | 'WORKER_HISTORY' | 'PROFILE_VIEW';

const all: PermissionCode[] = ['DASHBOARD_VIEW','REPORT_PENDING_VIEW','REPORT_APPROVE','REPORT_PENDING_EDIT','REPORT_APPROVED_VIEW','REPORT_APPROVED_EDIT','REPORT_DELETE','REPORT_EXPORT','EXCEL_DB_SYNC','EXCEL_MASTER_SYNC','USER_VIEW','USER_CREATE','USER_EDIT','MASTER_VIEW','MASTER_EDIT','GOVERNANCE_VIEW','STATISTICS_VIEW','NOTIFICATION_VIEW','AUDIT_VIEW','SYSTEM_HEALTH_VIEW','PERMISSION_MANAGE','WORKER_ENTRY','WORKER_HISTORY','PROFILE_VIEW'];
const workerContextPermissions = new Set<PermissionCode>(['WORKER_ENTRY','WORKER_HISTORY']);

const roleAdditions: Record<string, PermissionCode[]> = {
  worker: ['NOTIFICATION_VIEW','WORKER_ENTRY','WORKER_HISTORY','STATISTICS_VIEW','PROFILE_VIEW'],
  lead: ['DASHBOARD_VIEW','REPORT_PENDING_VIEW','REPORT_APPROVE','REPORT_PENDING_EDIT','REPORT_APPROVED_VIEW','REPORT_APPROVED_EDIT','REPORT_EXPORT','USER_VIEW','MASTER_VIEW','MASTER_EDIT' ,'AUDIT_VIEW'],
  manager: ['REPORT_DELETE','EXCEL_DB_SYNC','EXCEL_MASTER_SYNC','USER_CREATE','USER_EDIT','GOVERNANCE_VIEW'],
  admin: all
};

const roleParent: Record<string, string | null> = {
  worker: null,
  lead: 'worker',
  manager: 'lead',
  admin: 'manager'
};

function buildRoleDefaults(): Record<string, Set<PermissionCode>> {
  const result: Record<string, Set<PermissionCode>> = {};

  for (const role of ['worker','lead','manager','admin']) {
    const permissions = new Set<PermissionCode>();
    const parent = roleParent[role];

    if (parent) {
      for (const code of result[parent] || []) {
        if (!workerContextPermissions.has(code)) permissions.add(code);
      }
    }

    for (const code of roleAdditions[role] || []) permissions.add(code);
    result[role] = permissions;
  }

  result.admin = new Set(all);
  return result;
}

const defaults = buildRoleDefaults();

let cache: { userId:number; values:Set<PermissionCode>; expiresAt:number } | null = null;
let inFlight: { userId:number; promise:Promise<Set<PermissionCode>> } | null = null;
export function defaultPermissionsForRole(role?: string): Set<PermissionCode> { return new Set(defaults[String(role||'').toLowerCase()] || []); }
export function clearPermissionClientCache(){ cache=null; }
export async function loadMyPermissions(force=false): Promise<Set<PermissionCode>> {
  const user=getStoredUser(); if(!user) return new Set();
  const userId=Number(user.id);
  if(user.role==='admin') return new Set(all);
  if(!force && cache && cache.userId===userId && cache.expiresAt>Date.now()) return new Set(cache.values);
  if(inFlight?.userId===userId) return new Set(await inFlight.promise);
  const request = (async () => {
    try { const response=await api.get('/permissions/me'); const values=new Set<PermissionCode>((response.data?.data?.permissions || []) as PermissionCode[]); cache={userId,values,expiresAt:Date.now()+60_000}; return new Set(values); }
    catch { return defaultPermissionsForRole(user.role); }
  })();
  inFlight={userId,promise:request};
  try { return new Set(await request); } finally { if(inFlight?.promise===request) inFlight=null; }
}