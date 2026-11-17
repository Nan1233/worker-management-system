import { useCallback, useEffect, useState } from 'react';
import { loadMyPermissions, type PermissionCode } from '../security/permissions';

export function usePermissions(){
  const [permissions,setPermissions]=useState<Set<PermissionCode>>(()=>new Set());
  const [loading,setLoading]=useState(true);
  const refresh=useCallback(async()=>{ setLoading(true); const next=await loadMyPermissions(true); setPermissions(next); setLoading(false); },[]);
  useEffect(()=>{ let mounted=true; loadMyPermissions().then(next=>{if(mounted){setPermissions(next);setLoading(false);}}); return()=>{mounted=false};},[]);
  const can=useCallback((code:PermissionCode)=>permissions.has(code),[permissions]);
  return {permissions,can,loading,refresh};
}
