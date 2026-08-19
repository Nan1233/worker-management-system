import { Outlet, useLocation, useNavigate } from "react-router-dom";
import ThemeToggle from "../components/common/ThemeToggle";
import { logout } from "../services/authService";
import { useMobileKeyboard } from "../hooks/useMobileKeyboard";
import { useNotificationBadge } from "../hooks/useNotificationBadge";
import { usePermissions } from "../hooks/usePermissions";
import PokettoWorkerSidebar, { type PokettoWorkerNavItem } from "../components/template/PokettoWorkerSidebar";
import AppIcon from "../components/common/AppIcon";
import "./WorkerLayout.css";
import "./PokettoWorkerLayout.css";

const menuItems: PokettoWorkerNavItem[] = [
  { label: "Nhập báo cáo", path: "/worker", icon: "process", exact: true, permission: "WORKER_ENTRY" },
  { label: "Lịch sử", path: "/worker/history", icon: "history", permission: "WORKER_HISTORY" },
  { label: "Thông báo", path: "/worker/system", icon: "bell", permission: "NOTIFICATION_VIEW" },
  { label: "Tài khoản", path: "/worker/profile", icon: "user", permission: "PROFILE_VIEW" },
];

function WorkerLayout() {
  const navigate = useNavigate(); const location = useLocation();
  const { keyboardOpen, hideKeyboard } = useMobileKeyboard(); const { can } = usePermissions();
  const { unreadCount } = useNotificationBadge(can("NOTIFICATION_VIEW"));
  const visibleMenuItems = menuItems.filter((item) => can(item.permission));
  const handleLogout = () => { void logout(); navigate("/login", { replace: true }); };
  const isActive = (item: PokettoWorkerNavItem) => item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path);
  return <div className="poketto-worker-shell">
    <PokettoWorkerSidebar items={menuItems} unreadCount={unreadCount} can={can} onLogout={handleLogout} />
    <div className="poketto-worker-main">
      <header className="poketto-worker-header"><div className="poketto-worker-header-title"><span className="poketto-worker-header-dot" aria-hidden="true" /><div><strong>KTC Production Control</strong><small>Worker workspace</small></div></div>
        <div className="poketto-worker-header-actions"><ThemeToggle /><button type="button" className="poketto-worker-header-logout" onClick={handleLogout}><AppIcon name="logout" size={17} /><span>Đăng xuất</span></button></div>
      </header>
      <main className="poketto-worker-content"><Outlet /></main>
    </div>
    {keyboardOpen && <button type="button" className="worker-hide-keyboard" onClick={hideKeyboard} aria-label="Ẩn bàn phím"><span aria-hidden="true">⌄</span> Ẩn bàn phím</button>}
    <nav className="poketto-worker-mobile-nav" aria-label="Điều hướng công nhân trên điện thoại">{visibleMenuItems.map((item) => <button key={item.path} type="button" className={isActive(item) ? "active" : ""} onClick={() => navigate(item.path)}><span className="poketto-worker-mobile-icon"><AppIcon name={item.icon} size={19} />{item.icon === "bell" && unreadCount > 0 ? <span className="poketto-worker-badge">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}</span><small>{item.label}</small></button>)}</nav>
  </div>;
}
export default WorkerLayout;
