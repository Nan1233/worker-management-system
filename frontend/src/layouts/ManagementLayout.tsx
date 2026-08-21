import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Bell, ChevronDown, ClipboardCheck, Database, FileSpreadsheet, LayoutDashboard,
  LogOut, MoreHorizontal, Settings2, ShieldCheck, Users,
} from "lucide-react";
import { logout } from "../services/authService";
import { getStoredUser } from "../utils/authStorage";
import { useNotificationBadge } from "../hooks/useNotificationBadge";
import { usePermissions } from "../hooks/usePermissions";
import type { PermissionCode } from "../security/permissions";
import "./ManagementLayout.css";

type ManagementRole = "lead" | "manager" | "admin";

type ManagementMenuItem = {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  permission: PermissionCode;
  roles: ManagementRole[];
};

const allManagementRoles: ManagementRole[] = ["lead", "manager", "admin"];
const adminAndManagerRoles: ManagementRole[] = ["manager", "admin"];

const items: ManagementMenuItem[] = [
  { label: "Tổng quan", path: "", icon: LayoutDashboard, permission: "DASHBOARD_VIEW", roles: allManagementRoles },
  { label: "Chờ duyệt", path: "reports", icon: ClipboardCheck, permission: "REPORT_PENDING_VIEW", roles: allManagementRoles },
  { label: "Đã duyệt", path: "approved", icon: ShieldCheck, permission: "REPORT_APPROVED_VIEW", roles: allManagementRoles },
  { label: "Nhân sự", path: "workers", icon: Users, permission: "USER_VIEW", roles: allManagementRoles },
  { label: "Xuất báo cáo", path: "export", icon: FileSpreadsheet, permission: "REPORT_EXPORT", roles: allManagementRoles },
  { label: "Dữ liệu chuẩn", path: "master/processes", icon: Database, permission: "MASTER_VIEW", roles: adminAndManagerRoles },
  { label: "Công thức", path: "formulas", icon: Settings2, permission: "FORMULA_VIEW", roles: adminAndManagerRoles },
  { label: "Quản trị dữ liệu", path: "governance", icon: Database, permission: "GOVERNANCE_VIEW", roles: adminAndManagerRoles },
  { label: "Vai trò & quyền", path: "permissions", icon: ShieldCheck, permission: "PERMISSION_MANAGE", roles: ["admin"] },
  { label: "Hệ thống", path: "system", icon: Bell, permission: "NOTIFICATION_VIEW", roles: allManagementRoles },
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
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const visible = items.filter((item) => item.roles.includes(role) && can(item.permission));
  const mobilePrimaryItems = visible.slice(0, 4);
  const mobileOverflowItems = visible.slice(4);

  const active = (path: string) =>
    path === "" ? location.pathname === base : location.pathname === `${base}/${path}` || location.pathname.startsWith(`${base}/${path}/`);

  const handleLogout = () => {
    void logout();
    navigate("/login", { replace: true });
  };

  const displayName = user?.full_name || user?.username || roleLabel[role];
  const avatarText = displayName.trim().charAt(0).toUpperCase() || "K";

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
          <div className="management-header-title"><strong>KTC Production Control</strong><span>{roleLabel[role]}</span></div>
          <div className="management-header-actions">
            <button className="management-notification" type="button" aria-label="Thông báo" onClick={() => navigate(`${base}/system`)}>
              <Bell size={19} />
              {unreadCount > 0 && <b>{unreadCount > 9 ? "9+" : unreadCount}</b>}
            </button>
            <button className="management-user" type="button" aria-label="Tài khoản người dùng">
              <span className="management-user-avatar">{avatarText}</span>
              <span className="management-user-copy"><strong>{displayName}</strong><small>{roleLabel[role]}</small></span>
              <ChevronDown size={16} />
            </button>
          </div>
        </header>
        <main className="management-content"><Outlet /></main>
      </section>

      <nav className="management-mobile-nav" aria-label="Mobile navigation">
        {mobileMoreOpen && mobileOverflowItems.length > 0 && (
          <div id="management-mobile-overflow" className="management-mobile-overflow" aria-label="Các mục điều hướng khác">
            {mobileOverflowItems.map((item) => {
              const Icon = item.icon;
              return <button key={`overflow-${item.path}`} type="button" className={active(item.path) ? "active" : ""} onClick={() => { setMobileMoreOpen(false); navigate(`${base}${item.path ? `/${item.path}` : ""}`); }}><Icon size={18}/><span>{item.label}</span></button>;
            })}
          </div>
        )}
        {mobilePrimaryItems.map((item) => {
          const Icon = item.icon;
          return <button key={`mobile-${item.path}`} type="button" className={active(item.path) ? "active" : ""} onClick={() => navigate(`${base}${item.path ? `/${item.path}` : ""}`)}><Icon size={18}/><span>{item.label}</span></button>;
        })}
        {mobileOverflowItems.length > 0 && <button type="button" className={mobileMoreOpen ? "active" : ""} onClick={() => setMobileMoreOpen((open) => !open)} aria-expanded={mobileMoreOpen} aria-controls="management-mobile-overflow"><MoreHorizontal size={18}/><span>Thêm</span></button>}
      </nav>
    </div>
  );
}
