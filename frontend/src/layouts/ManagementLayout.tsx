import { Outlet, useLocation, useNavigate } from "react-router-dom";
import type { User } from "../types/auth";
import { getStoredUser } from "../utils/authStorage";
import { logout } from "../services/authService";
import { useNotificationBadge } from "../hooks/useNotificationBadge";
import { usePermissions } from "../hooks/usePermissions";
import type { PermissionCode } from "../security/permissions";
import {
  BarChart3,
  Bell,
  ClipboardCheck,
  Database,
  Download,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
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

type ManagementRole = "lead" | "manager" | "admin";

type MenuItem = {
  id: string;
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  permission: PermissionCode;
};

const menuItems: MenuItem[] = [
  { id: "dashboard", label: "Tổng quan", path: "", icon: LayoutDashboard, permission: "DASHBOARD_VIEW" },
  { id: "reports", label: "Chờ duyệt", path: "reports", icon: ClipboardCheck, permission: "REPORT_PENDING_VIEW" },
  { id: "approved", label: "Đã duyệt", path: "approved", icon: ShieldCheck, permission: "REPORT_APPROVED_VIEW" },
  { id: "export", label: "Xuất báo cáo", path: "export", icon: Download, permission: "REPORT_EXPORT" },
  { id: "statistics", label: "Thống kê", path: "statistics", icon: BarChart3, permission: "STATISTICS_VIEW" },
  { id: "workers", label: "Nhân sự", path: "workers", icon: Users, permission: "USER_VIEW" },
  { id: "master", label: "Dữ liệu chuẩn", path: "master", icon: Database, permission: "MASTER_VIEW" },
  { id: "formulas", label: "Công thức", path: "formulas", icon: FileSpreadsheet, permission: "FORMULA_VIEW" },
  { id: "governance", label: "Quản trị dữ liệu", path: "governance", icon: ShieldCheck, permission: "GOVERNANCE_VIEW" },
  { id: "permissions", label: "Vai trò & quyền", path: "permissions", icon: ShieldCheck, permission: "PERMISSION_MANAGE" },
  { id: "system", label: "Hệ thống", path: "system", icon: Settings2, permission: "NOTIFICATION_VIEW" },
];

const roleLabel: Record<ManagementRole, string> = { lead: "Tổ trưởng", manager: "Quản lý", admin: "Quản trị viên" };

function ManagementLayout({ role }: { role: ManagementRole }) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getStoredUser() as User | null;
  const { can } = usePermissions();
  const { unreadCount } = useNotificationBadge(can("NOTIFICATION_VIEW"));
  const basePath = role === "lead" ? "/lead" : role === "admin" ? "/admin" : "/manager";
  const visible = menuItems.filter((item) => can(item.permission));
  const current = (item: MenuItem) => {
    const full = item.path ? `${basePath}/${item.path}` : basePath;
    return item.path === "" ? location.pathname === basePath : location.pathname.startsWith(full);
  };
  const go = (path: string) => navigate(path ? `${basePath}/${path}` : basePath);
  const handleLogout = () => { void logout(); navigate("/login", { replace: true }); };

  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-svh w-full bg-background text-foreground">
        <Sidebar variant="inset" collapsible="icon">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" asChild>
                  <button type="button" onClick={() => go("")} className="w-full">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                      <span className="text-sm font-bold">K</span>
                    </div>
                    <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">KTC Production</span>
                      <span className="truncate text-xs text-muted-foreground">{roleLabel[role]}</span>
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
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton asChild isActive={current(item)} tooltip={item.label}>
                      <button type="button" onClick={() => go(item.path)} className="relative">
                        <Icon className="size-4" />
                        <span>{item.label}</span>
                        {item.id === "system" && unreadCount > 0 && (
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

          <SidebarSeparator />
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Đăng xuất" asChild>
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
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">KTC Production Control</div>
              <div className="truncate text-[11px] text-muted-foreground">
                {roleLabel[role]}{user?.username ? ` · ${user.username}` : ""}
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate(`${basePath}/system`)}
              className="relative inline-flex size-8 items-center justify-center rounded-md border bg-background hover:bg-accent"
              aria-label="Thông báo"
            >
              <Bell className="size-4" />
              {unreadCount > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">{unreadCount > 9 ? "9+" : unreadCount}</span>}
            </button>
          </header>

          <main className="min-h-[calc(100svh-3.5rem)] w-full px-3 pb-8 pt-4 sm:px-5 sm:pt-5 md:p-6">
            <div className="mx-auto w-full max-w-7xl"><Outlet /></div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export default ManagementLayout;
