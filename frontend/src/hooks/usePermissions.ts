import { useCallback, useEffect, useRef, useState } from 'react';
import { loadMyPermissions, type PermissionCode } from '../security/permissions';
import { AUTH_EPOCH_CHANGED_EVENT } from '../services/authRuntimeEvents';

export function usePermissions(){
  const [permissions,setPermissions]=useState<Set<PermissionCode>>(()=>new Set());
  const [loading,setLoading]=useState(true);
  const seqRef=useRef(0);
  const load=useCallback(async(force=false)=>{
    const seq=++seqRef.current;
    setLoading(true);
    try {
      const next=await loadMyPermissions(force);
      if(seq===seqRef.current)setPermissions(next);
    } catch {
      if(seq===seqRef.current)setPermissions(new Set());
    } finally {
      if(seq===seqRef.current)setLoading(false);
    }
  },[]);
  const refresh=useCallback(()=>load(true),[load]);
  useEffect(()=>{
    void load();
    const onSessionChange=()=>{setPermissions(new Set());void load(true)};
    window.addEventListener(AUTH_EPOCH_CHANGED_EVENT,onSessionChange);
    return()=>{seqRef.current+=1;window.removeEventListener(AUTH_EPOCH_CHANGED_EVENT,onSessionChange)};
  },[load]);
  const can=useCallback((code:PermissionCode)=>permissions.has(code),[permissions]);
  return {permissions,can,loading,refresh};
}
