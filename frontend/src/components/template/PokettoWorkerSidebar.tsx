import { useLocation, useNavigate } from "react-router-dom";
import AppIcon, { type IconName } from "../common/AppIcon";
import type { PermissionCode } from "../../security/permissions";

export type PokettoWorkerNavItem = { label: string; path: string; icon: IconName; exact?: boolean; permission: PermissionCode };

type Props = { items: PokettoWorkerNavItem[]; unreadCount: number; can: (permission: PermissionCode) => boolean; onLogout: () => void };

export default function PokettoWorkerSidebar({ items, unreadCount, can, onLogout }: Props) {
  const location = useLocation(); const navigate = useNavigate();
  const visible = items.filter((item) => can(item.permission));
  const active = (item: PokettoWorkerNavItem) => item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path);
  return <aside className="poketto-worker-sidebar" aria-label="Điều hướng công nhân">
    <div className="poketto-worker-sidebar-header"><button type="button" className="poketto-worker-brand" onClick={() => navigate("/worker")}>
      <span className="poketto-worker-brand-mark" aria-hidden="true">K</span><span className="poketto-worker-brand-copy"><strong>KTC Production</strong><small>Worker workspace</small></span>
    </button></div>
    <div className="poketto-worker-sidebar-content"><div className="poketto-worker-section-label">Workspace</div><nav className="poketto-worker-menu">
      {visible.map((item) => <button key={item.path} type="button" className={active(item) ? "active" : ""} onClick={() => navigate(item.path)} aria-current={active(item) ? "page" : undefined}>
        <span className="poketto-worker-menu-icon"><AppIcon name={item.icon} size={18} />{item.icon === "bell" && unreadCount > 0 ? <span className="poketto-worker-badge">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}</span><span>{item.label}</span>
      </button>)}
    </nav></div>
    <div className="poketto-worker-sidebar-footer"><button type="button" className="poketto-worker-logout" onClick={onLogout}><AppIcon name="logout" size={18} /><span>Đăng xuất</span></button></div>
  </aside>;
}
