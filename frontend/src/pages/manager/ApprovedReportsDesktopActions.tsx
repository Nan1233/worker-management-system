import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ApprovedReports from "./ApprovedReports";
import { getAccessToken } from "../../utils/authStorage";

function useApprovedFooter(): HTMLElement | null {
    const [footer, setFooter] = useState<HTMLElement | null>(null);

    useEffect(() => {
        if (!window.ktcDesktop?.isDesktop) return;

        const find = () => {
            const element = document.querySelector<HTMLElement>(".pending-table-footer");
            if (element) setFooter(element);
        };

        const observer = new MutationObserver(find);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        find();
        const timers = [250, 750, 1500].map((delay) => window.setTimeout(find, delay));

        return () => {
            observer.disconnect();
            timers.forEach(window.clearTimeout);
        };
    }, []);

    return footer;
}

export default function ApprovedReportsDesktopActions() {
    const footer = useApprovedFooter();
    const [busy, setBusy] = useState(false);

    const updateExcel = async () => {
        if (!window.ktcDesktop?.syncAllExcel || busy) return;

        const token = getAccessToken();
        if (!token) {
            window.alert("Không tìm thấy phiên đăng nhập. Vui lòng đăng nhập lại.");
            return;
        }

        const dateInput = document.querySelector<HTMLInputElement>(".pending-filter-card input[type='date']");
        const date = dateInput?.value || new Date().toISOString().slice(0, 10);

        setBusy(true);
        try {
            const result = await window.ktcDesktop.syncAllExcel(token, date);
            if (result?.success) {
                window.alert("Đã cập nhật Excel thành công.");
            } else {
                window.alert(result?.message || result?.reason || "Cập nhật Excel không thành công.");
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Không thể cập nhật Excel.";
            window.alert(message);
        } finally {
            setBusy(false);
        }
    };

    if (!window.ktcDesktop?.isDesktop || !footer) return <ApprovedReports />;

    return (
        <>
            <ApprovedReports />
            {createPortal(
                <button
                    type="button"
                    onClick={() => void updateExcel()}
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
                </button>,
                footer.lastElementChild && footer.lastElementChild.tagName === "DIV" ? footer.lastElementChild : footer
            )}
        </>
    );
}
