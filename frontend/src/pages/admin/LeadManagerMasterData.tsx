import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MasterData from './MasterData';

/** Lead uses the Manager workspace. Keep the NG tab visible in manager master data. */
export default function LeadManagerMasterData(){
  const [ready,setReady]=useState(false);
  const location=useLocation();
  const navigate=useNavigate();

  useEffect(()=>{ setReady(true); },[]);

  useEffect(()=>{
    if(!ready || !location.pathname.startsWith('/manager/master/')) return;

    let disposed=false;
    const injectNgTab=()=>{
      if(disposed) return;
      const tabs=document.querySelector('.master-tabs');
      if(!tabs) return;
      const buttons=Array.from(tabs.querySelectorAll('button')) as HTMLButtonElement[];
      let ngButton=buttons.find(button=>button.textContent?.trim()==='Lỗi NG');
      if(!ngButton){
        ngButton=document.createElement('button');
        ngButton.type='button';
        ngButton.textContent='Lỗi NG';
        const deductions=buttons.find(button=>button.textContent?.trim()==='Trừ giờ');
        if(deductions) tabs.insertBefore(ngButton,deductions); else tabs.appendChild(ngButton);
      }
      ngButton.classList.toggle('active',location.pathname==='/manager/master/defects');
      ngButton.onclick=()=>navigate('/manager/master/defects');
    };

    injectNgTab();
    const observer=new MutationObserver(injectNgTab);
    observer.observe(document.body,{childList:true,subtree:true});
    const timer=window.setTimeout(injectNgTab,1000);
    return()=>{disposed=true;observer.disconnect();window.clearTimeout(timer);};
  },[ready,location.pathname,navigate]);

  if(!ready) return <div className="route-loading">Đang mở dữ liệu quản lý...</div>;
  return <MasterData/>;
}
