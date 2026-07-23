import { Outlet, useLocation, useNavigate } from "react-router-dom";
import type { User } from "../types/auth";
import AppIcon, { type IconName } from "../components/common/AppIcon";
import "./ManagementLayout.css";

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
}

const menuItems: MenuItem[] = [
    {
        id: "dashboard",
        label: "Tổng quan",
        path: "",
        icon: "dashboard",
        roles: ["lead", "manager", "admin"],
        description: "KPI và tình hình sản xuất"
    },
    {
        id: "reports",
        label: "Chờ duyệt",
        path: "reports",
        icon: "pending",
        roles: ["lead", "manager", "admin"],
        description: "Kiểm tra báo cáo mới gửi"
    },
    {
        id: "approved",
        label: "Đã duyệt",
        path: "approved",
        icon: "approved",
        roles: ["lead", "manager", "admin"],
        description: "Tra cứu báo cáo chính thức"
    },
    {
        id: "users",
        label: "Người dùng",
        path: "master/users",
        icon: "workers",
        roles: ["lead", "manager", "admin"],
        description: "Tài khoản, nhân sự và phân công"
    },
    {
        id: "processes",
        label: "Công đoạn",
        path: "master/processes",
        icon: "settings",
        roles: ["manager", "admin"],
        description: "Mã và tên công đoạn sản xuất"
    },
    {
        id: "machines",
        label: "Máy sản xuất",
        path: "master/machines",
        icon: "settings",
        roles: ["manager", "admin"],
        description: "Danh sách máy theo công đoạn"
    },
    {
        id: "standards",
        label: "Sản phẩm & định mức",
        path: "master/standards",
        icon: "statistics",
        roles: ["manager", "admin"],
        description: "Mã sản phẩm và sản lượng chuẩn"
    },
    {
        id: "quality",
        label: "Lỗi & trừ giờ",
        path: "master/defects",
        icon: "system",
        roles: ["manager", "admin"],
        description: "Danh mục NG và lý do trừ thời gian"
    },
    {
        id: "workers",
        label: "Theo dõi công nhân",
        path: "workers",
        icon: "workers",
        roles: ["lead", "manager", "admin"],
        description: "Theo dõi nhân sự sản xuất"
    },
    {
        id: "system",
        label: "Thông báo & lịch sử",
        path: "system",
        icon: "system",
        roles: ["lead", "manager", "admin"],
        description: "Nhật ký và cảnh báo hệ thống"
    },
    {
        id: "statistics",
        label: "Thống kê",
        path: "statistics",
        icon: "statistics",
        roles: ["manager", "admin"],
        description: "Phân tích sâu và so sánh dữ liệu"
    }
];

const roleLabel: Record<ManagementRole, string> = { lead: "Tổ trưởng", manager: "Quản lý", admin: "Quản trị viên" };

const roleDescription: Record<ManagementRole, string> = {
    lead: "Kiểm tra, duyệt và theo dõi báo cáo của chuyền hoặc công đoạn.",
    manager: "Điều hành dữ liệu sản xuất, thống kê và chuẩn hóa báo cáo chính thức.",
    admin: "Quản trị tài khoản, dữ liệu gốc và toàn bộ cấu hình vận hành."
};

function getInitials(user: User | null): string {
    const text = (user?.full_name || user?.username || "KTC").trim();
    const parts = text.split(/\s+/).filter(Boolean);

    if (parts.length >= 2) {
        return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
    }

    return text.slice(0, 2).toUpperCase();
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

    const user = (() => {
        try {
            return JSON.parse(localStorage.getItem("user") || "null") as User | null;
        } catch {
            return null;
        }
    })();

    const basePath = role === "lead" ? "/lead" : role === "admin" ? "/admin" : "/manager";
    const visibleMenuItems = menuItems.filter((item) => item.roles.includes(role));

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

        if (item.id === "quality") {
            return location.pathname === `${basePath}/master/defects`
                || location.pathname === `${basePath}/master/deductions`;
        }

        return location.pathname.startsWith(fullPath);
    };

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login", { replace: true });
    };

    return (
        <div className="management-layout">
            <aside className="management-sidebar">
                <div className="management-sidebar-shell">
                    <button type="button" className="management-brand" onClick={() => navigate(basePath)}>
                        <span className="management-brand-icon">KTC</span>
                        <span className="management-brand-content">
                            <strong>Production Control</strong>
                            <small>{roleLabel[role]} · Nhà máy số hóa</small>
                        </span>
                    </button>

                    <div className="management-user-card">
                        <div className="management-user-avatar">{getInitials(user)}</div>
                        <div className="management-user-copy">
                            <strong>{user?.full_name || roleLabel[role]}</strong>
                            <span>{user?.username || "Tài khoản nội bộ"}</span>
                            <small>{roleDescription[role]}</small>
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
                                <span className="management-menu-icon"><AppIcon name={item.icon} size={19} /></span>
                                <span className="management-menu-copy">
                                    <span className="management-menu-label">{item.label}</span>
                                    <small>{item.description}</small>
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
                        <span className="management-header-kicker">TRUNG TÂM VẬN HÀNH KTC</span>
                        <strong>{role === "lead" ? "Bảng điều hành tổ trưởng" : role === "admin" ? "Bảng điều hành quản trị" : "Bảng điều hành quản lý"}</strong>
                        <span>{roleDescription[role]}</span>
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
