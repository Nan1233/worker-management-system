import api from "./api";

// Client for the admin-only Master Control API (/api/admin/control). The backend enforces
// auth + role('admin') + permissions; the UI only mirrors that state.

export type ControlRole = "admin" | "admin_ops" | "manager" | "lead" | "worker";

export interface Pagination { page: number; pageSize: number; total: number; totalPages: number }

export interface OverviewCounts {
    latencyMs: number;
    users: { total: number; active: number; workers: number; managers: number; leads: number; admins: number; adminOps: number };
    processes: { total: number; active: number };
    machines: { total: number; active: number };
    productionReports: number;
    pendingApprovals: number;
}

export interface ReadinessState {
    status: "ready" | "not_ready" | "unknown";
    ready: boolean | null;
    schemaStatus?: string | null;
    schemaContractVersion?: number | null;
    database?: string | null;
    errorCode?: string | null;
}

export interface SystemAlert { level: "critical" | "warning" | "info"; code: string; message: string }

export interface ActivityItem {
    id: number;
    action: string;
    entity_type?: string | null;
    entity_id?: string | null;
    description?: string | null;
    created_at: string;
    user_id?: number | null;
    username?: string | null;
    full_name?: string | null;
    role?: string | null;
}

export interface OverviewData {
    generatedAt: string;
    counts: OverviewCounts | null;
    api: { status: string; version: string; commit: string; environment: string | null };
    database: { status: "ok" | "unavailable"; latencyMs?: number; errorCode?: string };
    readiness: ReadinessState;
    backgroundJobs: { status: string; reason: string };
    backup: { status: string; reason: string };
    recentActivity: ActivityItem[];
    recentActivityError: string | null;
    alerts: SystemAlert[];
}

export interface ControlUser {
    id: number;
    username: string;
    full_name: string;
    role: ControlRole;
    status: "active" | "inactive" | string;
    created_at?: string;
    updated_at?: string;
    worker_id?: number | null;
    worker_code?: string | null;
    worker_status?: string | null;
    process_names?: string | null;
    last_activity_at?: string | null;
}

export interface UserDetail {
    user: ControlUser & { phone?: string | null; department?: string | null; position?: string | null; training_percent?: number | string | null };
    processes: Array<{ id: number; process_code: string; process_name: string; status: string; source: "manager_scope" | "worker_assignment" }>;
    sessions: { total: number; active: number; lastActivityAt: string | null };
    permissions: string[];
    activity: ActivityItem[];
}

export interface AuditItem extends ActivityItem { ip_address?: string | null; metadata: unknown }

export interface HealthData {
    generatedAt: string;
    api: { status: string; version: string; commit: string; apiVersion: string };
    runtime: { node: string; platform: string; environment: string | null; maintenanceMode: string | null; metricsScope: string };
    database: { status: "ok" | "unavailable"; latencyMs?: number; errorCode?: string };
    readiness: ReadinessState;
    schema: { contractVersion: number };
    metrics: {
        startedAt: string;
        uptimeSeconds: number;
        http: { requests: number; errors4xx: number; errors5xx: number; slowRequests: number; averageDurationMs: number; p50DurationMs: number; p95DurationMs: number; maxDurationMs: number; byStatus: Record<string, number> };
        memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
        recentErrors: Array<Record<string, unknown>>;
    };
}

export interface TableSummary { name: string; estimated_rows: number | null; data_bytes: number | null; index_bytes: number | null; comment?: string | null }
export interface TableDetail {
    name: string;
    columns: Array<{ name: string; type: string; nullable: string; default_value: string | null; key_type: string; extra: string }>;
    indexes: Array<{ name: string; non_unique: number; columns: string }>;
    references: Array<{ column_name: string; referenced_table: string; referenced_column: string }>;
}

export interface ConfigItem { key: string; group: string; description: string; dangerous: boolean; value: string | null; isSet: boolean }
export interface BackupStatus { available: boolean; reason: string; message: string; encryptionKeyConfigured: boolean; restoreFromWeb: boolean }

const unwrap = <T,>(response: { data?: { data?: T } }): T => response.data?.data as T;

export const masterControlApi = {
    session: async () => unwrap<{ id: number; username: string; role: string; access: string }>(await api.get("/admin/control/session")),
    overview: async () => unwrap<OverviewData>(await api.get("/admin/control/overview")),
    users: async (params: { search?: string; role?: string; status?: string; page?: number; pageSize?: number }) =>
        unwrap<{ items: ControlUser[]; pagination: Pagination }>(await api.get("/admin/control/users", { params })),
    user: async (id: number) => unwrap<UserDetail>(await api.get(`/admin/control/users/${id}`)),
    setUserStatus: async (id: number, status: "active" | "inactive", reason: string) =>
        unwrap<{ id: number; status: string; changed: boolean }>(await api.patch(`/admin/control/users/${id}/status`, { status, reason })),
    audit: async (params: { action?: string; entity_type?: string; user_id?: string; from?: string; to?: string; search?: string; page?: number; pageSize?: number }) =>
        unwrap<{ items: AuditItem[]; pagination: Pagination }>(await api.get("/admin/control/audit", { params })),
    health: async () => unwrap<HealthData>(await api.get("/admin/control/health")),
    tables: async () => unwrap<{ tables: TableSummary[]; sqlConsole: { enabled: boolean; reason: string } }>(await api.get("/admin/control/database/tables")),
    table: async (name: string) => unwrap<TableDetail>(await api.get(`/admin/control/database/tables/${encodeURIComponent(name)}`)),
    configuration: async () => unwrap<{ editable: boolean; source: string; items: ConfigItem[] }>(await api.get("/admin/control/configuration")),
    backup: async () => unwrap<BackupStatus>(await api.get("/admin/control/backup")),
};

export const ROLE_LABELS: Record<string, string> = {
    admin: "Admin",
    admin_ops: "Admin vận hành",
    manager: "Quản lý",
    lead: "Tổ trưởng",
    worker: "Công nhân",
};
