import { useEffect, useRef } from "react";
import { useToast } from "../feedback/toastContext";
import { flushOfflineReportQueue, getCurrentOfflineQueueCount } from "../../services/offlineReportQueue";

export default function OfflineReportSync() {
    const { showToast } = useToast();
    const syncing = useRef(false);

    useEffect(() => {
        const sync = async () => {
            if (syncing.current || !navigator.onLine || getCurrentOfflineQueueCount() === 0) return;
            syncing.current = true;
            try {
                const result = await flushOfflineReportQueue();
                if (result.sent > 0) {
                    showToast(`Đã đồng bộ ${result.sent} báo cáo chờ gửi${result.remaining ? `, còn ${result.remaining} báo cáo` : ""}.`, result.remaining ? "warning" : "success");
                }
            } finally {
                syncing.current = false;
            }
        };
        window.addEventListener("online", sync);
        const timer = window.setInterval(sync, 60_000);
        void sync();
        return () => {
            window.removeEventListener("online", sync);
            window.clearInterval(timer);
        };
    }, [showToast]);

    return null;
}
