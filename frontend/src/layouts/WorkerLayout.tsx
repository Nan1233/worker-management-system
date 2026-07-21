import { Outlet, useLocation, useNavigate } from "react-router-dom";
import type { User } from "../types/auth";
import "./WorkerLayout.css";

const menuItems = [
    { label: "Trang chủ", path: "/worker", icon: "⌂", exact: true },
    { label: "Lịch sử báo cáo", path: "/worker/history", icon: "▤" },
    { label: "Thông báo", path: "/worker/system", icon: "●" }
];

function WorkerLayout() {
    const navigate = useNavigate();
    const location = useLocation();

    const user = (() => {
        try {
            return JSON.parse(localStorage.getItem("user") || "null") as User | null;
        } catch {
            return null;
        }
    })();

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
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
                    <span className="worker-brand-mark">KTC</span>
                    <span className="worker-brand-text">
                        <strong>Quản lý sản xuất</strong>
                        <small>Khu vực công nhân</small>
                    </span>
                </button>

                <nav className="worker-desktop-nav" aria-label="Điều hướng công nhân">
                    {menuItems.map((item) => (
                        <button
                            key={item.path}
                            type="button"
                            className={isActive(item.path, item.exact) ? "active" : ""}
                            onClick={() => navigate(item.path)}
                        >
                            <span>{item.icon}</span>
                            {item.label}
                        </button>
                    ))}
                </nav>

                <div className="worker-account">
                    <div className="worker-avatar">
                        {(user?.full_name || user?.username || "CN").trim().charAt(0).toUpperCase()}
                    </div>
                    <div className="worker-account-copy">
                        <strong>{user?.full_name || "Công nhân"}</strong>
                        <small>Mã NV: {user?.username || "---"}</small>
                    </div>
                    <button type="button" className="worker-logout" onClick={handleLogout}>
                        <span>⇥</span>
                        <span className="worker-logout-label">Đăng xuất</span>
                    </button>
                </div>
            </header>

            <main className="worker-main-content">
                <Outlet />
            </main>

            <nav className="worker-mobile-nav" aria-label="Điều hướng công nhân trên điện thoại">
                {menuItems.map((item) => (
                    <button
                        key={item.path}
                        type="button"
                        className={isActive(item.path, item.exact) ? "active" : ""}
                        onClick={() => navigate(item.path)}
                    >
                        <span>{item.icon}</span>
                        <small>{item.label}</small>
                    </button>
                ))}
                <button type="button" className="logout" onClick={handleLogout}>
                    <span>⇥</span>
                    <small>Đăng xuất</small>
                </button>
            </nav>
        </div>
    );
}

export default WorkerLayout;
