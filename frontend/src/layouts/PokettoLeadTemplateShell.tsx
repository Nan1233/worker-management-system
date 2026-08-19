import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Bell, ClipboardCheck, Factory, History, LogOut, Moon, Sun, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { logout } from "../services/authService";
import { usePermissions } from "../hooks/usePermissions";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "../components/poketto/ui/sidebar";

const items = [
  { label: "Tổng quan", path: "/lead", icon: Factory, permission: "DASHBOARD_VIEW", exact: true },
  { label: "Công nhân", path: "/lead/workers", icon: UsersRound, permission: "WORKER_VIEW" },
  { label: "Báo cáo", path: "/lead/reports", icon: ClipboardCheck, permission: "REPORT_VIEW" },
  { label: "Lịch sử", path: "/lead/history", icon: History, permission: "REPORT_VIEW" },
  { label: "Thông báo", path: "/lead/notifications", icon: Bell, permission: "NOTIFICATION_VIEW" },
];

export default function PokettoLeadTemplateShell() {
  const navigate=useNavigate(), location=useLocation();
  const {can}=usePermissions();
  const [dark,setDark]=useState(()=>document.documentElement.classList.contains("dark"));
  useEffect(()=>{ document.documentElement.classList.toggle("dark",dark); },[dark]);
  const visible=items.filter(i=>can(i.permission as never));
  const active=(i:typeof items[number])=>i.exact?location.pathname===i.path:location.pathname.startsWith(i.path);
  const signOut=()=>{void logout();navigate("/login",{replace:true});};

  return <SidebarProvider defaultOpen>
    <div className="min-h-svh w-full bg-background text-foreground">
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader><SidebarMenu><SidebarMenuItem><SidebarMenuButton size="lg" asChild>
          <button type="button" onClick={()=>navigate("/lead")} className="w-full">
            <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><span className="font-bold">K</span></div>
            <div className="grid flex-1 text-left text-sm leading-tight"><span className="truncate font-semibold">KTC Production</span><span className="truncate text-xs text-muted-foreground">Lead workspace</span></div>
          </button>
        </SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarHeader>
        <SidebarContent><div className="px-3 py-2 text-xs font-medium text-muted-foreground">Tổ sản xuất</div><SidebarMenu>
          {visible.map(i=>{const Icon=i.icon;return <SidebarMenuItem key={i.path}><SidebarMenuButton asChild isActive={active(i)} tooltip={i.label}><button type="button" onClick={()=>navigate(i.path)}><Icon className="size-4"/><span>{i.label}</span></button></SidebarMenuButton></SidebarMenuItem>})}
        </SidebarMenu></SidebarContent>
        <SidebarFooter><SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild tooltip="Đăng xuất"><button type="button" onClick={signOut}><LogOut className="size-4"/><span>Đăng xuất</span></button></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-4">
          <SidebarTrigger className="size-8"/>
          <div className="flex min-w-0 flex-1 items-center gap-2"><span className="size-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/15"/><div className="min-w-0"><div className="truncate text-sm font-semibold">KTC Production Control</div><div className="truncate text-[11px] text-muted-foreground">Tổ trưởng · Giám sát sản xuất</div></div></div>
          <button type="button" aria-label="Đổi giao diện" className="inline-flex size-8 items-center justify-center rounded-md border hover:bg-accent" onClick={()=>setDark(v=>!v)}>{dark?<Sun className="size-4"/>:<Moon className="size-4"/>}</button>
        </header>
        <main className="min-h-[calc(100svh-3.5rem)] w-full px-3 pb-8 pt-4 sm:px-5 md:p-6"><div className="mx-auto w-full max-w-7xl"><Outlet/></div></main>
        <nav className="fixed inset-x-2 bottom-2 z-40 grid grid-cols-4 rounded-xl border bg-background/95 p-1 shadow-lg backdrop-blur md:hidden">
          {visible.slice(0,4).map(i=>{const Icon=i.icon;return <button key={i.path} type="button" onClick={()=>navigate(i.path)} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium ${active(i)?"bg-accent text-accent-foreground":"text-muted-foreground"}`}><Icon className="size-4"/><span>{i.label}</span></button>})}
        </nav>
      </SidebarInset>
    </div>
  </SidebarProvider>;
}
