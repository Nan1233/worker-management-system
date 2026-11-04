import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ClipboardCheck, Cog, Database, Factory, FileStack, Server, ShieldCheck, UserCog, Users } from "lucide-react";
import type { OverviewData } from "../../services/masterControlService";
import { ROLE_LABELS } from "../../services/masterControlService";
import { Badge, ControlEmpty } from "./ControlStates";
import { formatDateTime, formatNumber } from "./controlFormat";
import { controlPath } from "./masterControlNav";

/**
 * Component / widget registry. Widgets are plain React renderers over typed data that the backend already
 * returns; a layout only references widget ids. No layout or configuration can carry executable code,
 * SQL or business rules — this is the extension point a future Page Builder will arrange.
 */
export type WidgetKind = "kpi" | "status" | "list";

export interface WidgetDefinition {
    id: string;
    title: string;
    kind: WidgetKind;
    dataSource: string;      // backend endpoint the data comes from
    description: string;
    render: (data: OverviewData) => ReactNode;
}

const kpi = (label: string, icon: ReactNode, value: number | null | undefined, sub?: string, to?: string) => {
    const body = <><div className="mcc-kpi-label">{icon}{label}</div><div className="mcc-kpi-value">{formatNumber(value)}</div>{sub ? <div className="mcc-kpi-sub">{sub}</div> : null}</>;
    return to ? <Link className="mcc-card mcc-kpi mcc-link-card" style={{ display: "block" }} to={to}>{body}</Link> : <div className="mcc-card mcc-kpi">{body}</div>;
};

const unavailable = (data: OverviewData) => (data.counts ? null : "Không có dữ liệu");

export const WIDGET_REGISTRY: WidgetDefinition[] = [
    { id: "kpi.users", title: "Total Users", kind: "kpi", dataSource: "GET /api/admin/control/overview → counts.users", description: "Tổng tài khoản và số đang hoạt động.",
        render: (d) => kpi("Total Users", <Users size={14} />, d.counts?.users.total, d.counts ? `${formatNumber(d.counts.users.active)} đang hoạt động` : unavailable(d) ?? undefined, controlPath("users")) },
    { id: "kpi.workers", title: "Total Workers", kind: "kpi", dataSource: "counts.users.workers", description: "Tài khoản vai trò Công nhân.",
        render: (d) => kpi("Workers", <UserCog size={14} />, d.counts?.users.workers, undefined, `${controlPath("users")}?role=worker`) },
    { id: "kpi.managers", title: "Total Managers", kind: "kpi", dataSource: "counts.users.managers", description: "Tài khoản vai trò Quản lý.",
        render: (d) => kpi("Managers", <UserCog size={14} />, d.counts?.users.managers, undefined, `${controlPath("users")}?role=manager`) },
    { id: "kpi.leads", title: "Total Leads", kind: "kpi", dataSource: "counts.users.leads", description: "Tài khoản vai trò Tổ trưởng.",
        render: (d) => kpi("Leads", <UserCog size={14} />, d.counts?.users.leads, undefined, `${controlPath("users")}?role=lead`) },
    { id: "kpi.admins", title: "Total Admins", kind: "kpi", dataSource: "counts.users.admins / adminOps", description: "Admin và Admin vận hành.",
        render: (d) => kpi("Admins", <ShieldCheck size={14} />, d.counts?.users.admins, d.counts ? `${formatNumber(d.counts.users.superAdmins)} Super Admin · ${formatNumber(d.counts.users.adminOps)} Admin vận hành` : undefined, `${controlPath("users")}?role=admin`) },
    { id: "kpi.processes", title: "Total Processes", kind: "kpi", dataSource: "counts.processes", description: "Công đoạn (đang dùng / tổng).",
        render: (d) => kpi("Processes", <Factory size={14} />, d.counts?.processes.total, d.counts ? `${formatNumber(d.counts.processes.active)} đang dùng` : undefined, "/admin/master/processes") },
    { id: "kpi.machines", title: "Total Machines", kind: "kpi", dataSource: "counts.machines", description: "Máy (đang dùng / tổng).",
        render: (d) => kpi("Machines", <Cog size={14} />, d.counts?.machines.total, d.counts ? `${formatNumber(d.counts.machines.active)} đang dùng` : undefined, "/admin/master/machines") },
    { id: "kpi.reports", title: "Production Reports", kind: "kpi", dataSource: "counts.productionReports", description: "Báo cáo đã duyệt (không tính bản đã xóa).",
        render: (d) => kpi("Production Reports", <FileStack size={14} />, d.counts?.productionReports, "Đã duyệt", "/admin/approved") },
    { id: "kpi.pending", title: "Pending Approvals", kind: "kpi", dataSource: "counts.pendingApprovals", description: "Báo cáo tạm pending / need_fix.",
        render: (d) => kpi("Pending Approvals", <ClipboardCheck size={14} />, d.counts?.pendingApprovals, "pending + need_fix", "/admin/reports") },
    { id: "status.system", title: "System Status", kind: "status", dataSource: "overview.api / database / readiness / backgroundJobs / backup", description: "Trạng thái API, DB, readiness, tiến trình nền, backup — chỉ từ dữ liệu kiểm chứng được.",
        render: (d) => <div className="mcc-card">
            <div className="mcc-card-head"><div><h2>System Status</h2><p>Cập nhật {formatDateTime(d.generatedAt)}</p></div><Link className="mcc-btn" to={controlPath("health")}><Server size={14} />Chi tiết</Link></div>
            <div>
                <div className="mcc-status-row"><div><span className="mcc-dot mcc-dot-ok" />API <small>v{d.api.version} · {d.api.environment || "môi trường chưa đặt"}</small></div><Badge tone="success">Đang phản hồi</Badge></div>
                <div className="mcc-status-row"><div><span className={`mcc-dot ${d.database.status === "ok" ? "mcc-dot-ok" : "mcc-dot-bad"}`} />Database <small>{d.database.status === "ok" ? `${d.database.latencyMs} ms (truy vấn tổng quan)` : d.database.errorCode}</small></div><Badge tone={d.database.status === "ok" ? "success" : "danger"}>{d.database.status === "ok" ? "OK" : "Không truy vấn được"}</Badge></div>
                <div className="mcc-status-row"><div><span className={`mcc-dot ${d.readiness.ready ? "mcc-dot-ok" : d.readiness.ready === false ? "mcc-dot-bad" : ""}`} />Readiness <small>{d.readiness.schemaStatus || "—"} · contract v{d.readiness.schemaContractVersion ?? "—"}</small></div><Badge tone={d.readiness.ready ? "success" : d.readiness.ready === false ? "danger" : "neutral"}>{d.readiness.ready ? "Ready" : d.readiness.ready === false ? "Not ready" : "Chưa xác minh"}</Badge></div>
                <div className="mcc-status-row"><div><span className="mcc-dot" />Background jobs <small>{d.backgroundJobs.reason}</small></div><Badge>Not available</Badge></div>
                <div className="mcc-status-row"><div><span className="mcc-dot" />Backup gần nhất <small>{d.backup.reason}</small></div><Badge>Not available</Badge></div>
            </div>
        </div> },
    { id: "list.alerts", title: "System Alerts", kind: "list", dataSource: "overview.alerts", description: "Cảnh báo suy ra từ trạng thái runtime thật (DB, readiness, maintenance, cấu hình).",
        render: (d) => <div className="mcc-card">
            <div className="mcc-card-head"><div><h2>System Alerts</h2><p>Chỉ hiển thị cảnh báo có bằng chứng runtime</p></div><AlertTriangle size={16} className="mcc-muted" /></div>
            {d.alerts.length ? <ul className="mcc-list">{d.alerts.map((alert) => <li key={alert.code}><span>{alert.message}</span><Badge tone={alert.level === "critical" ? "danger" : "warning"}>{alert.code}</Badge></li>)}</ul>
                : <div className="mcc-card-body"><ControlEmpty title="Không có cảnh báo">Các kiểm tra hiện có (DB, readiness, maintenance, cấu hình chẩn đoán) không phát hiện vấn đề.</ControlEmpty></div>}
        </div> },
    { id: "list.activity", title: "Latest Admin Activities", kind: "list", dataSource: "overview.recentActivity (activity_logs của admin/admin_ops)", description: "10 hoạt động gần nhất của tài khoản quản trị.",
        render: (d) => <div className="mcc-card">
            <div className="mcc-card-head"><div><h2>Latest Admin Activities</h2><p>activity_logs · admin / admin_ops</p></div><Link className="mcc-btn" to={controlPath("audit")}><Database size={14} />Audit Center</Link></div>
            {d.recentActivityError ? <div className="mcc-card-body"><div className="mcc-notice mcc-notice-warning">Không tải được nhật ký: {d.recentActivityError}</div></div>
                : d.recentActivity.length ? <ul className="mcc-list">{d.recentActivity.map((item) => <li key={item.id}><span><strong>{item.full_name || item.username || `#${item.user_id}`}</strong> <span className="mcc-muted">({ROLE_LABELS[item.role || ""] || item.role})</span> · {item.description || item.action}</span><span className="mcc-muted mcc-mono">{formatDateTime(item.created_at)}</span></li>)}</ul>
                    : <div className="mcc-card-body"><ControlEmpty title="Chưa có hoạt động quản trị" /></div>}
        </div> },
];

export const WIDGETS_BY_ID = new Map(WIDGET_REGISTRY.map((widget) => [widget.id, widget]));

/** Built-in Overview layout (code-defined; persisted layouts require the Page Builder schema approval). */
export const OVERVIEW_LAYOUT: { kpis: string[]; columns: string[][] } = {
    kpis: ["kpi.users", "kpi.workers", "kpi.managers", "kpi.leads", "kpi.admins", "kpi.processes", "kpi.machines", "kpi.reports", "kpi.pending"],
    columns: [["status.system", "list.alerts"], ["list.activity"]],
};
