import { Outlet, useLocation, useNavigate } from "react-router-dom";
import AppIcon, { type IconName } from "../components/common/AppIcon";
import "./WorkerLayout.css";
import { clearAuthSession } from "../utils/authStorage";
import { useMobileKeyboard } from "../hooks/useMobileKeyboard";
import { useNotificationBadge } from "../hooks/useNotificationBadge";
import { usePermissions } from "../hooks/usePermissions";
import type { PermissionCode } from "../security/permissions";

const menuItems: { label: string; path: string; icon: IconName; exact?: boolean; permission: PermissionCode }[] = [
    { label: "Nhập báo cáo", path: "/worker", icon: "process", exact: true, permission: "WORKER_ENTRY" },
    { label: "Lịch sử", path: "/worker/history", icon: "history", permission: "WORKER_HISTORY" },
    { label: "Thông báo", path: "/worker/system", icon: "bell", permission: "NOTIFICATION_VIEW" },
    { label: "Tài khoản", path: "/worker/profile", icon: "user", permission: "PROFILE_VIEW" }
];

const formatToday = (): string => {
    const value = new Intl.DateTimeFormat("vi-VN", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    }).format(new Date());

    return value.charAt(0).toUpperCase() + value.slice(1);
};

function WorkerLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const { keyboardOpen, hideKeyboard } = useMobileKeyboard();
    const { can } = usePermissions();
    const { unreadCount } = useNotificationBadge(can("NOTIFICATION_VIEW"));
    const visibleMenuItems = menuItems.filter((item) => can(item.permission));

    const handleLogout = () => {
        clearAuthSession();
        navigate("/login", { replace: true });
    };

    const isActive = (path: string, exact?: boolean) =>
        exact ? location.pathname === path : location.pathname.startsWith(path);

    return (
        <div className="worker-layout">
            <header className="worker-topbar">
                <button
                    type="button"
                    className="worker-brand"
                    onClick={() => navigate("/worker")}
                    aria-label="Về trang chủ công nhân"
                >
                    <span className="worker-brand-mark" aria-hidden="true">K</span>
                    <span className="worker-brand-text">
                        <strong>KTC (HANOI) CO., LTD</strong>
                        <small>{formatToday()}</small>
                    </span>
                </button>

                <nav className="worker-desktop-nav" aria-label="Điều hướng công nhân">
                    {visibleMenuItems.map((item) => (
                        <button
                            key={item.path}
                            type="button"
                            className={isActive(item.path, item.exact) ? "active" : ""}
                            onClick={() => navigate(item.path)}
                        >
                            <span className="worker-nav-icon"><AppIcon name={item.icon} size={18} />{item.icon === "bell" && unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}</span>
                            {item.label}
                        </button>
                    ))}
                </nav>

                <div className="worker-account">
                    <button type="button" className="worker-logout" onClick={handleLogout}>
                        <span className="worker-nav-icon"><AppIcon name="logout" size={18} /></span>
                        <span className="worker-logout-label">Đăng xuất</span>
                    </button>
                </div>
            </header>

            <main className="worker-main-content">
                <Outlet />
            </main>

            {keyboardOpen && (
                <button
                    type="button"
                    className="worker-hide-keyboard"
                    onClick={hideKeyboard}
                    aria-label="Ẩn bàn phím"
                >
                    <span aria-hidden="true">⌄</span>
                    Ẩn bàn phím
                </button>
            )}

            <nav className="worker-mobile-nav" aria-label="Điều hướng công nhân trên điện thoại">
                {visibleMenuItems.map((item) => (
                    <button
                        key={item.path}
                        type="button"
                        className={isActive(item.path, item.exact) ? "active" : ""}
                        onClick={() => navigate(item.path)}
                    >
                        <span className="worker-mobile-nav-icon"><AppIcon name={item.icon} size={19} />{item.icon === "bell" && unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}</span>
                        <small>{item.label}</small>
                    </button>
                ))}
                <button type="button" className="logout" onClick={handleLogout}>
                    <span className="worker-mobile-nav-icon"><AppIcon name="logout" size={19} /></span>
                    <small>Đăng xuất</small>
                </button>
            </nav>
        </div>
    );
}

export default WorkerLayout;
