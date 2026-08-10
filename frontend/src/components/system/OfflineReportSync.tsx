import { useEffect, useRef } from "react";
import { useToast } from "../feedback/toastContext";
import { flushOfflineReportQueue, getCurrentOfflineQueueCount, getCurrentOfflineQueueItems } from "../../services/offlineReportQueue";

export default function OfflineReportSync() {
    const { showToast } = useToast();
    const syncing = useRef(false);

    useEffect(() => {
        const sync = async () => {
            if (syncing.current || !navigator.onLine || getCurrentOfflineQueueCount() === 0) return;
            syncing.current = true;
            try {
                const result = await flushOfflineReportQueue();
                const queue = getCurrentOfflineQueueItems();
                const blocked = queue.filter((item) => item.status === "blocked").length;
                if (result.sent > 0) {
                    showToast(`Đã đồng bộ ${result.sent} báo cáo chờ gửi${result.remaining ? `, còn ${result.remaining} báo cáo` : ""}.`, result.remaining ? "warning" : "success");
                } else if (blocked > 0) {
                    showToast(`${blocked} báo cáo offline cần kiểm tra trước khi gửi lại. Dữ liệu vẫn được giữ trên thiết bị.`, "warning");
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
