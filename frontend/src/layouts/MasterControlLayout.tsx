import { useEffect, useState, type FormEvent } from "react";
import { Bell, ChevronRight, CircleGauge, LogOut, Menu, Search, X } from "lucide-react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { getStoredUser } from "../utils/authStorage";
import { useNotificationBadge } from "../hooks/useNotificationBadge";
import { usePermissions } from "../hooks/usePermissions";
import { masterControlApi } from "../services/masterControlService";
import { ControlDenied, ControlError, ControlLoading } from "../pages/masterControl/ControlStates";
import { MASTER_CONTROL_BASE, MASTER_CONTROL_GROUPS, STATUS_LABEL, controlPath, moduleForPath } from "../pages/masterControl/masterControlNav";
import { isForbidden } from "../pages/masterControl/controlFormat";
import { getApiError } from "../utils/apiError";
import "./MasterControlLayout.css";

type AccessState = { status: "checking" } | { status: "granted" } | { status: "denied" } | { status: "error"; message: string };

/**
 * KTC Master Control Center shell. The route is wrapped in PrivateRoute(admin) on the client; this
 * layout additionally asks the backend (/api/admin/control/session, role('admin')) before rendering any
 * module, so a direct URL from a non-admin session shows "denied" even if local storage were edited.
 */
export default function MasterControlLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const user = getStoredUser();
    const { can } = usePermissions();
    const { unreadCount } = useNotificationBadge(can("NOTIFICATION_VIEW"));
    const [access, setAccess] = useState<AccessState>({ status: "checking" });
    const [attempt, setAttempt] = useState(0);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [search, setSearch] = useState("");

    useEffect(() => {
        let active = true;
        setAccess({ status: "checking" });
        masterControlApi.session()
            .then(() => { if (active) setAccess({ status: "granted" }); })
            .catch((error: unknown) => {
                if (!active) return;
                setAccess(isForbidden(error) ? { status: "denied" } : { status: "error", message: getApiError(error, "Không xác thực được quyền truy cập").message });
            });
        return () => { active = false; };
    }, [attempt]);

    useEffect(() => { setMobileOpen(false); }, [location.pathname]);

    const current = moduleForPath(location.pathname);
    const displayName = user?.full_name || user?.username || "Admin";
    const submitSearch = (event: FormEvent) => {
        event.preventDefault();
        const term = search.trim();
        navigate(`${controlPath("users")}${term ? `?search=${encodeURIComponent(term)}` : ""}`);
    };

    return <div className="mcc-shell">
        <aside className={`mcc-sidebar${mobileOpen ? " open" : ""}`} aria-label="Master Control Center">
            <div className="mcc-brand">
                <span className="mcc-brand-mark" aria-hidden="true"><CircleGauge size={18} /></span>
                <span><strong>Master Control</strong><small>KTC Worker Management</small></span>
                <button type="button" className="mcc-icon-btn mcc-only-mobile" aria-label="Đóng menu" onClick={() => setMobileOpen(false)}><X size={18} /></button>
            </div>
            <nav className="mcc-nav">
                {MASTER_CONTROL_GROUPS.map((group) => <div key={group.label} className="mcc-nav-group">
                    <div className="mcc-nav-heading">{group.label}</div>
                    {group.modules.map((item) => {
                        const Icon = item.icon;
                        return <NavLink key={item.path || "overview"} to={controlPath(item.path)} end={item.path === ""} className={({ isActive }) => `mcc-nav-link${isActive ? " active" : ""}`}>
                            <Icon size={16} aria-hidden="true" />
                            <span>{item.label}</span>
                            {STATUS_LABEL[item.status] ? <em className={`mcc-nav-tag mcc-nav-tag-${item.status}`}>{STATUS_LABEL[item.status]}</em> : null}
                        </NavLink>;
                    })}
                </div>)}
            </nav>
            <Link className="mcc-back" to="/admin"><LogOut size={15} aria-hidden="true" />Về Admin Console</Link>
        </aside>
        {mobileOpen ? <button type="button" className="mcc-backdrop" aria-label="Đóng menu" onClick={() => setMobileOpen(false)} /> : null}

        <div className="mcc-main">
            <header className="mcc-topbar">
                <button type="button" className="mcc-icon-btn mcc-only-mobile" aria-label="Mở menu" onClick={() => setMobileOpen(true)}><Menu size={18} /></button>
                <nav className="mcc-breadcrumb" aria-label="Breadcrumb">
                    <Link to="/admin">Admin</Link>
                    <ChevronRight size={14} aria-hidden="true" />
                    <Link to={MASTER_CONTROL_BASE}>Master Control Center</Link>
                    {current && current.path ? <><ChevronRight size={14} aria-hidden="true" /><span aria-current="page">{current.label}</span></> : null}
                </nav>
                <form className="mcc-search" role="search" onSubmit={submitSearch}>
                    <Search size={15} aria-hidden="true" />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tài khoản theo tên, username, mã CN" aria-label="Tìm tài khoản" />
                </form>
                {can("NOTIFICATION_VIEW") ? <Link to="/admin/notifications" className="mcc-icon-btn mcc-bell" aria-label="Thông báo">
                    <Bell size={17} />{unreadCount > 0 ? <b>{unreadCount > 9 ? "9+" : unreadCount}</b> : null}
                </Link> : null}
                <Link to="/admin/profile" className="mcc-profile"><span className="mcc-avatar" aria-hidden="true">{displayName.trim().charAt(0).toUpperCase() || "A"}</span><span className="mcc-profile-text"><strong>{displayName}</strong><small>{user?.is_super_admin ? "Super Admin" : "Admin"}</small></span></Link>
            </header>
            <main className="mcc-content">
                {access.status === "checking" ? <ControlLoading label="Đang xác thực quyền Master Control..." /> : null}
                {access.status === "denied" ? <ControlDenied message="Master Control Center chỉ dành cho tài khoản Super Admin. Tài khoản Admin vẫn dùng Admin Console như trước." /> : null}
                {access.status === "error" ? <ControlError message={access.message} onRetry={() => setAttempt((value) => value + 1)} /> : null}
                {access.status === "granted" ? <Outlet /> : null}
            </main>
        </div>
    </div>;
}
