import { useEffect, useRef } from "react";
import { PROCESS_DRAFT_SAVE_FAILED_EVENT } from "./processDraftStorage";

/** Show a single warning per page mount when local draft persistence fails. */
export function useProcessDraftSaveWarning(
    showToast: (message: string, tone: "warning") => void,
): void {
    const warningShownRef = useRef(false);
    useEffect(() => {
        const onDraftSaveFailed = () => {
            if (warningShownRef.current) return;
            warningShownRef.current = true;
            showToast(
                "Không thể lưu bản nháp trên thiết bị. Hãy giữ trang này mở và kiểm tra bộ nhớ trước khi rời trang.",
                "warning",
            );
        };
        window.addEventListener(PROCESS_DRAFT_SAVE_FAILED_EVENT, onDraftSaveFailed);
        return () => window.removeEventListener(PROCESS_DRAFT_SAVE_FAILED_EVENT, onDraftSaveFailed);
    }, [showToast]);
}
