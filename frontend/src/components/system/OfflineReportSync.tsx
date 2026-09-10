import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../feedback/toastContext";
import {
    flushOfflineReportQueue,
    getCurrentOfflineQueueCount,
    getCurrentOfflineQueueItems,
    OFFLINE_QUEUE_CHANGED_EVENT,
    removeOfflineReport,
    retryBlockedOfflineReport,
    type OfflineReportQueueItem
} from "../../services/offlineReportQueue";

function statusText(item: OfflineReportQueueItem): string {
    if (item.status === "blocked") return "Cần kiểm tra";
    if (item.status === "retrying") return "Đang chờ thử lại";
    return "Chờ đồng bộ";
}

export default function OfflineReportSync() {
    const { showToast } = useToast();
    const syncing = useRef(false);
    const manualSyncPending = useRef(false);
    const [items, setItems] = useState<OfflineReportQueueItem[]>(() => getCurrentOfflineQueueItems());
    const [open, setOpen] = useState(false);
    const refreshItems = useCallback(() => setItems(getCurrentOfflineQueueItems()), []);

    const sync = useCallback(async (manual = false, force = false) => {
        if (syncing.current) {
            // A background 15-second sync can start at the same moment the user
            // taps "Đồng bộ ngay". Do not silently ignore the tap; remember it
            // and run a forced sync immediately after the current one finishes.
            if (manual) manualSyncPending.current = true;
            return;
        }
        if (getCurrentOfflineQueueCount() === 0) return;

        syncing.current = true;
        try {
            const result = await flushOfflineReportQueue({ force: manual && force });
            const queue = getCurrentOfflineQueueItems();
            setItems(queue);
            const blocked = queue.filter((item) => item.status === "blocked").length;
            if (result.sent > 0) {
                showToast(`Đã đồng bộ ${result.sent} báo cáo chờ gửi${result.remaining ? `, còn ${result.remaining} báo cáo` : ""}.`, result.remaining ? "warning" : "success");
            } else if (blocked > 0 && manual) {
                showToast(`${blocked} báo cáo cần kiểm tra trước khi gửi lại. Dữ liệu vẫn được giữ trên thiết bị.`, "warning");
            } else if (manual && result.remaining > 0) {
                showToast("Chưa đồng bộ được. Hệ thống vẫn giữ nguyên dữ liệu trên thiết bị và sẽ thử lại.", "warning");
            }
        } catch (error) {
            if (manual) {
                showToast("Không thể đồng bộ lúc này. Dữ liệu vẫn được giữ trên thiết bị.", "warning");
            }
            console.error("[KTC][OFFLINE_SYNC] flush failed", error);
        } finally {
            syncing.current = false;
            if (manualSyncPending.current) {
                manualSyncPending.current = false;
                void sync(true, true);
            }
        }
    }, [showToast]);

    useEffect(() => {
        const onOnline = () => void sync(false, false);
        const onQueueChanged = () => {
            refreshItems();
            void sync(false, false);
        };
        window.addEventListener("online", onOnline);
        window.addEventListener(OFFLINE_QUEUE_CHANGED_EVENT, onQueueChanged);
        window.addEventListener("storage", onQueueChanged);
        const timer = window.setInterval(() => void sync(false, false), 15_000);
        void sync(false, false);
        return () => {
            window.removeEventListener("online", onOnline);
            window.removeEventListener(OFFLINE_QUEUE_CHANGED_EVENT, onQueueChanged);
            window.removeEventListener("storage", onQueueChanged);
            window.clearInterval(timer);
        };
    }, [refreshItems, sync]);

    const blocked = useMemo(() => items.filter(item => item.status === "blocked").length, [items]);
    if (!items.length) return null;

    return (
        <div className={`offline-sync ${blocked ? "offline-sync--warning" : ""}`} role="status" aria-live="polite">
            <button type="button" className="offline-sync__summary" onClick={() => setOpen(value => !value)} aria-expanded={open}>
                <span className="offline-sync__dot" />
                <span><strong>{items.length} báo cáo chưa đồng bộ</strong>{blocked ? ` · ${blocked} cần kiểm tra` : " · đang kiểm tra kết nối máy chủ"}</span>
                <span aria-hidden="true">{open ? "▴" : "▾"}</span>
            </button>
            {open && <div className="offline-sync__panel">
                {items.map(item => <article key={item.id} className="offline-sync__item">
                    <div>
                        <strong>{String(item.payload.work_date || "Báo cáo")}</strong>
                        <span>{statusText(item)} · thử {item.attempts || 0} lần</span>
                        {item.lastError && <small>{item.lastError}</small>}
                    </div>
                    <div className="offline-sync__actions">
                        {item.status === "blocked" && <button type="button" onClick={() => { retryBlockedOfflineReport(item.id); refreshItems(); void sync(true, true); }}>Thử lại</button>}
                        <button type="button" className="danger" onClick={() => { if (window.confirm("Xóa báo cáo đang chờ này khỏi thiết bị? Chỉ xóa khi bạn chắc chắn không cần gửi nữa.")) { removeOfflineReport(item.id); refreshItems(); } }}>Xóa</button>
                    </div>
                </article>)}
                <button type="button" className="offline-sync__retry" onClick={() => void sync(true, true)}>Đồng bộ ngay</button>
            </div>}
        </div>
    );
}
