import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import type { User } from "../types/auth";
import AppIcon, { type IconName } from "../components/common/AppIcon";
import ThemeToggle from "../components/common/ThemeToggle";
import "./ManagementLayout.css";
import { getStoredUser } from "../utils/authStorage";
import { logout } from "../services/authService";
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
    permission: PermissionCode;
}

const menuItems: MenuItem[] = [
    { id: "dashboard", label: "Tổng quan", path: "", icon: "dashboard", roles: ["lead", "manager", "admin"], permission: "DASHBOARD_VIEW" },
    { id: "reports", label: "Chờ duyệt", path: "reports", icon: "pending", roles: ["lead", "manager", "admin"], permission: "REPORT_PENDING_VIEW" },
    { id: "approved", label: "Đã duyệt", path: "approved", icon: "approved", roles: ["lead", "manager", "admin"], permission: "REPORT_APPROVED_VIEW" },
    { id: "export", label: "Xuất báo cáo", path: "export", icon: "download", roles: ["admin"], permission: "REPORT_EXPORT" },
    { id: "workers", label: "Nhân sự", path: "workers", icon: "workers", roles: ["lead", "manager", "admin"], permission: "USER_VIEW" },
    { id: "master", label: "Dữ liệu chuẩn", path: "master", icon: "settings", roles: ["manager", "admin"], permission: "MASTER_VIEW" },
    { id: "formulas", label: "Công thức", path: "formulas", icon: "checklist", roles: ["manager", "admin"], permission: "FORMULA_VIEW" },
    { id: "governance", label: "Quản trị dữ liệu", path: "governance", icon: "sheet", roles: ["manager", "admin"], permission: "GOVERNANCE_VIEW" },
    { id: "statistics", label: "Thống kê", path: "statistics", icon: "statistics", roles: ["lead", "manager", "admin"], permission: "STATISTICS_VIEW" },
    { id: "permissions", label: "Vai trò & quyền", path: "permissions", icon: "user", roles: ["admin"], permission: "PERMISSION_MANAGE" },
    { id: "system", label: "Hệ thống", path: "system", icon: "system", roles: ["lead", "manager", "admin"], permission: "NOTIFICATION_VIEW" }
];

const roleLabel: Record<ManagementRole, string> = {
    lead: "Tổ trưởng",
    manager: "Quản lý",
    admin: "Quản trị viên"
};

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
    return user.role === "worker" ? user.worker_code?.trim() || user.username : user.username;
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
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    const user = getStoredUser() as User | null;
    const { can } = usePermissions();
    const canViewNotifications = can("NOTIFICATION_VIEW");
    const { unreadCount } = useNotificationBadge(canViewNotifications);

    const basePath = role === "lead" ? "/lead" : role === "admin" ? "/admin" : "/manager";
    const visibleMenuItems = menuItems.filter((item) => item.roles.includes(role) && can(item.permission));

    const getFullPath = (path: string): string => (path ? `${basePath}/${path}` : basePath);

    const isActive = (item: MenuItem): boolean => {
        const fullPath = getFullPath(item.path);

        if (item.path === "") return location.pathname === basePath;
        if (item.id === "reports") return location.pathname === `${basePath}/reports` || location.pathname === `${basePath}/reports/review`;
        if (item.id === "approved") return location.pathname === `${basePath}/approved` || location.pathname.startsWith(`${basePath}/report/`);
        return location.pathname.startsWith(fullPath);
    };

    const activeItem = visibleMenuItems.find(isActive);
    const currentPageLabel = activeItem?.label || (location.pathname.includes("/report/") ? "Chi tiết báo cáo" : roleLabel[role]);

    useEffect(() => {
        setMobileNavOpen(false);
    }, [location.pathname]);

    const handleLogout = () => {
        void logout();
        navigate("/login", { replace: true });
    };

    const navigateTo = (path: string) => {
        navigate(path);
        setMobileNavOpen(false);
    };

    return (
        <div className={`management-layout${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
            {mobileNavOpen && (
                <button
                    type="button"
                    className="management-drawer-backdrop"
                    aria-label="Đóng menu điều hướng"
                    onClick={() => setMobileNavOpen(false)}
                />
            )}

            <aside className={`management-sidebar${mobileNavOpen ? " is-open" : ""}`} aria-label="Thanh điều hướng quản lý">
                <div className="management-sidebar-shell">
                    <div className="management-sidebar-head">
                        <button type="button" className="management-brand" onClick={() => navigateTo(basePath)} aria-label="Về trang tổng quan">
                            <span className="management-brand-mark" aria-hidden="true">K</span>
                            <span className="management-brand-content">
                                <strong>KTC (HANOI) CO., LTD</strong>
                                <small>Production Control</small>
                            </span>
                        </button>

                        <button
                            type="button"
                            className="management-sidebar-collapse"
                            onClick={() => setSidebarCollapsed((value) => !value)}
                            aria-label={sidebarCollapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
                            title={sidebarCollapsed ? "Mở rộng" : "Thu gọn"}
                        >
                            <AppIcon name="menu" size={18} />
                        </button>

                        <button
                            type="button"
                            className="management-drawer-close"
                            onClick={() => setMobileNavOpen(false)}
                            aria-label="Đóng menu"
                        >
                            <span aria-hidden="true">×</span>
                        </button>
                    </div>

                    <div className="management-user-card" title={user?.full_name || roleLabel[role]}>
                        <div className="management-user-avatar">{getInitials(user)}</div>
                        <div className="management-user-copy">
                            <strong>{user?.full_name || roleLabel[role]}</strong>
                            <span>{roleLabel[role]} · {getDisplayAccountCode(user)}</span>
                        </div>
                    </div>

                    <nav className="management-menu" aria-label="Điều hướng quản lý">
                        {visibleMenuItems.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className={isActive(item) ? "management-menu-item active" : "management-menu-item"}
                                onClick={() => navigateTo(getFullPath(item.path))}
                                title={sidebarCollapsed ? item.label : undefined}
                                aria-current={isActive(item) ? "page" : undefined}
                            >
                                <span className="management-menu-icon">
                                    <AppIcon name={item.icon} size={19} />
                                    {item.id === "system" && unreadCount > 0 && (
                                        <span className="notification-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
                                    )}
                                </span>
                                <span className="management-menu-label">{item.label}</span>
                            </button>
                        ))}
                    </nav>

                    <div className="management-sidebar-footer">
                        <button type="button" className="management-logout" onClick={handleLogout} title={sidebarCollapsed ? "Đăng xuất" : undefined}>
                            <span className="management-logout-icon"><AppIcon name="logout" size={18} /></span>
                            <span className="management-logout-label">Đăng xuất</span>
                        </button>
                    </div>
                </div>
            </aside>

            <div className="management-main">
                <header className="management-header">
                    <div className="management-header-start">
                        <button
                            type="button"
                            className="management-mobile-menu"
                            onClick={() => setMobileNavOpen(true)}
                            aria-label="Mở menu điều hướng"
                            aria-expanded={mobileNavOpen}
                        >
                            <AppIcon name="menu" size={20} />
                        </button>

                        <div className="management-header-copy">
                            <span className="management-header-kicker">{roleLabel[role]}</span>
                            <strong>{currentPageLabel}</strong>
                        </div>
                    </div>

                    <div className="management-header-actions">
                        <span className="management-date">{formatToday()}</span>
                        <ThemeToggle />

                        {canViewNotifications && (
                            <button
                                type="button"
                                className="management-header-icon-button"
                                onClick={() => navigateTo(`${basePath}/system`)}
                                aria-label={unreadCount > 0 ? `Thông báo, ${unreadCount} chưa đọc` : "Thông báo"}
                                title="Thông báo"
                            >
                                <AppIcon name="bell" size={19} />
                                {unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
                            </button>
                        )}

                        <details className="management-account-menu">
                            <summary aria-label="Mở menu tài khoản">
                                <span className="management-account-avatar">{getInitials(user)}</span>
                                <span className="management-account-summary-copy">
                                    <strong>{user?.full_name || roleLabel[role]}</strong>
                                    <small>{roleLabel[role]}</small>
                                </span>
                            </summary>
                            <div className="management-account-popover">
                                <div className="management-account-popover-copy">
                                    <strong>{user?.full_name || roleLabel[role]}</strong>
                                    <span>{getDisplayAccountCode(user)}</span>
                                </div>
                                <button type="button" onClick={handleLogout}>
                                    <AppIcon name="logout" size={17} />
                                    Đăng xuất
                                </button>
                            </div>
                        </details>
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
