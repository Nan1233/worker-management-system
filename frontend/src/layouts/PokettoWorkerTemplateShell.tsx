import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Bell, ClipboardPenLine, History, LogOut, UserRound, Moon, Sun, Home } from "lucide-react";
import { useEffect, useState } from "react";
import { logout } from "../services/authService";
import { usePermissions } from "../hooks/usePermissions";
import { useNotificationBadge } from "../hooks/useNotificationBadge";
import type { PermissionCode } from "../security/permissions";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "../components/poketto/ui/sidebar";

type Item = {
  label: string;
  path: string;
  icon: typeof Bell;
  permission: PermissionCode;
  exact?: boolean;
};

const items: Item[] = [
  { label: "Trang chủ", path: "/worker", icon: Home, permission: "WORKER_ENTRY", exact: true },
  { label: "Nhập báo cáo", path: "/worker/production-template", icon: ClipboardPenLine, permission: "WORKER_ENTRY" },
  { label: "Lịch sử", path: "/worker/history-template", icon: History, permission: "WORKER_HISTORY" },
  { label: "Thông báo", path: "/worker/notifications-template", icon: Bell, permission: "NOTIFICATION_VIEW" },
  { label: "Tài khoản", path: "/worker/profile-template", icon: UserRound, permission: "PROFILE_VIEW" },
];

export default function PokettoWorkerTemplateShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = usePermissions();
  const { unreadCount } = useNotificationBadge(can("NOTIFICATION_VIEW"));
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const visible = items.filter((item) => can(item.permission));
  const active = (item: Item) => item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path);
  const handleLogout = () => { void logout(); navigate("/login", { replace: true }); };

  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-svh w-full bg-background text-foreground">
        <Sidebar variant="inset" collapsible="icon">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" asChild>
                  <button type="button" onClick={() => navigate("/worker")} className="w-full">
                    <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                      <span className="text-sm font-bold">K</span>
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">KTC Production</span>
                      <span className="truncate text-xs text-muted-foreground">Worker workspace</span>
                    </div>
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>

          <SidebarContent>
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground">Workspace</div>
            <SidebarMenu>
              {visible.map((item) => {
                const Icon = item.icon;
                const isActive = active(item);
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.label}
                    >
                      <button type="button" onClick={() => navigate(item.path)} className="relative">
                        <Icon className="size-4" />
                        <span>{item.label}</span>
                        {item.icon === Bell && unreadCount > 0 && (
                          <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        )}
                      </button>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Đăng xuất">
                  <button type="button" onClick={handleLogout}>
                    <LogOut className="size-4" />
                    <span>Đăng xuất</span>
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset>
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-4">
            <SidebarTrigger className="size-8" />
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="size-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/15" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">KTC Production Control</div>
                <div className="truncate text-[11px] text-muted-foreground">Công nhân · Sản xuất</div>
              </div>
            </div>
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-md border bg-background hover:bg-accent"
              aria-label={dark ? "Bật giao diện sáng" : "Bật giao diện tối"}
              onClick={() => setDark((v) => !v)}
            >
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </header>

          <main className="min-h-[calc(100svh-3.5rem)] w-full px-3 pb-24 pt-4 sm:px-5 sm:pb-8 sm:pt-5 md:p-6">
            <div className="mx-auto w-full max-w-7xl">
              <Outlet />
            </div>
          </main>

          <nav className="fixed inset-x-2 bottom-2 z-40 grid grid-cols-4 rounded-xl border bg-background/95 p-1 shadow-lg backdrop-blur md:hidden">
            {visible.map((item) => {
              const Icon = item.icon;
              const isActive = active(item);
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium transition-colors ${isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
                >
                  <span className="relative">
                    <Icon className="size-4" />
                    {item.icon === Bell && unreadCount > 0 && (
                      <span className="absolute -right-2 -top-2 min-w-4 rounded-full bg-destructive px-1 text-center text-[8px] font-bold text-destructive-foreground">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
