import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MasterData from './MasterData';

/** Lead uses the Manager workspace. Never mutate the stored Lead role. */
export default function LeadManagerMasterData(){
  const [ready,setReady]=useState(false);
  const location=useLocation();
  const navigate=useNavigate();

  useEffect(()=>{ setReady(true); },[]);

  // Compatibility guard: older MasterData bundles may not contain the NG tab.
  // Keep the tab inside the existing .master-tabs row and always navigate within /manager.
  useEffect(()=>{
    if(!ready || !location.pathname.startsWith('/manager/master/')) return;
    const timer=window.setTimeout(()=>{
      const tabs=document.querySelector('.master-tabs');
      if(!tabs) return;
      const buttons=Array.from(tabs.querySelectorAll('button')) as HTMLButtonElement[];
      const existing=buttons.find(button=>button.textContent?.trim()==='Lỗi NG');
      if(existing){
        existing.onclick=()=>navigate('/manager/master/defects');
        existing.classList.toggle('active',location.pathname==='/manager/master/defects');
        return;
      }
      const defectsButton=document.createElement('button');
      defectsButton.type='button';
      defectsButton.textContent='Lỗi NG';
      defectsButton.className=location.pathname==='/manager/master/defects'?'active':'';
      defectsButton.onclick=()=>navigate('/manager/master/defects');
      const deductions=buttons.find(button=>button.textContent?.trim()==='Trừ giờ');
      if(deductions) tabs.insertBefore(defectsButton,deductions);
      else tabs.appendChild(defectsButton);
    },0);
    return ()=>window.clearTimeout(timer);
  },[ready,location.pathname,navigate]);

  if(!ready) return <div className="route-loading">Đang mở dữ liệu quản lý...</div>;
  return <MasterData/>;
}
