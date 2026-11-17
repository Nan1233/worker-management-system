import { useEffect, useState } from "react";
import { Bell, Boxes, ClipboardCheck, Cog, Download, FileWarning, LayoutDashboard, MoreHorizontal, ShieldCheck, Timer, UserRound, Users, BarChart3, LogOut, CalendarDays, ChevronDown, Layers3 } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { getStoredUser } from "../utils/authStorage";
import { logout } from "../services/authService";
import { useNotificationBadge } from "../hooks/useNotificationBadge";
import { usePermissions } from "../hooks/usePermissions";
import type { PermissionCode } from "../security/permissions";
import MasterDataTransferActions from "../components/master/MasterDataTransferActions";
import "./ManagementLayout.css";
import "./ManagementNavigation.css";
import "../styles/HideManagementPageDescriptions.css";

type ManagementRole = "lead" | "manager" | "admin_ops" | "admin";
type ManagementMenuItem = { label:string; path:string; icon:typeof LayoutDashboard; permission:PermissionCode; roles:ManagementRole[] };
const allManagementRoles:ManagementRole[]=["lead","manager","admin_ops","admin"];
const managementRoles:ManagementRole[]=["lead","manager","admin_ops","admin"];
const adminRoles:ManagementRole[]=["manager","admin"];
const items:ManagementMenuItem[]=[
 {label:"Tổng quan",path:"",icon:LayoutDashboard,permission:"DASHBOARD_VIEW",roles:allManagementRoles},
 {label:"Chờ duyệt",path:"reports",icon:ClipboardCheck,permission:"REPORT_PENDING_VIEW",roles:allManagementRoles},
 {label:"Đã duyệt",path:"approved",icon:ShieldCheck,permission:"REPORT_APPROVED_VIEW",roles:allManagementRoles},
 {label:"Tất cả báo cáo",path:"report-management",icon:BarChart3,permission:"REPORT_APPROVED_VIEW",roles:["manager"]},
 {label:"Theo dõi công đoạn",path:"processes",icon:Layers3,permission:"STATISTICS_VIEW",roles:allManagementRoles},
 {label:"Thống kê sản xuất",path:"statistics",icon:BarChart3,permission:"STATISTICS_VIEW",roles:allManagementRoles},
 {label:"Nhân sự",path:"workers",icon:Users,permission:"USER_VIEW",roles:allManagementRoles},
 {label:"Máy móc",path:"master/machines",icon:Cog,permission:"MASTER_VIEW",roles:managementRoles},
 {label:"Sản phẩm & định mức",path:"master/standards",icon:Boxes,permission:"MASTER_VIEW",roles:managementRoles},
 {label:"Danh mục lỗi NG",path:"master/defects",icon:FileWarning,permission:"MASTER_VIEW",roles:adminRoles},
 {label:"Quy tắc trừ giờ",path:"master/deductions",icon:Timer,permission:"MASTER_VIEW",roles:managementRoles},
 {label:"Xuất báo cáo Excel",path:"export",icon:Download,permission:"REPORT_EXPORT",roles:allManagementRoles},
 {label:"Vai trò & quyền",path:"permissions",icon:ShieldCheck,permission:"PERMISSION_MANAGE",roles:["admin"]}
];
const navGroups=[
 {title:"TỔNG QUAN",paths:[""]},
 {title:"BÁO CÁO SẢN XUẤT",paths:["reports","approved","report-management"]},
 {title:"HIỆU SUẤT",paths:["processes","statistics"]},
 {title:"NGUỒN LỰC",paths:["workers","master/machines"]},
 {title:"DANH MỤC & QUY CHUẨN",paths:["master/standards","master/defects","master/deductions"]},
 {title:"BÁO CÁO & HỆ THỐNG",paths:["export","permissions"]}
] as const;
const roleLabel:Record<ManagementRole,string>={lead:"Tổ trưởng",manager:"Quản lý",admin_ops:"Quản trị vận hành",admin:"Quản trị viên"};

export default function ManagementLayout({role}:{role:ManagementRole}){
 const navigate=useNavigate(),location=useLocation(); const {can}=usePermissions();
 const {unreadCount}=useNotificationBadge(can("NOTIFICATION_VIEW")); const base=`/${role}`,user=getStoredUser();
 const [mobileMoreOpen,setMobileMoreOpen]=useState(false);
 const visible=items.filter(item=>item.roles.includes(role)&&can(item.permission));
 const mobileHome=visible.find(item=>item.path==="");
 const mobilePending=visible.find(item=>item.path==="reports");
 const mobileOverflowItems=visible.filter(item=>item.path!==""&&item.path!=="reports");
 const active=(path:string)=>path===""?location.pathname===base:location.pathname===`${base}/${path}`||location.pathname.startsWith(`${base}/${path}/`);
 const notificationsActive=location.pathname===`${base}/notifications`||location.pathname.startsWith(`${base}/notifications/`);
 const displayName=user?.full_name||user?.username||roleLabel[role];
 const avatarText=displayName.trim().charAt(0).toUpperCase()||"K";
 const handleLogout=()=>{setMobileMoreOpen(false);void logout();navigate("/login",{replace:true});};
 useEffect(()=>{setMobileMoreOpen(false)},[location.pathname]);
 useEffect(()=>{
  if(!mobileMoreOpen)return;
  const onKeyDown=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();setMobileMoreOpen(false)}};
  document.addEventListener("keydown",onKeyDown);
  return()=>document.removeEventListener("keydown",onKeyDown);
 },[mobileMoreOpen]);
 useEffect(()=>{if(role!=="manager")return;const forbiddenMasterPath=/^\/manager\/master\/(users|processes)(?:\/|$)/.test(location.pathname);if(forbiddenMasterPath)navigate(`${base}/master/machines`,{replace:true});},[role,location.pathname,navigate,base]);
 const today=new Intl.DateTimeFormat("vi-VN",{weekday:"short",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date()).replace(/^./,m=>m.toUpperCase());
 return <div className="management-layout" data-management-role={role}>
  <aside className="management-sidebar">
   <div className="management-sidebar-brand"><img src="/ktc-hanoi-logo.png" alt="KTC HANOI" /></div>
   <nav className="management-menu" aria-label="Điều hướng quản lý">
    {navGroups.map(group=>{const groupItems=visible.filter(item=>(group.paths as readonly string[]).includes(item.path));return groupItems.length?<section className="management-nav-group" key={group.title}><div className="management-nav-group-title">{group.title}</div>{groupItems.map(item=>{const Icon=item.icon;return <button key={item.path||"home"} type="button" className={active(item.path)?"active":""} aria-current={active(item.path)?"page":undefined} onClick={()=>navigate(base+(item.path?"/"+item.path:""))}><Icon size={18}/><span>{item.label}</span></button>;})}</section>:null;})}
   </nav>
   <div className="management-sidebar-account">
    <button type="button" className={active("profile")?"active":""} onClick={()=>navigate(`${base}/profile`)}><UserRound size={18}/><span>Tài khoản</span></button>
    <button type="button" className="management-logout" onClick={handleLogout}><LogOut size={18}/><span>Đăng xuất</span></button>
   </div>
   <div className="management-sidebar-footer"><strong>KTC (HANOI) CO., LTD</strong><span>Production Management System</span><small>v1.0.0</small></div>
  </aside>
  <section className="management-main">
   <header className="management-header">
    <div className="management-header-context"><strong>KTC Production Management</strong><span>{roleLabel[role]}</span></div>
    <div className="management-header-actions">
     <div className="management-date"><CalendarDays size={17}/><span>{today}</span></div>
     {can("NOTIFICATION_VIEW")&&<button className={`management-notification ${notificationsActive?"active":""}`} type="button" aria-label="Thông báo" onClick={()=>navigate(`${base}/notifications`)}><Bell size={20}/>{unreadCount>0&&<b>{unreadCount>9?"9+":unreadCount}</b>}</button>}
     <button className="management-user" type="button" aria-label="Mở trang cá nhân" onClick={()=>navigate(`${base}/profile`)}><span className="management-user-avatar">{avatarText}</span><span className="management-user-copy"><strong>{displayName}</strong><small>{roleLabel[role]}</small></span><ChevronDown size={16}/></button>
    </div>
   </header>
   <main className="management-content"><MasterDataTransferActions/><Outlet/></main>
  </section>
  {mobileMoreOpen&&<button className="management-mobile-dismiss" type="button" aria-label="Đóng menu điều hướng" onClick={()=>setMobileMoreOpen(false)}/>}
  <nav className="management-mobile-nav" aria-label="Điều hướng nhanh">
   {mobileHome&&<button type="button" className={active("")?"active":""} aria-current={active("")?"page":undefined} onClick={()=>navigate(base)}><LayoutDashboard size={18}/><span>Tổng quan</span></button>}
   {mobilePending&&<button type="button" className={active("reports")?"active":""} aria-current={active("reports")?"page":undefined} onClick={()=>navigate(`${base}/reports`)}><ClipboardCheck size={18}/><span>Chờ duyệt</span></button>}
   {can("NOTIFICATION_VIEW")&&<button type="button" className={notificationsActive?"active":""} aria-current={notificationsActive?"page":undefined} onClick={()=>navigate(`${base}/notifications`)}><Bell size={18}/><span>Thông báo</span>{unreadCount>0&&<b className="management-badge">{unreadCount>99?"99+":unreadCount}</b>}</button>}
   <button type="button" className={active("profile")?"active":""} aria-current={active("profile")?"page":undefined} onClick={()=>navigate(`${base}/profile`)}><UserRound size={18}/><span>Cá nhân</span></button>
   <button type="button" className={mobileMoreOpen?"active":""} onClick={()=>setMobileMoreOpen(open=>!open)} aria-expanded={mobileMoreOpen} aria-controls={mobileMoreOpen?"management-mobile-overflow":undefined}><MoreHorizontal size={18}/><span>Thêm</span></button>
   {mobileMoreOpen&&<div id="management-mobile-overflow" className="management-mobile-overflow" aria-label="Các mục điều hướng khác">{mobileOverflowItems.map(item=>{const Icon=item.icon;return <button key={`overflow-${item.path}`} type="button" className={active(item.path)?"active":""} onClick={()=>{setMobileMoreOpen(false);navigate(`${base}/${item.path}`);}}><Icon size={17}/><span>{item.label}</span></button>;})}<button type="button" className="management-mobile-overflow-logout" onClick={handleLogout}><LogOut size={17}/><span>Đăng xuất</span></button></div>}
  </nav>
 </div>;
}
