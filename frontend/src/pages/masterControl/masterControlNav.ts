import { Activity, Boxes, Building2, Database, FileClock, LayoutDashboard, LayoutTemplate, Puzzle, Settings2, ShieldCheck, Users, HardDriveDownload } from "lucide-react";

export const MASTER_CONTROL_BASE = "/admin/master-control";

export type ModuleStatus = "live" | "read_only" | "coming_soon";

export interface MasterControlModule {
    path: string;              // relative to MASTER_CONTROL_BASE ("" = overview)
    label: string;
    description: string;
    icon: typeof LayoutDashboard;
    status: ModuleStatus;
}

export interface MasterControlGroup { label: string; modules: MasterControlModule[] }

// Single source for sidebar, breadcrumb and page titles. "coming_soon" modules are shown with an explicit
// badge and render an honest placeholder; they never pretend to work.
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
    { label: "SYSTEM", modules: [
        { path: "configuration", label: "System Configuration", description: "Cấu hình runtime hiện hành (chỉ xem)", icon: Settings2, status: "read_only" },
        { path: "page-builder", label: "Page Builder", description: "Bố cục trang quản trị", icon: LayoutTemplate, status: "coming_soon" },
        { path: "components", label: "Component Registry", description: "Widget đã đăng ký dùng cho bố cục", icon: Puzzle, status: "read_only" },
        { path: "database", label: "Database Explorer", description: "Schema, cột, index (chỉ đọc metadata)", icon: Database, status: "read_only" },
    ] },
    { label: "OPERATIONS", modules: [
        { path: "health", label: "System Health", description: "API, cơ sở dữ liệu, readiness, chỉ số runtime", icon: Activity, status: "live" },
        { path: "backup", label: "Backup & Recovery", description: "Trạng thái nguồn dữ liệu backup", icon: HardDriveDownload, status: "read_only" },
        { path: "audit", label: "Audit Center", description: "Nhật ký hoạt động và thay đổi quản trị", icon: FileClock, status: "live" },
    ] },
];

export const MASTER_CONTROL_MODULES = MASTER_CONTROL_GROUPS.flatMap((group) => group.modules);

export const STATUS_LABEL: Record<ModuleStatus, string> = { live: "", read_only: "Chỉ xem", coming_soon: "Sắp có" };

export function moduleForPath(pathname: string): MasterControlModule | undefined {
    const rest = pathname.startsWith(MASTER_CONTROL_BASE) ? pathname.slice(MASTER_CONTROL_BASE.length).replace(/^\/+/, "") : "";
    const first = rest.split("/")[0] || "";
    return MASTER_CONTROL_MODULES.find((item) => item.path === first);
}

export const controlPath = (path = "") => (path ? `${MASTER_CONTROL_BASE}/${path}` : MASTER_CONTROL_BASE);
