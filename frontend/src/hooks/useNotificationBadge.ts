import { useCallback, useEffect, useState } from "react";
import { getUnreadNotificationCount } from "../services/systemService";

const POLL_INTERVAL_MS = 30_000;
export const NOTIFICATION_COUNT_CHANGED_EVENT = "ktc:notification-count-changed";

function readCachedCount(): number {
    const value = Number(sessionStorage.getItem("ktc_unread_notifications") || 0);
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

export function publishNotificationCount(count: number) {
    const normalized = Math.max(0, Math.trunc(Number(count) || 0));
    sessionStorage.setItem("ktc_unread_notifications", String(normalized));
    window.dispatchEvent(new CustomEvent(NOTIFICATION_COUNT_CHANGED_EVENT, { detail: normalized }));
}

export function useNotificationBadge() {
    const [unreadCount, setUnreadCount] = useState(readCachedCount);

    const refresh = useCallback(async () => {
        try {
            const count = await getUnreadNotificationCount();
            publishNotificationCount(count);
        } catch {
            // Giữ số cũ nếu mạng hoặc Render tạm thời chậm.
        }
    }, []);

    useEffect(() => {
        const onCountChanged = (event: Event) => {
            const customEvent = event as CustomEvent<number>;
            setUnreadCount(Math.max(0, Math.trunc(Number(customEvent.detail) || 0)));
        };
        const onVisible = () => {
            if (document.visibilityState === "visible") void refresh();
        };

        window.addEventListener(NOTIFICATION_COUNT_CHANGED_EVENT, onCountChanged);
        document.addEventListener("visibilitychange", onVisible);
        void refresh();
        const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);

        return () => {
            window.clearInterval(timer);
            window.removeEventListener(NOTIFICATION_COUNT_CHANGED_EVENT, onCountChanged);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [refresh]);

    return { unreadCount, refreshNotifications: refresh };
}
