import { useEffect, useState } from "react";
import "./NetworkStatusBanner.css";

export default function NetworkStatusBanner() {
    const [online, setOnline] = useState(() => navigator.onLine);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const handleOffline = () => {
            setOnline(false);
            setVisible(true);
        };
        const handleOnline = () => {
            setOnline(true);
            setVisible(true);
            const timer = window.setTimeout(() => setVisible(false), 3200);
            return () => window.clearTimeout(timer);
        };
        window.addEventListener("offline", handleOffline);
        window.addEventListener("online", handleOnline);
        return () => {
            window.removeEventListener("offline", handleOffline);
            window.removeEventListener("online", handleOnline);
        };
    }, []);

    if (!visible) return null;

    return (
        <div className={`ktc-network-banner ${online ? "is-online" : "is-offline"}`} role="status" aria-live="polite">
            <span className="ktc-network-dot" aria-hidden="true" />
            <span>
                {online
                    ? "Đã kết nối mạng. Bạn có thể tiếp tục thao tác."
                    : "Mất kết nối mạng. Báo cáo sẽ được giữ lại và đồng bộ khi có mạng."}
            </span>
        </div>
    );
}
