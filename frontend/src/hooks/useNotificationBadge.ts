import { useCallback, useEffect, useRef, useState } from "react";
import { getUnreadNotificationCount } from "../services/systemService";
import { isAuthRefreshInProgress, refreshAccessToken } from "../services/api";
import { getAccessToken } from "../utils/authStorage";

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
    const pausedUntilRef = useRef(0);

    const refresh = useCallback(async () => {
        if (
            loadingRef.current ||
            Date.now() < pausedUntilRef.current ||
            !navigator.onLine ||
            document.visibilityState !== "visible" ||
            isAuthRefreshInProgress() ||
            !getAccessToken()
        ) {
            return;
        }

        loadingRef.current = true;
        try {
            const count = await getUnreadNotificationCount();
            if (mountedRef.current) publishNotificationCount(count);
        } catch (error: any) {
            // 401 có thể xuất hiện trong khoảnh khắc backend vừa deploy. Tạm dừng
            // badge để không tạo bão request; interceptor giữ và refresh phiên.
            if (Number(error?.response?.status) === 401) {
                pausedUntilRef.current = Date.now() + 15_000;
                try {
                    await refreshAccessToken(true);
                    pausedUntilRef.current = 0;
                    const count = await getUnreadNotificationCount();
                    if (mountedRef.current) publishNotificationCount(count);
                } catch {
                    // Giữ phiên và chờ online/foreground thay vì tiếp tục polling.
                }
            }
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
