export interface MenuItem {
    label: string;
    icon: string;
    path: string;
    end?: boolean;
}

const workerMenu: MenuItem[] = [
    { label: "Công đoạn", icon: "process", path: "/worker", end: true },
    { label: "Lịch sử", icon: "list", path: "/worker/history" },
    { label: "Thông báo", icon: "bell", path: "/worker/notifications" },
    { label: "Tài khoản", icon: "user", path: "/worker/profile" },
];

const managementMenu = (base: string): MenuItem[] => [
    { label: "Dashboard", icon: "dashboard", path: base, end: true },
    { label: "Báo cáo chờ duyệt", icon: "list", path: `${base}/reports` },
    { label: "Báo cáo đã duyệt", icon: "approved", path: `${base}/approved` },
    { label: "Tải báo cáo", icon: "download", path: `${base}/export` },
    { label: "Nhân sự", icon: "workers", path: `${base}/workers` },
    { label: "Quản trị dữ liệu", icon: "settings", path: `${base}/master/machines` },
];

export const menuConfig: Record<string, MenuItem[]> = {
    worker: workerMenu,
    lead: managementMenu("/lead"),
    manager: managementMenu("/manager"),
    admin_ops: managementMenu("/admin-ops"),
    admin: managementMenu("/admin"),
};
