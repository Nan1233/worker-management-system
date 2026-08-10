import { useEffect } from "react";
import { useToast } from "./feedback/toastContext";

export default function DesktopExcelDbSyncNotifier() {
    const { showToast } = useToast();
    useEffect(() => {
        if (!window.ktcDesktop?.onExcelDbSyncResult) return;
        return window.ktcDesktop.onExcelDbSyncResult((result) => {
            if (!result?.detected) return;
            if (result.failed > 0) {
                showToast(`Excel → DB: ${result.succeeded} dòng thành công, ${result.failed} dòng cần kiểm tra.`, "warning");
            } else {
                showToast(`Đã cập nhật ${result.succeeded} dòng từ Excel vào DB.`, "success");
            }
        });
    }, [showToast]);
    return null;
}
