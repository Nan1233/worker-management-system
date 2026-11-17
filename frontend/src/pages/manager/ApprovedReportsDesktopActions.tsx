import { useRef, useState } from "react";
import { getToday } from "./managerReportDateLogic";
import ApprovedReports from "./ApprovedReports";
import { getAccessToken } from "../../utils/authStorage";
import { usePermissions } from "../../hooks/usePermissions";
import DesktopExcelNotice from "../../components/system/DesktopExcelNotice";

export default function ApprovedReportsDesktopActions() {
    const { can } = usePermissions();
    const canExport = can("REPORT_EXPORT");
    const [busy, setBusy] = useState(false);
    const [exportBusy, setExportBusy] = useState(false);
    const [exportMessage, setExportMessage] = useState("");
    const syncLockRef = useRef(false);
    const [syncMessage, setSyncMessage] = useState("");
    const [syncSuccess, setSyncSuccess] = useState(false);

    const selectedDate = () => document.querySelector<HTMLInputElement>(".approved-review-screen .pending-date-filter input[type='date']")?.value || getToday();

    // Desktop exports must use the process-specific local workbook engine.
    // The legacy HTTP export uses a generic layout and must not be used here.
    const downloadApprovedExcel = async () => {
        if (exportBusy || syncLockRef.current || !window.ktcDesktop?.syncAllExcel) return;
        const token = getAccessToken();
        if (!token) {
            setExportMessage("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
            return;
        }
        syncLockRef.current = true;
        setExportBusy(true);
        setExportMessage("");
        try {
            const result = await window.ktcDesktop.syncAllExcel(token, selectedDate());
            setExportMessage(result?.success
                ? "Đã xuất các file Excel riêng theo từng công đoạn vào thư mục KTC trên máy."
                : (result?.message || result?.reason || "Xuất Excel chưa hoàn tất; kiểm tra file đang mở và nhật ký Desktop."));
        } catch (error: unknown) {
            setExportMessage(error instanceof Error ? error.message : "Không thể xuất Excel.");
        } finally {
            syncLockRef.current = false;
            setExportBusy(false);
        }
    };

    const updateExcel = async () => {
        if (!window.ktcDesktop?.syncAllExcel || syncLockRef.current) return;

        const token = getAccessToken();
        if (!token) {
            setSyncSuccess(false);
            setSyncMessage("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại trước khi cập nhật Excel.");
            return;
        }

        const date = selectedDate();

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

    return (
        <>
            <div className="ktc-desktop-excel-actions" style={{ display: "flex", justifyContent: "flex-end", padding: "8px 0" }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <button type="button" onClick={() => void downloadApprovedExcel()} disabled={exportBusy || busy} title="Xuất các file Excel riêng theo công đoạn vào thư mục KTC trên máy" style={{ height: 34, padding: "0 14px", border: "1px solid #b9d2f5", borderRadius: 8, background: "#fff", color: "#174ea6", fontSize: 13, fontWeight: 700, cursor: exportBusy ? "wait" : "pointer" }}>
                    {exportBusy ? "Đang xuất…" : "↓ Xuất Excel theo công đoạn"}
                </button>
                <button
                    type="button"
                    onClick={() => void updateExcel()}
                    aria-busy={busy}
                    disabled={busy || exportBusy}
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
                {exportMessage && <span role="status" aria-live="polite" style={{ fontSize: 12 }}>{exportMessage}</span>}
                {syncMessage && <span role="status" aria-live="polite" style={{ fontSize: 12, color: syncSuccess ? "#166534" : "#b42323" }}>{syncMessage}</span>}
                </div></div>
            <ApprovedReports />
        </>
    );
}
