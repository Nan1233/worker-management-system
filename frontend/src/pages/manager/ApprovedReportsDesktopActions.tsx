import { useEffect, useRef, useState } from "react";
import { getToday } from "./managerReportDateLogic";
import { createPortal } from "react-dom";
import ApprovedReports from "./ApprovedReports";
import { getAccessToken } from "../../utils/authStorage";
import { usePermissions } from "../../hooks/usePermissions";
import DesktopExcelNotice from "../../components/system/DesktopExcelNotice";

function useApprovedFooter(): HTMLElement | null {
    const [footer, setFooter] = useState<HTMLElement | null>(null);

    useEffect(() => {
        if (!window.ktcDesktop?.isDesktop) return;

        const find = () => {
            const element = document.querySelector<HTMLElement>(".pending-table-footer");
            setFooter(current => current === element ? current : element);
        };

        const observer = new MutationObserver(find);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        find();
        const timers = [250, 750, 1500].map((delay) => window.setTimeout(find, delay));

        return () => {
            observer.disconnect();
            timers.forEach(window.clearTimeout);
            setFooter(null);
        };
    }, []);

    return footer;
}

export default function ApprovedReportsDesktopActions() {
    const footer = useApprovedFooter();
    const { can } = usePermissions();
    const canExport = can("REPORT_EXPORT");
    const [busy, setBusy] = useState(false);
    const syncLockRef = useRef(false);
    const [syncMessage, setSyncMessage] = useState("");
    const [syncSuccess, setSyncSuccess] = useState(false);

    const updateExcel = async () => {
        if (!window.ktcDesktop?.syncAllExcel || syncLockRef.current) return;

        const token = getAccessToken();
        if (!token) {
            setSyncSuccess(false);
            setSyncMessage("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại trước khi cập nhật Excel.");
            return;
        }

        const dateInput = document.querySelector<HTMLInputElement>(".pending-filter-card input[type='date']");
        const date = dateInput?.value || getToday();

        syncLockRef.current = true;
        setBusy(true);
        setSyncMessage("");
        try {
            const result = await window.ktcDesktop.syncAllExcel(token, date);
            if (result?.success) {
                setSyncSuccess(true);
                setSyncMessage("Đã cập nhật Excel thành công.");
            } else {
                setSyncSuccess(false);
                setSyncMessage(result?.message || result?.reason || "Cập nhật Excel không thành công.");
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Không thể cập nhật Excel.";
            setSyncSuccess(false);
            setSyncMessage(message);
        } finally {
            syncLockRef.current = false;
            setBusy(false);
        }
    };

    if (!canExport) return <ApprovedReports />;
    // In a browser there is no Excel button at all: say why and where to get the Desktop app.
    if (!window.ktcDesktop?.isDesktop) return <><DesktopExcelNotice compact /><ApprovedReports /></>;
    if (!footer) return <ApprovedReports />;

    return (
        <>
            <ApprovedReports />
            {createPortal(
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <button
                    type="button"
                    onClick={() => void updateExcel()}
                    aria-busy={busy}
                    disabled={busy}
                    title="Cập nhật các file Excel từ dữ liệu đã duyệt"
                    style={{
                        height: 34,
                        padding: "0 14px",
                        border: "1px solid #b9d2f5",
                        borderRadius: 8,
                        background: "#f5f9ff",
                        color: "#174ea6",
                        fontSize: 13,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        cursor: busy ? "wait" : "pointer",
                        opacity: busy ? 0.7 : 1,
                        boxShadow: "0 1px 2px rgba(23,78,166,.06)"
                    }}
                >
                    {busy ? "↻ Đang cập nhật…" : "↻ Cập nhật Excel"}
                </button>
                {syncMessage && <span role="status" aria-live="polite" style={{ fontSize: 12, color: syncSuccess ? "#166534" : "#b42323" }}>{syncMessage}</span>}
                </div>,
                footer.lastElementChild && footer.lastElementChild.tagName === "DIV" ? footer.lastElementChild : footer
            )}
        </>
    );
}
