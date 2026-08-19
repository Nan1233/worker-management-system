import { useEffect, useState } from "react";
import "./NetworkStatusBanner.css";

const ONLINE_MESSAGE_MS = 3200;

export default function NetworkStatusBanner() {
    const [online, setOnline] = useState(() => navigator.onLine);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        let hideTimer: number | undefined;

        const clearHideTimer = () => {
            if (hideTimer !== undefined) {
                window.clearTimeout(hideTimer);
                hideTimer = undefined;
            }
        };

        const handleOffline = () => {
            clearHideTimer();
            setOnline(false);
            setVisible(true);
        };

        const handleOnline = () => {
            clearHideTimer();
            setOnline(true);
            setVisible(true);
            hideTimer = window.setTimeout(() => {
                setVisible(false);
                hideTimer = undefined;
            }, ONLINE_MESSAGE_MS);
        };

        window.addEventListener("offline", handleOffline);
        window.addEventListener("online", handleOnline);

        return () => {
            clearHideTimer();
            window.removeEventListener("offline", handleOffline);
            window.removeEventListener("online", handleOnline);
        };
    }, []);

    if (!visible) return null;

    return (
        <div
            className={`ktc-network-banner ${online ? "is-online" : "is-offline"}`}
            role={online ? "status" : "alert"}
            aria-live="polite"
        >
            <span className="ktc-network-dot" aria-hidden="true" />
            <span>
                {online
                    ? "Đã kết nối mạng. Bạn có thể tiếp tục thao tác."
                    : "Mất kết nối mạng. Báo cáo sẽ được giữ lại và đồng bộ khi có mạng."}
            </span>
        </div>
    );
}
