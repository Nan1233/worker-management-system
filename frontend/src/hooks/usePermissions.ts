import { useCallback, useEffect, useState } from 'react';
import { defaultPermissionsForRole, loadMyPermissions, type PermissionCode } from '../security/permissions';
import { getStoredUser } from '../utils/authStorage';

export function usePermissions(){
  const user=getStoredUser();
  const [permissions,setPermissions]=useState<Set<PermissionCode>>(()=>defaultPermissionsForRole(user?.role));
  const [loading,setLoading]=useState(true);
  const refresh=useCallback(async()=>{ setLoading(true); const next=await loadMyPermissions(true); setPermissions(next); setLoading(false); },[]);
  useEffect(()=>{ let mounted=true; loadMyPermissions().then(next=>{if(mounted){setPermissions(next);setLoading(false);}}); return()=>{mounted=false};},[]);
  const can=useCallback((code:PermissionCode)=>permissions.has(code),[permissions]);
  return {permissions,can,loading,refresh};
}
