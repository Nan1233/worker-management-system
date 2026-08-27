import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MasterData from './MasterData';

/** Lead uses the Manager workspace. Keep the master navigation explicit and stable. */
const MASTER_TABS = [
  { key: 'machines', label: 'Máy' },
  { key: 'standards', label: 'Sản phẩm & định mức' },
  { key: 'defects', label: 'Lỗi NG' },
  { key: 'deductions', label: 'Trừ giờ' },
];

export default function LeadManagerMasterData(){
  const [ready,setReady]=useState(false);
  const location=useLocation();
  const navigate=useNavigate();

  useEffect(()=>{ setReady(true); },[]);

  if(!ready) return <div className="route-loading">Đang mở dữ liệu quản lý...</div>;

  const currentResource=location.pathname.match(/\/manager\/master\/([^/]+)/)?.[1] || 'machines';

  return <>
    <style>{`
      .lead-manager-master-tabs{display:flex;align-items:stretch;gap:0;border-bottom:1px solid #dbe5f2;margin-bottom:14px;position:relative;z-index:3}
      .lead-manager-master-tabs button{appearance:none;background:transparent;border:0;border-bottom:2px solid transparent;padding:12px 20px;margin:0;color:#163b68;font:inherit;font-weight:600;cursor:pointer;white-space:nowrap}
      .lead-manager-master-tabs button:hover{color:#1268e8;background:#f5f9ff}
      .lead-manager-master-tabs button.active{color:#1268e8;border-bottom-color:#1268e8}
      .lead-manager-master-tabs + .master-page .master-tabs{display:none!important}
    `}</style>
    <div className="lead-manager-master-tabs" role="tablist" aria-label="Trung tâm quản lý">
      {MASTER_TABS.map(tab=><button
        key={tab.key}
        type="button"
        role="tab"
        aria-selected={currentResource===tab.key}
        className={currentResource===tab.key?'active':''}
        onClick={()=>navigate(`/manager/master/${tab.key}`)}
      >{tab.label}</button>)}
    </div>
    <MasterData/>
  </>;
}
