import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import RouteLoading from '../components/system/RouteLoading';
import { loadMyPermissions, defaultPermissionsForRole, type PermissionCode } from '../security/permissions';
import { getStoredUser } from '../utils/authStorage';

const fallbackOrder: Array<[PermissionCode,string]> = [
 ['DASHBOARD_VIEW',''],['REPORT_PENDING_VIEW','reports'],['REPORT_APPROVED_VIEW','approved'],['REPORT_EXPORT','export'],['STATISTICS_VIEW','statistics'],['USER_VIEW','workers'],['MASTER_VIEW','master/users'],['NOTIFICATION_VIEW','system'],['PROFILE_VIEW','profile']
];
export default function PermissionRoute({permission,children}:{permission:PermissionCode;children:ReactNode}){
 const [allowed,setAllowed]=useState<boolean|null>(null); const user=getStoredUser(); const location=useLocation();
 const temporaryManagerView=String(user?.role||'').toLowerCase()==='lead' && location.pathname.startsWith('/manager');
 const base=useMemo(()=>{
  if(temporaryManagerView) return '/manager';
  return user?.role==='admin'?'/admin':user?.role==='manager'?'/manager':user?.role==='lead'?'/lead':'/worker';
 },[user?.role,temporaryManagerView]);
 const [fallback,setFallback]=useState(base);
 useEffect(()=>{let active=true; loadMyPermissions().then(set=>{
   if(!active)return;
   const effective=temporaryManagerView ? new Set([...set,...defaultPermissionsForRole('manager')]) : set;
   setAllowed(effective.has(permission));
   const item=fallbackOrder.find(([code])=>effective.has(code));
   setFallback(item ? `${base}${item[1]?`/${item[1]}`:''}` : base);
 }); return()=>{active=false};},[permission,base,temporaryManagerView]);
 if(allowed===null) return <RouteLoading/>;
 return allowed ? <>{children}</> : <Navigate to={fallback} replace/>;
}
