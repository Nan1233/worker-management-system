import { Activity, Boxes, Building2, Database, FileClock, LayoutDashboard, LayoutTemplate, Puzzle, Settings2, ShieldCheck, Users, HardDriveDownload, ShieldAlert, Rocket, Gauge } from "lucide-react";

export const MASTER_CONTROL_BASE = "/admin/master-control";

export type ModuleStatus = "live" | "read_only" | "coming_soon";

export interface MasterControlModule {
    path: string;
    label: string;
    description: string;
    icon: typeof LayoutDashboard;
    status: ModuleStatus;
}

export interface MasterControlGroup { label: string; modules: MasterControlModule[] }

export const MASTER_CONTROL_GROUPS: MasterControlGroup[] = [
    { label: "OVERVIEW", modules: [
        { path: "", label: "Overview Dashboard", description: "Tổng quan dữ liệu và trạng thái hệ thống", icon: LayoutDashboard, status: "live" },
    ] },
    { label: "MANAGEMENT", modules: [
        { path: "users", label: "Users & Accounts", description: "Tài khoản, vai trò, công đoạn và trạng thái", icon: Users, status: "live" },
        { path: "permissions", label: "Roles & Permissions", description: "Ma trận quyền theo vai trò và ngoại lệ theo tài khoản", icon: ShieldCheck, status: "live" },
        { path: "organization", label: "Organization", description: "Cơ cấu tổ chức và phân công", icon: Building2, status: "coming_soon" },
        { path: "master-data", label: "Master Data", description: "Máy, sản phẩm & định mức, lỗi NG, trừ giờ, công đoạn", icon: Boxes, status: "live" },
    ] },
    { label: "SECURITY & GOVERNANCE", modules: [
        { path: "security", label: "Security Center", description: "Sự kiện bảo mật, đăng nhập và thao tác bị từ chối", icon: ShieldAlert, status: "live" },
        { path: "audit", label: "Audit Center", description: "Nhật ký hoạt động và thay đổi quản trị", icon: FileClock, status: "live" },
    ] },
    { label: "SYSTEM", modules: [
        { path: "configuration", label: "System Configuration", description: "Cấu hình runtime hiện hành (chỉ xem)", icon: Settings2, status: "read_only" },
        { path: "page-builder", label: "Page Builder", description: "Bố cục trang quản trị", icon: LayoutTemplate, status: "coming_soon" },
        { path: "components", label: "Component Registry", description: "Widget đã đăng ký dùng cho bố cục", icon: Puzzle, status: "read_only" },
        { path: "database", label: "Database Explorer", description: "Schema, cột, index (chỉ đọc metadata)", icon: Database, status: "read_only" },
        { path: "database-monitor", label: "Database Monitor", description: "Readiness, độ trễ DB, dung lượng và bảng dữ liệu", icon: Gauge, status: "read_only" },
    ] },
    { label: "OPERATIONS", modules: [
        { path: "health", label: "System Health", description: "API, cơ sở dữ liệu, readiness, chỉ số runtime", icon: Activity, status: "live" },
        { path: "deployment", label: "Deployment Center", description: "Phiên bản API, commit và trạng thái triển khai có thể xác minh", icon: Rocket, status: "read_only" },
        { path: "backup", label: "Backup & Recovery", description: "Trạng thái nguồn dữ liệu backup và quy trình khôi phục", icon: HardDriveDownload, status: "read_only" },
    ] },
];

export const MASTER_CONTROL_MODULES = MASTER_CONTROL_GROUPS.flatMap((group) => group.modules);
export const STATUS_LABEL: Record<ModuleStatus, string> = { live: "", read_only: "Chỉ xem", coming_soon: "Sắp có" };

export function moduleForPath(pathname: string): MasterControlModule | undefined {
    const rest = pathname.startsWith(MASTER_CONTROL_BASE) ? pathname.slice(MASTER_CONTROL_BASE.length).replace(/^\\/+/, "") : "";
    const first = rest.split("/")[0] || "";
    return MASTER_CONTROL_MODULES.find((item) => item.path === first);
}

export const controlPath = (path = "") => (path ? `${MASTER_CONTROL_BASE}/${path}` : MASTER_CONTROL_BASE);
