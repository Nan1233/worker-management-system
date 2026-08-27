import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Bell, ClipboardPenLine, History, Home, LogOut, UserRound } from "lucide-react";
import { logout } from "../services/authService";
import { usePermissions } from "../hooks/usePermissions";
import { useNotificationBadge } from "../hooks/useNotificationBadge";
import type { PermissionCode } from "../security/permissions";
import "./WorkerLayout.css";

type Item = {
  label: string;
  path: string;
  icon: typeof Bell;
  permission?: PermissionCode;
};

const items: Item[] = [
  { label: "Trang chủ", path: "/worker", icon: Home },
  { label: "Báo cáo", path: "/worker/process/select", icon: ClipboardPenLine, permission: "WORKER_ENTRY" },
  { label: "Lịch sử", path: "/worker/history", icon: History, permission: "WORKER_HISTORY" },
  { label: "Thông báo", path: "/worker/notifications", icon: Bell, permission: "NOTIFICATION_VIEW" },
  { label: "Cá nhân", path: "/worker/profile", icon: UserRound, permission: "PROFILE_VIEW" },
];

export default function WorkerLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = usePermissions();
  const { unreadCount } = useNotificationBadge(can("NOTIFICATION_VIEW"));
  const visible = items.filter((item) => !item.permission || can(item.permission));

  const active = (item: Item) => {
    if (item.path === "/worker") return location.pathname === "/worker";
    if (item.label === "Báo cáo") return location.pathname.startsWith("/worker/process/");
    return location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
  };

  const handleLogout = () => {
    void logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="worker-layout">
      <aside className="worker-sidebar">
        <button className="worker-brand" type="button" onClick={() => navigate("/worker")}>
          <span className="worker-brand-mark">K</span>
          <span>
            <strong>KTC (HANOI) CO., LTD</strong>
            <small>Công nhân</small>
          </span>
        </button>

        <nav className="worker-nav" aria-label="Điều hướng công nhân">
          {visible.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={`${item.path}-${item.label}`}
                type="button"
                className={active(item) ? "active" : ""}
                onClick={() => navigate(item.path)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {item.icon === Bell && unreadCount > 0 && (
                  <b className="worker-badge">{unreadCount > 99 ? "99+" : unreadCount}</b>
                )}
              </button>
            );
          })}
        </nav>

        <button className="worker-logout" type="button" onClick={() => void handleLogout()}>
          <LogOut size={18} />
          <span>Đăng xuất</span>
        </button>
      </aside>

      <section className="worker-main">
        <header className="worker-header">
          <div>
            <strong>Quản lý sản xuất KTC</strong>
            <span>Công nhân · Sản xuất</span>
          </div>
        </header>
        <main className="worker-content"><Outlet /></main>
      </section>

      <nav className="worker-mobile-nav" aria-label="Điều hướng trên điện thoại">
        {visible.map((item) => {
          const Icon = item.icon;
          return (
            <button key={`mobile-${item.label}`} type="button" className={active(item) ? "active" : ""} onClick={() => navigate(item.path)}>
              <Icon size={19} />
              <span>{item.label}</span>
              {item.icon === Bell && unreadCount > 0 && <b className="worker-badge">{unreadCount > 99 ? "99+" : unreadCount}</b>}
            </button>
          );
        })}
        <button type="button" className="worker-mobile-logout" onClick={() => void handleLogout()}>
          <LogOut size={19} />
          <span>Đăng xuất</span>
        </button>
      </nav>
    </div>
  );
}
