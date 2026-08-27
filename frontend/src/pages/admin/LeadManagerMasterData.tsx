import { useEffect, useMemo, useState } from 'react';
import MasterData from './MasterData';
import { getStoredUser, setStoredUser, type AuthUser } from '../../utils/authStorage';

/** Compatibility adapter for Lead accounts that currently use the /manager workspace. */
export default function LeadManagerMasterData(){
  const originalUser = useMemo<AuthUser|null>(()=>getStoredUser(),[]);
  const [ready,setReady]=useState(false);

  useEffect(()=>{
    if(!originalUser){ setReady(true); return; }
    if(originalUser.role!=='lead'){ setReady(true); return; }

    const managerViewUser:AuthUser={...originalUser,role:'manager'};
    setStoredUser(managerViewUser);
    setReady(true);

    return ()=>{ setStoredUser(originalUser); };
  },[originalUser]);

  if(!ready) return <div className="route-loading">Đang mở dữ liệu quản lý...</div>;
  return <MasterData/>;
}
