import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import RouteLoading from '../components/system/RouteLoading';
import { loadMyPermissions, defaultPermissionsForRole, type PermissionCode } from '../security/permissions';
import { getStoredUser } from '../utils/authStorage';

const fallbackOrder: Array<[PermissionCode,string]> = [
 ['DASHBOARD_VIEW',''],['REPORT_PENDING_VIEW','reports'],['REPORT_APPROVED_VIEW','approved'],['REPORT_EXPORT','export'],['STATISTICS_VIEW','statistics'],['USER_VIEW','workers'],['MASTER_VIEW','master/machines'],['NOTIFICATION_VIEW','notifications'],['PROFILE_VIEW','profile']
];
export default function PermissionRoute({permission,children}:{permission:PermissionCode;children:ReactNode}){
 const user=getStoredUser(); const roleDefaults=defaultPermissionsForRole(user?.role); const [allowed,setAllowed]=useState<boolean|null>(()=>roleDefaults.has(permission));
 const base=useMemo(()=>{
  return user?.role==='admin'?'/admin':user?.role==='admin_ops'?'/admin-ops':user?.role==='manager'?'/manager':user?.role==='lead'?'/lead':'/worker';
 },[user?.role]);
 const [fallback,setFallback]=useState(base);
 useEffect(()=>{let active=true; setAllowed(roleDefaults.has(permission)); loadMyPermissions().then(set=>{
   if(!active)return;
   const effective=set;
   setAllowed(effective.has(permission));
   const item=fallbackOrder.find(([code])=>effective.has(code));
   setFallback(item ? `${base}${item[1]?`/${item[1]}`:''}` : base);
 }); return()=>{active=false};},[permission,base,user?.role]);
 if(allowed===null) return <RouteLoading/>;
 return allowed ? <>{children}</> : <Navigate to={fallback} replace/>;
}
