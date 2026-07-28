import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    getActivities,
    getNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    type ActivityItem,
    type NotificationItem
} from "../../services/systemService";
import { publishNotificationCount } from "../../hooks/useNotificationBadge";
import "./SystemCenter.css";

export default function SystemCenter() {
    const [tab, setTab] = useState<"notifications" | "activities">("notifications");
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const navigate = useNavigate();

    const load = useCallback(async (silent = false) => {
        if (silent) setRefreshing(true);
        else setLoading(true);
        setError("");

        const [notificationResult, activityResult] = await Promise.allSettled([
            getNotifications(),
            getActivities()
        ]);

        if (notificationResult.status === "fulfilled") {
            setNotifications(notificationResult.value.data || []);
            publishNotificationCount(notificationResult.value.unread || 0);
        } else {
            setError(notificationResult.reason?.response?.data?.message || "Không tải được thông báo");
        }

        if (activityResult.status === "fulfilled") {
            setActivities(activityResult.value || []);
        } else {
            setError((current) => current || activityResult.reason?.response?.data?.message || "Không tải được lịch sử hoạt động");
        }

        setLoading(false);
        setRefreshing(false);
    }, []);

    useEffect(() => {
        void load(false);
        const timer = window.setInterval(() => void load(true), 30_000);
        const onVisible = () => {
            if (document.visibilityState === "visible") void load(true);
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [load]);

    const open = async (item: NotificationItem) => {
        if (!item.is_read) {
            await markNotificationRead(item.id);
            setNotifications((current) => {
                const next = current.map((value) => value.id === item.id ? { ...value, is_read: 1 } : value);
                publishNotificationCount(next.filter((value) => !value.is_read).length);
                return next;
            });
        }
        if (item.link_url) navigate(item.link_url);
    };

    const markAllRead = async () => {
        await markAllNotificationsRead();
        publishNotificationCount(0);
        setNotifications((current) => current.map((item) => ({ ...item, is_read: 1 })));
    };

    return (
        <section className="system-center">
            <header>
                <div>
                    <h1>Trung tâm hệ thống</h1>
                    <p>Theo dõi thông báo và lịch sử hoạt động {refreshing ? "· đang cập nhật" : ""}</p>
                </div>
                <button type="button" onClick={() => void markAllRead()}>Đánh dấu đã đọc</button>
            </header>

            <div className="system-tabs">
                <button className={tab === "notifications" ? "active" : ""} onClick={() => setTab("notifications")}>
                    Thông báo ({notifications.filter((item) => !item.is_read).length})
                </button>
                <button className={tab === "activities" ? "active" : ""} onClick={() => setTab("activities")}>
                    Lịch sử hoạt động
                </button>
            </div>

            {error && <div className="system-error">{error}<button type="button" onClick={() => void load(false)}>Thử lại</button></div>}

            {loading ? (
                <div className="system-empty">Đang tải...</div>
            ) : tab === "notifications" ? (
                <div className="system-list">
                    {notifications.length ? notifications.map((item) => (
                        <button key={item.id} className={`system-item ${!item.is_read ? "unread" : ""}`} onClick={() => void open(item)}>
                            <span className="dot" />
                            <div>
                                <strong>{item.title}</strong>
                                <p>{item.message}</p>
                                <small>{new Date(item.created_at).toLocaleString("vi-VN")}</small>
                            </div>
                        </button>
                    )) : <div className="system-empty">Chưa có thông báo</div>}
                </div>
            ) : (
                <div className="system-list">
                    {activities.length ? activities.map((item) => (
                        <article key={item.id} className="system-item">
                            <span className="activity-icon">↺</span>
                            <div>
                                <strong>{item.description || item.action}</strong>
                                <p>{item.full_name || item.username || "Hệ thống"} · {item.entity_type || "system"} {item.entity_id ? `#${item.entity_id}` : ""}</p>
                                <small>{new Date(item.created_at).toLocaleString("vi-VN")}</small>
                            </div>
                        </article>
                    )) : <div className="system-empty">Chưa có hoạt động</div>}
                </div>
            )}
        </section>
    );
}
