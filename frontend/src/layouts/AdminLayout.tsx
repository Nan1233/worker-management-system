import { useEffect, useState } from "react";
import { Boxes, Cog, FileWarning, History, LayoutDashboard, Menu, MoreHorizontal, ShieldCheck, Timer, UserRound, Users, Bell, X } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { getStoredUser } from "../utils/authStorage";
import { useNotificationBadge } from "../hooks/useNotificationBadge";
import { usePermissions } from "../hooks/usePermissions";
import type { PermissionCode } from "../security/permissions";
import "./AdminLayout.css";

type AdminMenuItem={label:string;path:string;icon:typeof LayoutDashboard;permission:PermissionCode};
const items:AdminMenuItem[]=[
 {label:"Tổng quan hệ thống",path:"",icon:LayoutDashboard,permission:"DASHBOARD_VIEW"},
 {label:"Tài khoản & nhân sự",path:"workers",icon:Users,permission:"USER_VIEW"},
 {label:"Máy móc",path:"master/machines",icon:Cog,permission:"MASTER_VIEW"},
 {label:"Sản phẩm & định mức",path:"master/standards",icon:Boxes,permission:"MASTER_VIEW"},
 {label:"Trừ giờ",path:"master/deductions",icon:Timer,permission:"MASTER_VIEW"},
 {label:"Loại lỗi",path:"master/defects",icon:FileWarning,permission:"MASTER_VIEW"},
 {label:"Vai trò & quyền",path:"permissions",icon:ShieldCheck,permission:"PERMISSION_MANAGE"},
 {label:"Nhật ký hoạt động",path:"system",icon:History,permission:"AUDIT_VIEW"},
];
const roleLabel="Quản trị viên";

export default function AdminLayout(){
 const navigate=useNavigate(),location=useLocation();
 const {can}=usePermissions();
 const {unreadCount}=useNotificationBadge(can("NOTIFICATION_VIEW"));
 const user=getStoredUser();
 const [mobileMoreOpen,setMobileMoreOpen]=useState(false),[mobileSidebarOpen,setMobileSidebarOpen]=useState(false);
 const visible=items.filter(item=>can(item.permission));
 const active=(path:string)=>path===""?location.pathname==="/admin":location.pathname===`/admin/${path}`||location.pathname.startsWith(`/admin/${path}/`);
 const displayName=user?.full_name||user?.username||roleLabel;
 const avatarText=displayName.trim().charAt(0).toUpperCase()||"A";
 useEffect(()=>{setMobileMoreOpen(false);setMobileSidebarOpen(false);},[location.pathname]);
 const go=(path:string)=>navigate(`/admin${path?`/${path}`:""}`);
 return <div className="admin-layout">
  <aside className={`admin-sidebar${mobileSidebarOpen?" open":""}`}>
   <button className="admin-brand" type="button" onClick={()=>go("")}><span className="admin-brand-mark">K</span><span><strong>KTC (HANOI) CO., LTD</strong><small>Trung tâm quản trị hệ thống</small></span></button>
   <div className="admin-sidebar-heading">QUẢN TRỊ HỆ THỐNG</div>
   <nav className="admin-menu" aria-label="Điều hướng quản trị viên">
    {visible.map(item=>{const Icon=item.icon;return <button key={item.path||"home"} type="button" className={active(item.path)?"active":""} onClick={()=>go(item.path)}><Icon size={18}/><span>{item.label}</span></button>;})}
   </nav>
   <div className="admin-sidebar-footer">
    <div className="admin-security-status"><span className="admin-status-dot"/><span><strong>Hệ thống đang hoạt động</strong><small>Quyền quản trị toàn hệ thống</small></span></div>
    <button type="button" className={active("profile")?"active":""} onClick={()=>go("profile")}><UserRound size={18}/><span>Cá nhân</span></button>
   </div>
  </aside>
  {mobileSidebarOpen&&<button className="admin-sidebar-backdrop" aria-label="Đóng menu" type="button" onClick={()=>setMobileSidebarOpen(false)}/>} 
  <section className="admin-main">
   <header className="admin-header">
    <div className="admin-header-left"><button className="admin-mobile-menu" type="button" aria-label="Mở menu" onClick={()=>setMobileSidebarOpen(true)}><Menu size={20}/></button><div className="admin-header-title"><strong>KTC Production Control</strong><span>ADMIN CONSOLE</span></div></div>
    <div className="admin-header-actions"><button className="admin-notification" type="button" aria-label="Thông báo" onClick={()=>go("notifications")}><Bell size={19}/>{unreadCount>0&&<b>{unreadCount>9?"9+":unreadCount}</b>}</button><button className="admin-user" type="button" onClick={()=>go("profile")}><span className="admin-user-avatar">{avatarText}</span><span className="admin-user-copy"><strong>{displayName}</strong><small>{roleLabel}</small></span></button></div>
   </header>
   <main className="admin-content"><Outlet/></main>
  </section>
  <nav className="admin-mobile-nav" aria-label="Điều hướng quản trị trên di động">
   {mobileMoreOpen&&<div className="admin-mobile-overflow">{visible.slice(2).map(item=>{const Icon=item.icon;return <button key={`more-${item.path}`} type="button" className={active(item.path)?"active":""} onClick={()=>go(item.path)}><Icon size={18}/><span>{item.label}</span></button>;})}<button type="button" className={active("profile")?"active":""} onClick={()=>go("profile")}><UserRound size={18}/><span>Cá nhân</span></button></div>}
   {visible.slice(0,2).map(item=>{const Icon=item.icon;return <button key={`primary-${item.path}`} type="button" className={active(item.path)?"active":""} onClick={()=>go(item.path)}><Icon size={18}/><span>{item.label.replace(" hệ thống","")}</span></button>;})}
   <button type="button" className={location.pathname.startsWith("/admin/notifications")?"active":""} onClick={()=>go("notifications")}><Bell size={18}/><span>Thông báo</span>{unreadCount>0&&<b className="admin-badge">{unreadCount>99?"99+":unreadCount}</b>}</button>
   <button type="button" className={active("profile")?"active":""} onClick={()=>go("profile")}><UserRound size={18}/><span>Cá nhân</span></button>
   <button type="button" className={mobileMoreOpen?"active":""} onClick={()=>setMobileMoreOpen(open=>!open)}>{mobileMoreOpen?<X size={18}/>:<MoreHorizontal size={18}/>}<span>Thêm</span></button>
  </nav>
 </div>;
}
