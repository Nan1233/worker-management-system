import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import RouteLoading from '../components/system/RouteLoading';
import { loadMyPermissions, type PermissionCode } from '../security/permissions';
import { getStoredUser } from '../utils/authStorage';

const fallbackOrder: Array<[PermissionCode,string]> = [
 ['DASHBOARD_VIEW',''],['REPORT_PENDING_VIEW','reports'],['REPORT_APPROVED_VIEW','approved'],['REPORT_EXPORT','export'],['STATISTICS_VIEW','statistics'],['USER_VIEW','workers'],['MASTER_VIEW','master/users'],['NOTIFICATION_VIEW','system'],['PROFILE_VIEW','profile']
];
export default function PermissionRoute({permission,children}:{permission:PermissionCode;children:ReactNode}){
 const [allowed,setAllowed]=useState<boolean|null>(null); const user=getStoredUser();
 const base=useMemo(()=>user?.role==='admin'?'/admin':user?.role==='manager'?'/manager':user?.role==='lead'?'/lead':'/worker',[user?.role]);
 const [fallback,setFallback]=useState(base);
 useEffect(()=>{let active=true; loadMyPermissions().then(set=>{if(!active)return;setAllowed(set.has(permission)); const item=fallbackOrder.find(([code])=>set.has(code)); setFallback(item ? `${base}${item[1]?`/${item[1]}`:''}` : base);}); return()=>{active=false};},[permission,base]);
 if(allowed===null) return <RouteLoading/>;
 return allowed ? <>{children}</> : <Navigate to={fallback} replace/>;
}
