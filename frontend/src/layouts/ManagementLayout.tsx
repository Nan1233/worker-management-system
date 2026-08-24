import { useEffect, useState } from "react";
import { BarChart3, Bell, Boxes, ClipboardCheck, Cog, FileWarning, History, LayoutDashboard, MoreHorizontal, ShieldCheck, Timer, UserRound, Users } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { getStoredUser } from "../utils/authStorage";
import { useNotificationBadge } from "../hooks/useNotificationBadge";
import { usePermissions } from "../hooks/usePermissions";
import type { PermissionCode } from "../security/permissions";
import MasterDataTransferActions from "../components/master/MasterDataTransferActions";
import "./ManagementLayout.css";

type ManagementRole = "lead" | "manager" | "admin";
type ManagementMenuItem = { label:string; path:string; icon:typeof LayoutDashboard; permission:PermissionCode; roles:ManagementRole[] };
const allManagementRoles:ManagementRole[]=["lead","manager","admin"];
const adminAndManagerRoles:ManagementRole[]=["manager","admin"];
const items:ManagementMenuItem[]=[
 {label:"Tổng quan",path:"",icon:LayoutDashboard,permission:"DASHBOARD_VIEW",roles:allManagementRoles},
 {label:"Chờ duyệt",path:"reports",icon:ClipboardCheck,permission:"REPORT_PENDING_VIEW",roles:allManagementRoles},
 {label:"Đã duyệt",path:"approved",icon:ShieldCheck,permission:"REPORT_APPROVED_VIEW",roles:allManagementRoles},
 {label:"Thống kê",path:"statistics",icon:BarChart3,permission:"STATISTICS_VIEW",roles:allManagementRoles},
 {label:"Nhân sự",path:"workers",icon:Users,permission:"USER_VIEW",roles:allManagementRoles},
 {label:"Máy móc",path:"master/machines",icon:Cog,permission:"MASTER_VIEW",roles:adminAndManagerRoles},
 {label:"Sản phẩm",path:"master/standards",icon:Boxes,permission:"MASTER_VIEW",roles:adminAndManagerRoles},
 {label:"Trừ giờ",path:"master/deductions",icon:Timer,permission:"MASTER_VIEW",roles:adminAndManagerRoles},
 {label:"Lỗi",path:"master/defects",icon:FileWarning,permission:"MASTER_VIEW",roles:["admin"]},
 {label:"Nhật ký hoạt động",path:"system",icon:History,permission:"AUDIT_VIEW",roles:adminAndManagerRoles},
 {label:"Vai trò & quyền",path:"permissions",icon:ShieldCheck,permission:"PERMISSION_MANAGE",roles:["admin"]},
];
const roleLabel:Record<ManagementRole,string>={lead:"Tổ trưởng",manager:"Quản lý",admin:"Quản trị viên"};

export default function ManagementLayout({role}:{role:ManagementRole}){
 const navigate=useNavigate(),location=useLocation();
 const {can}=usePermissions();
 const {unreadCount}=useNotificationBadge(can("NOTIFICATION_VIEW"));
 const base=`/${role}`,user=getStoredUser();
 const [mobileMoreOpen,setMobileMoreOpen]=useState(false);
 const visible=items.filter(item=>item.roles.includes(role)&&can(item.permission));
 const mobilePrimaryItems=visible.slice(0,2),mobileOverflowItems=visible.slice(2);
 const active=(path:string)=>path===""?location.pathname===base:location.pathname===`${base}/${path}`||location.pathname.startsWith(`${base}/${path}/`);
 const displayName=user?.full_name||user?.username||roleLabel[role];
 const avatarText=displayName.trim().charAt(0).toUpperCase()||"K";
 useEffect(()=>{
  if(role!=="manager")return;
  const forbiddenMasterPath=/^\/manager\/master\/(users|processes|defects)(?:\/|$)/.test(location.pathname);
  if(forbiddenMasterPath)navigate(`${base}/master/machines`,{replace:true});
 },[role,location.pathname,navigate,base]);
 return <div className="management-layout" data-management-role={role}>
  <aside className="management-sidebar">
   <button className="management-brand" type="button" onClick={()=>navigate(base)}><span className="management-brand-mark">K</span><span><strong>KTC (HANOI) CO., LTD</strong><small>{roleLabel[role]}</small></span></button>
   <nav className="management-menu" aria-label="Management navigation">
    {visible.map(item=>{const Icon=item.icon;return <button key={item.path||"home"} type="button" className={active(item.path)?"active":""} onClick={()=>navigate(`${base}${item.path?`/${item.path}`:""}`)}><Icon size={18}/><span>{item.label}</span>{item.path==="system"&&unreadCount>0&&<b className="management-badge">{unreadCount>99?"99+":unreadCount}</b>}</button>;})}
    <button type="button" className={active("profile")?"active":""} onClick={()=>navigate(`${base}/profile`)}><UserRound size={18}/><span>Cá nhân</span></button>
   </nav>
  </aside>
  <section className="management-main">
   <header className="management-header">
    <div className="management-header-title"><strong>KTC Production Control</strong><span>{roleLabel[role]}</span></div>
    <div className="management-header-actions">
     <button className="management-notification" type="button" aria-label="Thông báo" onClick={()=>navigate(`${base}/system`)}><Bell size={19}/>{unreadCount>0&&<b>{unreadCount>9?"9+":unreadCount}</b>}</button>
     <button className="management-user" type="button" aria-label="Mở trang cá nhân" onClick={()=>navigate(`${base}/profile`)}><span className="management-user-avatar">{avatarText}</span><span className="management-user-copy"><strong>{displayName}</strong><small>{roleLabel[role]}</small></span></button>
    </div>
   </header>
   <main className="management-content"><MasterDataTransferActions/><Outlet/></main>
  </section>
  <nav className="management-mobile-nav" aria-label="Mobile navigation">
   {mobileMoreOpen&&mobileOverflowItems.length>0&&<div id="management-mobile-overflow" className="management-mobile-overflow" aria-label="Các mục điều hướng khác">{mobileOverflowItems.map(item=>{const Icon=item.icon;return <button key={`overflow-${item.path}`} type="button" className={active(item.path)?"active":""} onClick={()=>{setMobileMoreOpen(false);navigate(`${base}${item.path?`/${item.path}`:""}`);}}><Icon size={18}/><span>{item.label}</span></button>;})}</div>}
   {mobilePrimaryItems.map(item=>{const Icon=item.icon;return <button key={`mobile-${item.path}`} type="button" className={active(item.path)?"active":""} onClick={()=>navigate(`${base}${item.path?`/${item.path}`:""}`)}><Icon size={18}/><span>{item.label}</span></button>;})}
   <button type="button" className={active("system")?"active":""} onClick={()=>navigate(`${base}/system`)}><Bell size={18}/><span>Thông báo</span>{unreadCount>0&&<b className="management-badge">{unreadCount>99?"99+":unreadCount}</b>}</button>
   <button type="button" className={active("profile")?"active":""} onClick={()=>navigate(`${base}/profile`)}><UserRound size={18}/><span>Cá nhân</span></button>
   {mobileOverflowItems.length>0&&<button type="button" className={mobileMoreOpen?"active":""} onClick={()=>setMobileMoreOpen(open=>!open)} aria-expanded={mobileMoreOpen} aria-controls="management-mobile-overflow"><MoreHorizontal size={18}/><span>Thêm</span></button>}
  </nav>
 </div>;
}
