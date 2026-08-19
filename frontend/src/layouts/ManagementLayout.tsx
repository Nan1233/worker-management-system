import { Outlet, useLocation, useNavigate } from "react-router-dom";
import type { User } from "../types/auth";
import AppIcon, { type IconName } from "../components/common/AppIcon";
import { getStoredUser } from "../utils/authStorage";
import { logout } from "../services/authService";
import { useNotificationBadge } from "../hooks/useNotificationBadge";
import { usePermissions } from "../hooks/usePermissions";
import type { PermissionCode } from "../security/permissions";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "../components/poketto/ui/sidebar";

type ManagementRole = "lead" | "manager" | "admin";
interface Props { role: ManagementRole; }
interface MenuItem {
  id:string; label:string; path:string; icon:IconName; roles:ManagementRole[];
  description:string; permission:PermissionCode; group:"VẬN HÀNH"|"BÁO CÁO"|"DỮ LIỆU"|"HỆ THỐNG";
}
const menuItems: MenuItem[] = [
 {id:"dashboard",label:"Tổng quan",path:"",icon:"dashboard",roles:["lead","manager","admin"],description:"",permission:"DASHBOARD_VIEW",group:"VẬN HÀNH"},
 {id:"reports",label:"Chờ duyệt",path:"reports",icon:"pending",roles:["lead","manager","admin"],description:"",permission:"REPORT_PENDING_VIEW",group:"VẬN HÀNH"},
 {id:"approved",label:"Đã duyệt",path:"approved",icon:"approved",roles:["lead","manager","admin"],description:"",permission:"REPORT_APPROVED_VIEW",group:"VẬN HÀNH"},
 {id:"export",label:"Xuất báo cáo",path:"export",icon:"download",roles:["admin"],description:"",permission:"REPORT_EXPORT",group:"BÁO CÁO"},
 {id:"statistics",label:"Thống kê",path:"statistics",icon:"statistics",roles:["lead","manager","admin"],description:"",permission:"STATISTICS_VIEW",group:"BÁO CÁO"},
 {id:"workers",label:"Nhân sự",path:"workers",icon:"workers",roles:["lead","manager","admin"],description:"",permission:"USER_VIEW",group:"DỮ LIỆU"},
 {id:"master",label:"Dữ liệu chuẩn",path:"master",icon:"settings",roles:["manager","admin"],description:"",permission:"MASTER_VIEW",group:"DỮ LIỆU"},
 {id:"formulas",label:"Công thức",path:"formulas",icon:"checklist",roles:["manager","admin"],description:"",permission:"FORMULA_VIEW",group:"DỮ LIỆU"},
 {id:"governance",label:"Quản trị dữ liệu",path:"governance",icon:"sheet",roles:["manager","admin"],description:"",permission:"GOVERNANCE_VIEW",group:"DỮ LIỆU"},
 {id:"permissions",label:"Vai trò & quyền",path:"permissions",icon:"user",roles:["admin"],description:"",permission:"PERMISSION_MANAGE",group:"HỆ THỐNG"},
 {id:"system",label:"Hệ thống",path:"system",icon:"system",roles:["lead","manager","admin"],description:"",permission:"NOTIFICATION_VIEW",group:"HỆ THỐNG"}
];
const roleLabel:Record<ManagementRole,string>={lead:"Tổ trưởng",manager:"Quản lý",admin:"Quản trị viên"};
function getInitials(user:User|null){const text=(user?.full_name||user?.username||"KTC").trim();const parts=text.split(/\s+/).filter(Boolean);return (parts.length>=2?`${parts[0][0]??""}${parts[parts.length-1][0]??""}`:text.slice(0,2)).toUpperCase();}
function formatToday(){return new Date().toLocaleDateString("vi-VN",{weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"});}

export default function ManagementLayout({role}:Props){
 const navigate=useNavigate(),location=useLocation(),user=getStoredUser() as User|null;
 const {can}=usePermissions(),{unreadCount}=useNotificationBadge(can("NOTIFICATION_VIEW"));
 const basePath=role==="lead"?"/lead":role==="admin"?"/admin":"/manager";
 const visible=menuItems.filter(i=>i.roles.includes(role)&&can(i.permission));
 const full=(p:string)=>p?`${basePath}/${p}`:basePath;
 const active=(i:MenuItem)=>i.path===""?location.pathname===basePath:i.id==="reports"?location.pathname===`${basePath}/reports`:i.id==="approved"?location.pathname===`${basePath}/approved`:location.pathname.startsWith(full(i.path));
 const signOut=()=>{void logout();navigate("/login",{replace:true});};

 return <SidebarProvider defaultOpen>
  <div className="min-h-svh w-full bg-background text-foreground">
   <Sidebar variant="inset" collapsible="icon">
    <SidebarHeader><SidebarMenu><SidebarMenuItem><SidebarMenuButton size="lg" asChild>
      <button type="button" onClick={()=>navigate(basePath)} className="w-full">
       <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><span className="font-bold">K</span></div>
       <div className="grid flex-1 text-left text-sm leading-tight"><span className="truncate font-semibold">KTC (HANOI) CO., LTD</span><span className="truncate text-xs text-muted-foreground">{roleLabel[role]} · Production Control</span></div>
      </button>
    </SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarHeader>

    <SidebarContent>
     <div className="px-3 py-2 text-xs font-medium text-muted-foreground">Workspace</div>
     <SidebarMenu>
      {visible.map((item,index)=>{const Icon=()=> <AppIcon name={item.icon} size={17}/>; const groupStart=index===0||visible[index-1]?.group!==item.group; return <SidebarMenuItem key={item.id}>
       {groupStart&&<div className="px-3 pb-1 pt-2 text-[10px] font-semibold tracking-wide text-muted-foreground">{item.group}</div>}
       <SidebarMenuButton asChild isActive={active(item)} tooltip={item.label}>
        <button type="button" onClick={()=>navigate(full(item.path))}>
         <Icon/>
         <span>{item.label}</span>
         {item.id==="system"&&unreadCount>0&&<span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">{unreadCount>99?"99+":unreadCount}</span>}
        </button>
       </SidebarMenuButton>
      </SidebarMenuItem>})}
     </SidebarMenu>
    </SidebarContent>

    <SidebarFooter><SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild tooltip="Đăng xuất">
     <button type="button" onClick={signOut}><AppIcon name="logout" size={17}/><span>Đăng xuất</span></button>
    </SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarFooter>
   </Sidebar>

   <SidebarInset>
    <header className="sticky top-0 z-30 flex min-h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-4">
     <SidebarTrigger className="size-8"/>
     <div className="min-w-0 flex-1"><div className="truncate text-xs text-muted-foreground">KTC (HANOI) CO., LTD</div><div className="truncate text-sm font-semibold">{role==="lead"?"Bảng điều hành tổ trưởng":role==="admin"?"Bảng điều hành quản trị":"Bảng điều hành quản lý"}</div></div>
     <div className="hidden items-center gap-2 sm:flex"><span className="rounded-full border px-2.5 py-1 text-xs font-medium">{roleLabel[role]}</span><span className="text-xs text-muted-foreground">{formatToday()}</span><span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{getInitials(user)}</span></div>
    </header>
    <main className="min-h-[calc(100svh-3.5rem)] w-full px-3 pb-8 pt-4 sm:px-5 md:p-6"><div className="mx-auto w-full max-w-7xl"><Outlet/></div></main>
   </SidebarInset>
  </div>
 </SidebarProvider>;
}
