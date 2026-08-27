import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { createPortal } from "react-dom";
import { useToast } from "../feedback/toastContext";
import { exportSelectedApprovedExcel } from "../../services/productionService";
import "./ExcelWorkflowTools.css";

const pad = (value: number) => String(value).padStart(2, "0");
const today = () => {
    const date = new Date();
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

function isApprovedRoute(hash: string) {
    return /^#\/(manager|admin|lead)\/approved(?:\/|$)/.test(hash);
}

export default function ExcelWorkflowTools() {
    const { showToast } = useToast();
    const [hash, setHash] = useState(window.location.hash);
    const [footer, setFooter] = useState<HTMLElement | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const onHash = () => setHash(window.location.hash);
        window.addEventListener("hashchange", onHash);
        const timer = window.setInterval(onHash, 500);
        return () => {
            window.removeEventListener("hashchange", onHash);
            window.clearInterval(timer);
        };
    }, []);

    const desktop = Boolean(window.ktcDesktop?.isDesktop);

    useEffect(() => {
        if (!desktop || !isApprovedRoute(hash)) {
            setFooter(null);
            return;
        }
        const findFooter = () => {
            const target = document.querySelector<HTMLElement>(".pending-table-footer");
            setFooter(target);
        };
        findFooter();
        const timer = window.setInterval(findFooter, 300);
        return () => window.clearInterval(timer);
    }, [desktop, hash]);

    if (!desktop || !isApprovedRoute(hash) || !footer) return null;

    const updateApprovedExcel = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const dateInput = document.querySelector<HTMLInputElement>("main input[type=date]");
            const date = /^\d{4}-\d{2}-\d{2}$/.test(dateInput?.value || "") ? dateInput!.value : today();
            const result = await exportSelectedApprovedExcel(date);
            showToast(result.message || "Đã cập nhật Excel báo cáo đã duyệt", "success");
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Không thể cập nhật Excel", "error");
        } finally {
            setBusy(false);
        }
    };

    return createPortal(
        <button
            type="button"
            className="ktc-excel-footer-action"
            onClick={updateApprovedExcel}
            disabled={busy}
            aria-label="Cập nhật Excel báo cáo đã duyệt"
        >
            <RefreshCw size={15} />
            {busy ? "Đang cập nhật..." : "Cập nhật Excel"}
        </button>,
        footer
    );
}
