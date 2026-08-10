import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    getActivities,
    getDeletedReports,
    getNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    type ActivityItem,
    type DeletedReportItem,
    type NotificationItem,
    getObservability,
    type ObservabilitySnapshot
} from "../../services/systemService";
import { publishNotificationCount } from "../../hooks/useNotificationBadge";
import { getStoredUser } from "../../utils/authStorage";
import { usePermissions } from "../../hooks/usePermissions";
import "./SystemCenter.css";

const prettyMetadata = (value: unknown): string => {
    if (!value) return "";
    let parsed: unknown = value;
    if (typeof parsed === "string") {
        try { parsed = JSON.parse(parsed); } catch { return String(value); }
    }
    try { return JSON.stringify(parsed, null, 2); } catch { return String(value); }
};

export default function SystemCenter() {
    const [tab, setTab] = useState<"notifications" | "activities" | "deleted" | "monitoring">("notifications");
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [deletedReports, setDeletedReports] = useState<DeletedReportItem[]>([]);
    const [observability, setObservability] = useState<ObservabilitySnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [activitySearch, setActivitySearch] = useState("");
    const [activityAction, setActivityAction] = useState("");
    const [activityFrom, setActivityFrom] = useState("");
    const [activityTo, setActivityTo] = useState("");
    const navigate = useNavigate();
    const currentUser = getStoredUser();
    const isWorker = currentUser?.role === "worker";
    const { can } = usePermissions();
    const canAudit = !isWorker && can("AUDIT_VIEW");
    const canMonitor = !isWorker && can("SYSTEM_HEALTH_VIEW");

    const load = useCallback(async (silent = false) => {
        if (silent) setRefreshing(true); else setLoading(true);
        setError("");
        const [notificationResult, activityResult, deletedResult, monitoringResult] = await Promise.allSettled([
            getNotifications(),
            canAudit ? getActivities({
                search: activitySearch,
                action: activityAction,
                from: activityFrom,
                to: activityTo,
                limit: 150
            }) : Promise.resolve([] as ActivityItem[]),
            canAudit ? getDeletedReports() : Promise.resolve([] as DeletedReportItem[]),
            canMonitor ? getObservability() : Promise.resolve(null)
        ]);

        if (notificationResult.status === "fulfilled") {
            setNotifications(notificationResult.value.data || []);
            publishNotificationCount(notificationResult.value.unread || 0);
        } else {
            setError(notificationResult.reason?.response?.data?.message || "Không tải được thông báo");
        }
        if (activityResult.status === "fulfilled") setActivities(activityResult.value || []);
        else setError(current => current || activityResult.reason?.response?.data?.message || "Không tải được lịch sử hoạt động");
        if (deletedResult.status === "fulfilled") setDeletedReports(deletedResult.value || []);
        else setError(current => current || deletedResult.reason?.response?.data?.message || "Không tải được dữ liệu đã xóa");
        if (monitoringResult.status === "fulfilled") setObservability(monitoringResult.value);
        setLoading(false);
        setRefreshing(false);
    }, [canAudit, canMonitor, activitySearch, activityAction, activityFrom, activityTo]);

    useEffect(() => {
        void load(false);
        const timer = window.setInterval(() => void load(true), 30_000);
        const onVisible = () => { if (document.visibilityState === "visible") void load(true); };
        document.addEventListener("visibilitychange", onVisible);
        return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
    }, [load]);

    const actionOptions = useMemo(
        () => Array.from(new Set(activities.map(item => item.action).filter(Boolean))).sort(),
        [activities]
    );

    const open = async (item: NotificationItem) => {
        if (!item.is_read) {
            await markNotificationRead(item.id);
            setNotifications(current => {
                const next = current.map(value => value.id === item.id ? { ...value, is_read: 1 } : value);
                publishNotificationCount(next.filter(value => !value.is_read).length);
                return next;
            });
        }
        if (item.link_url) navigate(item.link_url);
    };

    const markAllRead = async () => {
        await markAllNotificationsRead();
        publishNotificationCount(0);
        setNotifications(current => current.map(item => ({ ...item, is_read: 1 })));
    };

    return (
        <section className="system-center">
            <header>
                <div>
                    <h1>{isWorker ? "Thông báo của tôi" : "Trung tâm hệ thống"}</h1>
                    <p>{isWorker ? "Theo dõi trạng thái duyệt và phản hồi báo cáo" : "Theo dõi ai đã thêm, sửa, xóa, cập nhật dữ liệu và thông báo hệ thống"} {refreshing ? "· đang cập nhật" : ""}</p>
                </div>
                <button type="button" onClick={() => void markAllRead()}>Đánh dấu đã đọc</button>
            </header>

            <div className="system-tabs">
                <button className={tab === "notifications" ? "active" : ""} onClick={() => setTab("notifications")}>Thông báo ({notifications.filter(item => !item.is_read).length})</button>
                {canAudit && <button className={tab === "activities" ? "active" : ""} onClick={() => setTab("activities")}>Nhật ký thay đổi</button>}
                {canAudit && <button className={tab === "deleted" ? "active" : ""} onClick={() => setTab("deleted")}>Dữ liệu đã xóa ({deletedReports.length})</button>}
                {canMonitor && <button className={tab === "monitoring" ? "active" : ""} onClick={() => setTab("monitoring")}>Giám sát</button>}
            </div>

            {tab === "activities" && canAudit && (
                <div className="system-audit-filters">
                    <input value={activitySearch} onChange={event => setActivitySearch(event.target.value)} placeholder="Tìm người, thao tác, dữ liệu..." />
                    <select value={activityAction} onChange={event => setActivityAction(event.target.value)}>
                        <option value="">Tất cả hành động</option>
                        {actionOptions.map(action => <option key={action} value={action}>{action}</option>)}
                    </select>
                    <label><span>Từ ngày</span><input type="date" value={activityFrom} onChange={event => setActivityFrom(event.target.value)} /></label>
                    <label><span>Đến ngày</span><input type="date" min={activityFrom || undefined} value={activityTo} onChange={event => setActivityTo(event.target.value)} /></label>
                    <button type="button" onClick={() => void load(false)}>Lọc / tải lại</button>
                </div>
            )}

            {error && <div className="system-error">{error}<button type="button" onClick={() => void load(false)}>Thử lại</button></div>}

            {loading ? <div className="system-empty">Đang tải...</div> : tab === "notifications" ? (
                <div className="system-list">
                    {notifications.length ? notifications.map(item => (
                        <button key={item.id} className={`system-item ${!item.is_read ? "unread" : ""}`} onClick={() => void open(item)}>
                            <span className="dot" /><div><strong>{item.title}</strong><p>{item.message}</p><small>{new Date(item.created_at).toLocaleString("vi-VN")}</small></div>
                        </button>
                    )) : <div className="system-empty">Chưa có thông báo</div>}
                </div>
            ) : tab === "activities" ? (
                <div className="system-list">
                    {activities.length ? activities.map(item => {
                        const metadata = prettyMetadata(item.metadata_json);
                        return <article key={item.id} className="system-item system-activity-item">
                            <span className="activity-icon">•</span>
                            <div className="system-activity-content">
                                <div className="system-activity-title"><strong>{item.description || item.action}</strong><code>{item.action}</code></div>
                                <p><b>{item.full_name || item.username || "Hệ thống"}</b>{item.role ? ` · ${item.role}` : ""} · {item.entity_type || "system"} {item.entity_id ? `#${item.entity_id}` : ""}</p>
                                <small>{new Date(item.created_at).toLocaleString("vi-VN")}{item.ip_address ? ` · IP ${item.ip_address}` : ""}</small>
                                {metadata && <details><summary>Xem dữ liệu thay đổi</summary><pre>{metadata}</pre></details>}
                            </div>
                        </article>;
                    }) : <div className="system-empty">Chưa có hoạt động</div>}
                </div>
            ) : tab === "deleted" ? (
                <div className="system-list">
                    {deletedReports.length ? deletedReports.map(item => (
                        <article key={item.id} className="system-item system-deleted-item">
                            <span className="activity-icon">×</span>
                            <div className="system-activity-content">
                                <strong>#{item.id} · {item.worker_code || "---"} · {item.full_name || "---"}</strong>
                                <p>{item.process_name || item.process_code || "---"} · {String(item.work_date || "").slice(0,10)} · {item.product_name || "---"}</p>
                                <small>{item.review_note || "Đã xóa"}</small>
                            </div>
                            <button type="button" className="system-open-deleted" onClick={() => navigate(`/${currentUser?.role || "manager"}/report/${item.id}?source=approved`)}>Xem phiên bản / khôi phục</button>
                        </article>
                    )) : <div className="system-empty">Chưa có báo cáo đã xóa</div>}
                </div>
            ) : (
                <div className="system-monitor-grid">
                    <article className="system-monitor-card"><span>Database</span><strong>{observability?.database.status === "ok" ? "Hoạt động" : "Không khả dụng"}</strong><small>{observability?.database.latencyMs ?? "-"} ms</small></article>
                    <article className="system-monitor-card"><span>API requests</span><strong>{observability?.http.requests ?? 0}</strong><small>TB {observability?.http.averageDurationMs ?? 0} ms</small></article>
                    <article className="system-monitor-card"><span>Lỗi 5xx</span><strong>{observability?.http.errors5xx ?? 0}</strong><small>4xx: {observability?.http.errors4xx ?? 0}</small></article>
                    <article className="system-monitor-card"><span>RAM</span><strong>{observability?.memory.rssMb ?? 0} MB</strong><small>Heap {observability?.memory.heapUsedMb ?? 0}/{observability?.memory.heapTotalMb ?? 0} MB</small></article>
                    <article className="system-monitor-card"><span>Request chậm</span><strong>{observability?.http.slowRequests ?? 0}</strong><small>Max {observability?.http.maxDurationMs ?? 0} ms</small></article>
                    <article className="system-monitor-card"><span>Uptime</span><strong>{Math.floor((observability?.uptimeSeconds ?? 0)/3600)} giờ</strong><small>Từ {observability?.startedAt ? new Date(observability.startedAt).toLocaleString("vi-VN") : "-"}</small></article>
                    <div className="system-monitor-errors"><h3>Lỗi server gần nhất</h3>{observability?.recentErrors?.length ? observability.recentErrors.map((item,index)=><div key={`${item.requestId}-${index}`}><code>{item.status}</code><span>{item.method} {item.path}</span><small>{item.requestId || "-"}</small></div>) : <p>Chưa ghi nhận lỗi 5xx trong tiến trình hiện tại.</p>}</div>
                </div>
            )}
        </section>
    );
}
