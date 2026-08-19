import {
  BarChart3,
  Bell,
  ChevronRight,
  ClipboardCheck,
  Database,
  Factory,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "../components/poketto/ui/sidebar";
import type { ComponentType, ReactNode } from "react";
import { Button } from "../components/poketto/ui/button";
import { Separator } from "../components/poketto/ui/separator";
import { useNotificationBadge } from "../hooks/useNotificationBadge";
import { usePermissions } from "../hooks/usePermissions";
import { logout } from "../services/authService";
import { getStoredUser } from "../utils/authStorage";
import type { User } from "../types/auth";
import type { PermissionCode } from "../security/permissions";

type Role="worker"|"lead"|"manager"|"admin";
type Item={label:string;path:string;icon:ComponentType<{className?:string}>;permission?:PermissionCode;roles?:Role[]};

const managementItems:Item[]=[
 {label:"Tá»•ng quan",path:"",icon:LayoutDashboard,permission:"DASHBOARD_VIEW"},
 {label:"Chá» duyá»‡t",path:"reports",icon:ClipboardCheck,permission:"REPORT_PENDING_VIEW"},
 {label:"ÄÃ£ duyá»‡t",path:"approved",icon:ShieldCheck,permission:"REPORT_APPROVED_VIEW"},
 {label:"Thá»‘ng kÃª",path:"statistics",icon:BarChart3,permission:"STATISTICS_VIEW"},
 {label:"NhÃ¢n sá»±",path:"workers",icon:Users,permission:"USER_VIEW"},
 {label:"Xuáº¥t bÃ¡o cÃ¡o",path:"export",icon:FileSpreadsheet,permission:"REPORT_EXPORT"},
 {label:"Dá»¯ liá»‡u chuáº©n",path:"master/processes",icon:Database,permission:"MASTER_VIEW"},
 {label:"CÃ´ng thá»©c",path:"formulas",icon:Settings2,permission:"FORMULA_VIEW"},
 {label:"Quáº£n trá»‹ dá»¯ liá»‡u",path:"governance",icon:Database,permission:"GOVERNANCE_VIEW"},
 {label:"Vai trÃ² & quyá»n",path:"permissions",icon:ShieldCheck,permission:"PERMISSION_MANAGE"},
 {label:"Há»‡ thá»‘ng",path:"system",icon:Settings2,permission:"NOTIFICATION_VIEW"},
];
const workerItems:Item[]=[
 {label:"Nháº­p sáº£n xuáº¥t",path:"",icon:Factory,permission:"WORKER_ENTRY"},
 {label:"Lá»‹ch sá»­",path:"history",icon:ClipboardCheck,permission:"WORKER_HISTORY"},
 {label:"ThÃ´ng bÃ¡o",path:"system",icon:Bell,permission:"NOTIFICATION_VIEW"},
 {label:"Há»“ sÆ¡",path:"profile",icon:Users,permission:"PROFILE_VIEW"},
];
const roleLabel:Record<Role,string>={worker:"CÃ´ng nhÃ¢n",lead:"Tá»• trÆ°á»Ÿng",manager:"Quáº£n lÃ½",admin:"Quáº£n trá»‹ viÃªn"};

export default function PokettoRealTemplateShell({role,children}:{role:Role;children:ReactNode}){
 const nav=useNavigate(),loc=useLocation(),user=getStoredUser() as User|null;
 const {can}=usePermissions();
 const {unreadCount}=useNotificationBadge(can("NOTIFICATION_VIEW"));
 const base=role==="worker"?"/worker":role==="lead"?"/lead":role==="manager"?"/manager":"/admin";
 const items=(role==="worker"?workerItems:managementItems).filter(i=>!i.roles||i.roles.includes(role)).filter(i=>!i.permission||can(i.permission));
 const active=(path:string)=>path===""?loc.pathname===base:loc.pathname===`${base}/${path}`||loc.pathname.startsWith(`${base}/${path}/`);
 const signOut=async()=>{await logout();nav("/login",{replace:true});};
 return <SidebarProvider defaultOpen storage="local">
  <Sidebar variant="inset" collapsible="icon">
   <SidebarHeader>
    <SidebarMenu><SidebarMenuItem><SidebarMenuButton size="lg" asChild>
     <button type="button" onClick={()=>nav(base)}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-bold">K</span>
      <span className="grid flex-1 text-left text-sm leading-tight"><span className="truncate font-semibold">KTC (HANOI) CO., LTD</span><span className="truncate text-xs text-muted-foreground">{roleLabel[role]}</span></span>
     </button>
    </SidebarMenuButton></SidebarMenuItem></SidebarMenu>
   </SidebarHeader>
   <SidebarSeparator className="mx-2 w-auto"/>
   <SidebarContent>
    <div className="px-3 py-2 text-xs font-medium text-sidebar-foreground/60">Workspace</div>
    <SidebarMenu>
     {items.map(({label,path,icon:Icon})=><SidebarMenuItem key={path||"home"}>
      <SidebarMenuButton asChild isActive={active(path)} tooltip={label}>
       <button type="button" onClick={()=>nav(`${base}${path?`/${path}`:""}`)}><Icon className="size-4"/><span>{label}</span>{label==="Há»‡ thá»‘ng"&&unreadCount>0?<span className="ml-auto rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">{unreadCount>99?"99+":unreadCount}</span>:null}</button>
      </SidebarMenuButton>
     </SidebarMenuItem>)}
    </SidebarMenu>
   </SidebarContent>
   <SidebarFooter>
    <SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild tooltip="ÄÄƒng xuáº¥t">
     <button type="button" onClick={signOut}><LogOut className="size-4"/><span>ÄÄƒng xuáº¥t</span></button>
    </SidebarMenuButton></SidebarMenuItem></SidebarMenu>
   </SidebarFooter>
  </Sidebar>
  <SidebarInset className="min-w-0">
   <header className="sticky top-0 z-20 flex h-14 w-full shrink-0 items-center gap-2 border-b bg-background/80 px-2 backdrop-blur-sm sm:h-16 sm:px-4">
    <SidebarTrigger className="-ml-0.5"/>
    <Separator orientation="vertical" className="mr-1 hidden h-4 sm:block"/>
    <div className="hidden min-w-0 items-center gap-1 text-sm md:flex"><span className="truncate text-muted-foreground">KTC</span><ChevronRight className="size-3.5 text-muted-foreground"/><span className="font-medium">{roleLabel[role]}</span></div>
    <div className="ml-auto flex items-center gap-1 sm:gap-2"><span className="hidden rounded-md border bg-muted/40 px-2 py-1 text-xs font-medium sm:inline-flex">{user?.full_name||user?.username||roleLabel[role]}</span>{unreadCount>0&&<Button variant="ghost" size="icon" onClick={()=>nav(`${base}/system`)} aria-label="ThÃ´ng bÃ¡o"><Bell className="size-4"/></Button>}</div>
   </header>
   <main className="min-w-0 flex-1 bg-background"><div className="mx-auto w-full max-w-[1440px] p-4 sm:p-6 lg:p-8">{children}</div></main>
  </SidebarInset>
 </SidebarProvider>;
}

