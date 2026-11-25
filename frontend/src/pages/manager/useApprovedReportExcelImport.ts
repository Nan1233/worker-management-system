import { useState } from "react";
import { getAccessToken } from "../../utils/authStorage";
import { invalidateApprovedReportCache } from "../../services/productionService";

export function useApprovedReportExcelImport(reload: () => Promise<void>) {
    const [reportImportPreview, setReportImportPreview] = useState<{ filePath?: string; fileName?: string; detected: number; creates?: number; updates?: number } | null>(null);
    const [reportImportStatus, setReportImportStatus] = useState<{ tone: "success" | "warning" | "error"; message: string } | null>(null);
    const [reportImportBusy, setReportImportBusy] = useState(false);
    const desktopImportApi = () => (window as Window & { ktcDesktop?: {
        isDesktop?: boolean;
        previewReportImport?: (token: string) => Promise<any>;
        applyReportImport?: (token: string, filePath: string) => Promise<any>;
    } }).ktcDesktop;

    const previewExcelImport = async () => {
        const desktop = desktopImportApi();
        const token = getAccessToken() || "";
        if (!token) { setReportImportStatus({ tone: "error", message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." }); return; }
        if (!desktop?.isDesktop || typeof desktop.previewReportImport !== "function") {
            setReportImportStatus({ tone: "warning", message: "Nhập Excel chỉ khả dụng trên ứng dụng KTC Desktop." });
            return;
        }
        setReportImportBusy(true); setReportImportStatus(null); setReportImportPreview(null);
        try {
            const preview = await desktop.previewReportImport(token);
            if (preview?.canceled) { setReportImportPreview(null); return; }
            if (!preview?.filePath) throw new Error("Không nhận được đường dẫn file import hợp lệ.");
            setReportImportPreview({ ...preview, filePath: preview.filePath });
            if (Number(preview.detected || 0) === 0) {
                setReportImportStatus({ tone: "warning", message: "File không có dòng mới hoặc thay đổi cần import." });
            } else {
                setReportImportStatus({ tone: "success", message: "Đã đọc " + Number(preview.detected) + " thay đổi từ " + (preview.fileName || "file Excel") + "." });
            }
        } catch (error) {
            setReportImportStatus({ tone: "error", message: error instanceof Error ? error.message : "Không thể đọc file import." });
        } finally { setReportImportBusy(false); }
    };

    const applyExcelImport = async () => {
        if (!reportImportPreview?.filePath) return;
        const desktop = desktopImportApi();
        const token = getAccessToken() || "";
        if (!token) { setReportImportStatus({ tone: "error", message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." }); return; }
        if (!desktop?.isDesktop || typeof desktop.applyReportImport !== "function") {
            setReportImportStatus({ tone: "warning", message: "Nhập Excel chỉ khả dụng trên ứng dụng KTC Desktop." });
            return;
        }
        setReportImportBusy(true); setReportImportStatus(null);
        try {
            const result = await desktop.applyReportImport(token, reportImportPreview.filePath);
            if (result?.sourceChanged) {
                setReportImportPreview(null);
                setReportImportStatus({ tone: "warning", message: "File đã thay đổi trong lúc import. Hãy xem trước bản mới nhất; không tự động ghi đè file." });
            } else if (Number(result?.failed || 0) > 0) {
                setReportImportStatus({ tone: "warning", message: "Import một phần: " + Number(result?.succeeded || 0) + " thành công, " + Number(result.failed) + " lỗi. Có thể kiểm tra và thử lại." });
            } else if (Number(result?.detected || 0) === 0 || Number(result?.succeeded || 0) === 0) {
                setReportImportStatus({ tone: "warning", message: "File không có dòng mới hoặc thay đổi cần import." });
                setReportImportPreview(null);
            } else {
                setReportImportStatus({ tone: "success", message: "Import thành công " + Number(result.succeeded) + " báo cáo." });
                setReportImportPreview(null);
                invalidateApprovedReportCache();
                await reload();
            }
        } catch (error) {
            setReportImportStatus({ tone: "error", message: error instanceof Error ? error.message : "Không thể import báo cáo." });


        } finally { setReportImportBusy(false); }
    };

    return {reportImportPreview, reportImportStatus, reportImportBusy, previewExcelImport, applyExcelImport, setReportImportPreview};
}
