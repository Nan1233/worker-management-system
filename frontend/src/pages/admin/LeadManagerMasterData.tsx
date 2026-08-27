import { useEffect, useState } from 'react';
import MasterData from './MasterData';
import { getStoredUser } from '../../utils/authStorage';

/** Lead uses the Manager workspace. Never mutate the stored Lead role. */
export default function LeadManagerMasterData(){
  const [ready,setReady]=useState(false);
  useEffect(()=>{ void getStoredUser(); setReady(true); },[]);
  if(!ready) return <div className="route-loading">Đang mở dữ liệu quản lý...</div>;
  return <MasterData/>;
}
