import { useEffect, useState } from "react";
import { CONNECTION_LOST_EVENT, CONNECTION_RESTORED_EVENT } from "../../services/authRuntimeEvents";
const ONLINE_MESSAGE_MS = 3200;

export default function NetworkStatusBanner() {
    const [online, setOnline] = useState(() => navigator.onLine);
    const [visible, setVisible] = useState(() => !navigator.onLine);
    const [serverUnavailable, setServerUnavailable] = useState(false);

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

        const handleServerLost = () => {
            clearHideTimer();
            setServerUnavailable(true);
            setVisible(true);
        };
        const handleServerRestored = () => {
            setServerUnavailable(false);
            if (navigator.onLine) handleOnline();
        };
        window.addEventListener(CONNECTION_LOST_EVENT, handleServerLost);
        window.addEventListener(CONNECTION_RESTORED_EVENT, handleServerRestored);
        window.addEventListener("offline", handleOffline);
        window.addEventListener("online", handleOnline);

        return () => {
            clearHideTimer();
            window.removeEventListener(CONNECTION_LOST_EVENT, handleServerLost);
            window.removeEventListener(CONNECTION_RESTORED_EVENT, handleServerRestored);
            window.removeEventListener("offline", handleOffline);
            window.removeEventListener("online", handleOnline);
        };
    }, []);

    if (!visible && !serverUnavailable) return null;
    const connected = online && !serverUnavailable;

    return (
        <div
            className={`ktc-network-banner ${connected ? "is-online" : "is-offline"}`}
            role={connected ? "status" : "alert"}
            aria-live="polite"
        >
            <span className="ktc-network-dot" aria-hidden="true" />
            <span>
                {connected
                    ? "Đã kết nối mạng. Bạn có thể tiếp tục thao tác."
                    : !online ? "Mất kết nối mạng. Kiểm tra báo cáo chờ đồng bộ trước khi đóng ứng dụng."
                    : "Chưa kết nối được máy chủ. Hãy kiểm tra trạng thái lưu trước khi gửi lại báo cáo."}
            </span>
        </div>
    );
}
