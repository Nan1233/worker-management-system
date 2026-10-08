import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MasterData from './MasterData';
import { getStoredUser } from '../../utils/authStorage';

/**
 * Master-data workspace shared by Admin, Manager and Lead. The tab bar and the
 * base route follow the signed-in role; the tabs shown mirror what the backend
 * allows (adminMasterRoutes.js): defects are manager/admin only, processes are
 * admin-only (create/edit/disable).
 */
type MasterRole = 'admin' | 'manager' | 'lead';
const MASTER_TABS: { key: string; label: string; roles: MasterRole[] }[] = [
  { key: 'machines', label: 'Máy', roles: ['admin', 'manager', 'lead'] },
  { key: 'standards', label: 'Sản phẩm & định mức', roles: ['admin', 'manager', 'lead'] },
  { key: 'defects', label: 'Lỗi NG', roles: ['admin', 'manager'] },
  { key: 'deductions', label: 'Trừ giờ', roles: ['admin', 'manager', 'lead'] },
  { key: 'processes', label: 'Công đoạn', roles: ['admin'] },
];

export default function LeadManagerMasterData(){
  const [ready,setReady]=useState(false);
  const params=useParams<{resource?:string}>();
  const navigate=useNavigate();
  const role=(getStoredUser()?.role||'manager') as MasterRole;
  const tabs=MASTER_TABS.filter(tab=>tab.roles.includes(role));
  useEffect(()=>{ setReady(true); },[]);
  if(!ready) return <div className="route-loading">Đang mở dữ liệu quản lý...</div>;
  const currentResource=params.resource || 'machines';
  return <>
    <style>{`
      /* Explicit Manager-workspace master navigation: NG is a first-class tab. */
      .ktc-manager-master-tabs{display:flex!important;align-items:stretch;gap:0;border-bottom:1px solid #dbe5f2;margin:0 0 14px;position:relative;z-index:10;visibility:visible!important;}
      .ktc-manager-master-tabs button{appearance:none;background:transparent;border:0;border-bottom:2px solid transparent;padding:12px 24px;margin:0;color:#163b68;font:inherit;font-weight:600;cursor:pointer;white-space:nowrap;visibility:visible!important;}
      .ktc-manager-master-tabs button:hover{color:#1268e8;background:#f5f9ff}
      .ktc-manager-master-tabs button.active{color:#1268e8;border-bottom-color:#1268e8}
      .ktc-manager-master-tabs + .master-page .master-tabs{display:none!important;}
    `}</style>
    <div className="ktc-manager-master-tabs" role="tablist" aria-label="Trung tâm quản lý">
      {tabs.map(tab=><button key={tab.key} type="button" role="tab" aria-selected={currentResource===tab.key} className={currentResource===tab.key?'active':''} onClick={()=>navigate(`/${role}/master/${tab.key}`)}>{tab.label}</button>)}
    </div>
    <MasterData/>
  </>;
}
