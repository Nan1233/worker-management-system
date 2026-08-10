import { Outlet, useLocation, useNavigate } from "react-router-dom";
import type { User } from "../types/auth";
import AppIcon, { type IconName } from "../components/common/AppIcon";
import "./ManagementLayout.css";
import { clearAuthSession, getStoredUser } from "../utils/authStorage";
import { useNotificationBadge } from "../hooks/useNotificationBadge";
import { usePermissions } from "../hooks/usePermissions";
import type { PermissionCode } from "../security/permissions";

type ManagementRole = "lead" | "manager" | "admin";

interface Props {
    role: ManagementRole;
}

interface MenuItem {
    id: string;
    label: string;
    path: string;
    icon: IconName;
    roles: ManagementRole[];
    description: string;
    permission: PermissionCode;
}

const menuItems: MenuItem[] = [
    { id: "dashboard", label: "Tổng quan", path: "", icon: "dashboard", roles: ["lead", "manager", "admin"], description: "", permission: "DASHBOARD_VIEW" },
    { id: "reports", label: "Chờ duyệt", path: "reports", icon: "pending", roles: ["lead", "manager", "admin"], description: "", permission: "REPORT_PENDING_VIEW" },
    { id: "approved", label: "Đã duyệt", path: "approved", icon: "approved", roles: ["lead", "manager", "admin"], description: "", permission: "REPORT_APPROVED_VIEW" },
    { id: "export", label: "Xuất báo cáo", path: "export", icon: "download", roles: ["lead", "manager", "admin"], description: "", permission: "REPORT_EXPORT" },
    { id: "workers", label: "Nhân sự", path: "workers", icon: "workers", roles: ["lead", "manager", "admin"], description: "", permission: "USER_VIEW" },
    { id: "master", label: "Dữ liệu chuẩn", path: "master", icon: "settings", roles: ["manager", "admin"], description: "", permission: "MASTER_VIEW" },
    { id: "formulas", label: "Công thức", path: "formulas", icon: "checklist", roles: ["manager", "admin"], description: "", permission: "FORMULA_VIEW" },
    { id: "governance", label: "Quản trị dữ liệu", path: "governance", icon: "sheet", roles: ["manager", "admin"], description: "", permission: "GOVERNANCE_VIEW" },
    { id: "statistics", label: "Thống kê", path: "statistics", icon: "statistics", roles: ["lead", "manager", "admin"], description: "", permission: "STATISTICS_VIEW" },
    { id: "permissions", label: "Vai trò & quyền", path: "permissions", icon: "user", roles: ["admin"], description: "", permission: "PERMISSION_MANAGE" },
    { id: "system", label: "Hệ thống", path: "system", icon: "system", roles: ["lead", "manager", "admin"], description: "", permission: "NOTIFICATION_VIEW" }
];

const roleLabel: Record<ManagementRole, string> = { lead: "Tổ trưởng", manager: "Quản lý", admin: "Quản trị viên" };

function getInitials(user: User | null): string {
    const text = (user?.full_name || user?.username || "KTC").trim();
    const parts = text.split(/\s+/).filter(Boolean);

    if (parts.length >= 2) {
        return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
    }

    return text.slice(0, 2).toUpperCase();
}

function getDisplayAccountCode(user: User | null): string {
    if (!user) return "Tài khoản nội bộ";
    if (user.role === "worker") {
        return user.worker_code?.trim() || user.username;
    }
    return user.username;
}

function formatToday(): string {
    return new Date().toLocaleDateString("vi-VN", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
}

function ManagementLayout({ role }: Props) {
    const navigate = useNavigate();
    const location = useLocation();

    const user = getStoredUser() as User | null;
    const { can } = usePermissions();
    const { unreadCount } = useNotificationBadge(can("NOTIFICATION_VIEW"));

    const basePath = role === "lead" ? "/lead" : role === "admin" ? "/admin" : "/manager";
    const visibleMenuItems = menuItems.filter((item) => item.roles.includes(role) && can(item.permission));

    const getFullPath = (path: string): string => (path ? `${basePath}/${path}` : basePath);

    const isActive = (item: MenuItem): boolean => {
        const fullPath = getFullPath(item.path);

        if (item.path === "") {
            return location.pathname === basePath;
        }

        if (item.id === "reports") {
            return location.pathname === `${basePath}/reports`;
        }

        if (item.id === "approved") {
            return location.pathname === `${basePath}/approved`;
        }

        return location.pathname.startsWith(fullPath);
    };

    const handleLogout = () => {
        clearAuthSession();
        navigate("/login", { replace: true });
    };

    return (
        <div className="management-layout">
            <aside className="management-sidebar">
                <div className="management-sidebar-shell">
                    <button type="button" className="management-brand" onClick={() => navigate(basePath)}>
                        <span className="management-brand-mark" aria-hidden="true">K</span>
                        <span className="management-brand-content">
                            <strong>KTC (HANOI) CO., LTD</strong>
                            <small>{roleLabel[role]} · Production Control</small>
                        </span>
                    </button>

                    <div className="management-user-card">
                        <div className="management-user-avatar">{getInitials(user)}</div>
                        <div className="management-user-copy">
                            <strong>{user?.full_name || roleLabel[role]}</strong>
                            <span>{getDisplayAccountCode(user)}</span>

                        </div>
                    </div>

                    <nav className="management-menu" aria-label="Điều hướng quản lý">
                        {visibleMenuItems.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className={isActive(item) ? "management-menu-item active" : "management-menu-item"}
                                onClick={() => navigate(getFullPath(item.path))}
                            >
                                <span className="management-menu-icon"><AppIcon name={item.icon} size={19} />{item.id === "system" && unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}</span>
                                <span className="management-menu-copy">
                                    <span className="management-menu-label">{item.label}</span>
                                </span>
                            </button>
                        ))}
                    </nav>

                    <button type="button" className="management-logout" onClick={handleLogout}>
                        <span className="management-logout-icon"><AppIcon name="logout" size={18} /></span>
                        <span>Đăng xuất</span>
                    </button>
                </div>
            </aside>

            <div className="management-main">
                <header className="management-header">
                    <div className="management-header-copy">
                        <span className="management-header-kicker">KTC (HANOI) CO., LTD</span>
                        <strong>{role === "lead" ? "Bảng điều hành tổ trưởng" : role === "admin" ? "Bảng điều hành quản trị" : "Bảng điều hành quản lý"}</strong>

                    </div>

                    <div className="management-header-meta">
                        <div className="management-role-badge">{roleLabel[role]}</div>
                        <div className="management-date-chip">{formatToday()}</div>
                    </div>
                </header>

                <main className="management-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}

export default ManagementLayout;
