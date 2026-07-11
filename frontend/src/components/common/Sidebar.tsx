import { NavLink, useNavigate } from "react-router-dom";
import "./Sidebar.css";

function Sidebar() {
    const navigate = useNavigate();

    return (
        <aside className="sidebar">

            <div className="logo">
                <h2>KTC</h2>
                <span>Worker Management</span>
            </div>

            <nav className="sidebar-menu">

                {/* Trang mặc định sau khi đăng nhập */}
                <NavLink
                    to="/worker"
                    end
                    className={({ isActive }) =>
                        isActive ? "menu-item active" : "menu-item"
                    }
                >
                    <span>🏭</span>
                    <p>Công đoạn</p>
                </NavLink>

                <NavLink
                    to="/worker/history"
                    className={({ isActive }) =>
                        isActive ? "menu-item active" : "menu-item"
                    }
                >
                    <span>📋</span>
                    <p>Lịch sử</p>
                </NavLink>

                <NavLink
                    to="/worker/profile"
                    className={({ isActive }) =>
                        isActive ? "menu-item active" : "menu-item"
                    }
                >
                    <span>👤</span>
                    <p>Tài khoản</p>
                </NavLink>

            </nav>

            <button
                className="logout-btn"
                onClick={() => navigate("/login")}
            >
                🚪 Đăng xuất
            </button>

        </aside>
    );
}

export default Sidebar;