
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3, Bell, ClipboardCheck, Database, FileSpreadsheet, LayoutDashboard,
  LogOut, Settings2, ShieldCheck, Users,
} from "lucide-react";
import { logout } from "../services/authService";
import { getStoredUser } from "../utils/authStorage";
import { useNotificationBadge } from "../hooks/useNotificationBadge";
import { usePermissions } from "../hooks/usePermissions";
import type { PermissionCode } from "../security/permissions";
import "./ManagementLayout.css";

type ManagementRole = "lead" | "manager" | "admin";

const items: { label: string; path: string; icon: typeof LayoutDashboard; permission?: PermissionCode }[] = [
  { label: "Tổng quan", path: "", icon: LayoutDashboard, permission: "DASHBOARD_VIEW" },
  { label: "Chờ duyệt", path: "reports", icon: ClipboardCheck, permission: "REPORT_PENDING_VIEW" },
  { label: "Đã duyệt", path: "approved", icon: ShieldCheck, permission: "REPORT_APPROVED_VIEW" },
  { label: "Thống kê", path: "statistics", icon: BarChart3, permission: "STATISTICS_VIEW" },
  { label: "Nhân sự", path: "workers", icon: Users, permission: "USER_VIEW" },
  { label: "Xuất báo cáo", path: "export", icon: FileSpreadsheet, permission: "REPORT_EXPORT" },
  { label: "Dữ liệu chuẩn", path: "master/processes", icon: Database, permission: "MASTER_VIEW" },
  { label: "Công thức", path: "formulas", icon: Settings2, permission: "FORMULA_VIEW" },
  { label: "Quản trị dữ liệu", path: "governance", icon: Database, permission: "GOVERNANCE_VIEW" },
  { label: "Vai trò & quyền", path: "permissions", icon: ShieldCheck, permission: "PERMISSION_MANAGE" },
  { label: "Hệ thống", path: "system", icon: Bell, permission: "NOTIFICATION_VIEW" },
];

const roleLabel: Record<ManagementRole, string> = {
  lead: "Tổ trưởng",
  manager: "Quản lý",
  admin: "Quản trị viên",
};

export default function ManagementLayout({ role }: { role: ManagementRole }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = usePermissions();
  const { unreadCount } = useNotificationBadge(can("NOTIFICATION_VIEW"));
  const base = `/${role}`;
  const user = getStoredUser();
  const visible = items.filter((item) => !item.permission || can(item.permission));

  const active = (path: string) =>
    path === "" ? location.pathname === base : location.pathname === `${base}/${path}` || location.pathname.startsWith(`${base}/${path}/`);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="management-layout">
      <aside className="management-sidebar">
        <button className="management-brand" type="button" onClick={() => navigate(base)}>
          <span className="management-brand-mark">K</span>
          <span><strong>KTC (HANOI) CO., LTD</strong><small>{roleLabel[role]}</small></span>
        </button>
        <nav className="management-menu" aria-label="Management navigation">
          {visible.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.path || "home"} type="button" className={active(item.path) ? "active" : ""} onClick={() => navigate(`${base}${item.path ? `/${item.path}` : ""}`)}>
                <Icon size={18} />
                <span>{item.label}</span>
                {item.label === "Hệ thống" && unreadCount > 0 && <b className="management-badge">{unreadCount > 99 ? "99+" : unreadCount}</b>}
              </button>
            );
          })}
        </nav>
        <button className="management-logout" type="button" onClick={() => void handleLogout()}><LogOut size={18}/><span>Đăng xuất</span></button>
      </aside>

      <section className="management-main">
        <header className="management-header">
          <div><strong>KTC Production Control</strong><span>{roleLabel[role]}</span></div>
          <div className="management-user">{user?.full_name || user?.username || roleLabel[role]}</div>
        </header>
        <main className="management-content"><Outlet /></main>
      </section>

      <nav className="management-mobile-nav" aria-label="Mobile navigation">
        {visible.slice(0, 5).map((item) => {
          const Icon = item.icon;
          return <button key={`mobile-${item.path}`} type="button" className={active(item.path) ? "active" : ""} onClick={() => navigate(`${base}${item.path ? `/${item.path}` : ""}`)}><Icon size={18}/><span>{item.label}</span></button>;
        })}
      </nav>
    </div>
  );
}
