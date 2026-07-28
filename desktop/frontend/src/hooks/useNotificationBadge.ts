import { useCallback, useEffect, useRef, useState } from "react";
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
    const loadingRef = useRef(false);
    const mountedRef = useRef(true);

    const refresh = useCallback(async () => {
        if (loadingRef.current || !navigator.onLine || !localStorage.getItem("token")) {
            return;
        }

        loadingRef.current = true;
        try {
            const count = await getUnreadNotificationCount();
            if (mountedRef.current) publishNotificationCount(count);
        } catch {
            // Giữ số cũ. Interceptor sẽ tự refresh token; không tạo request lặp.
        } finally {
            loadingRef.current = false;
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        const onCountChanged = (event: Event) => {
            const customEvent = event as CustomEvent<number>;
            setUnreadCount(Math.max(0, Math.trunc(Number(customEvent.detail) || 0)));
        };
        const onVisible = () => {
            if (document.visibilityState === "visible") void refresh();
        };
        const onConnectionRestored = () => {
            window.setTimeout(() => void refresh(), 300);
        };

        window.addEventListener(NOTIFICATION_COUNT_CHANGED_EVENT, onCountChanged);
        window.addEventListener("ktc:connection-restored", onConnectionRestored);
        document.addEventListener("visibilitychange", onVisible);

        void refresh();
        const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);

        return () => {
            mountedRef.current = false;
            window.clearInterval(timer);
            window.removeEventListener(NOTIFICATION_COUNT_CHANGED_EVENT, onCountChanged);
            window.removeEventListener("ktc:connection-restored", onConnectionRestored);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [refresh]);

    return { unreadCount, refreshNotifications: refresh };
}
