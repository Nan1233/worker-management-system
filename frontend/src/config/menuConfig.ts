export interface MenuItem {
    label: string;
    icon: string;
    path: string;
    end?: boolean;
}

const workerMenu: MenuItem[] = [
    { label: "Công đoạn", icon: "process", path: "/worker", end: true },
    { label: "Lịch sử", icon: "list", path: "/worker/history" },
    { label: "Thông báo", icon: "bell", path: "/worker/system" },
    { label: "Tài khoản", icon: "user", path: "/worker/profile" },
];

const managementMenu: MenuItem[] = [
    { label: "Dashboard", icon: "dashboard", path: "/manager", end: true },
    { label: "Báo cáo chờ duyệt", icon: "list", path: "/manager/reports" },
    { label: "Báo cáo đã duyệt", icon: "approved", path: "/manager/approved" },
    { label: "Tải báo cáo", icon: "download", path: "/manager/export" },
    { label: "Thống kê", icon: "statistics", path: "/manager/statistics" },
    { label: "Nhân viên", icon: "workers", path: "/manager/workers" },
    { label: "Quản trị dữ liệu", icon: "settings", path: "/manager/governance" },
];

export const menuConfig: Record<string, MenuItem[]> = {
    worker: workerMenu,
    lead: managementMenu,
    manager: managementMenu,
    admin: managementMenu,
};
