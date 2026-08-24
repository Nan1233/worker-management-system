import { useEffect, useMemo, useState } from "react";
import { Download, FolderOpen, RefreshCw, RotateCcw } from "lucide-react";
import { useToast } from "../feedback/toastContext";
import api from "../../services/api";
import { exportSelectedApprovedExcel } from "../../services/productionService";
import "./ExcelWorkflowTools.css";

const DEFAULT_LABEL = "Documents\\KTC\\Bao cao san xuat";

type Summary = {
    pending_count?: number;
    approved_count?: number;
    total_ok?: number;
    total_ng?: number;
    ng_rate?: number;
    process_summary?: Array<{ process_id: number; process_name: string; report_count: number; ok: number; ng: number }>;
    shift_summary?: Array<{ shift: string; report_count: number; ok: number; ng: number }>;
    daily_summary?: Array<{ work_date: string; report_count: number; ok: number; ng: number }>;
    product_summary?: Array<{ product_code: string; quantity: number; ok: number; ng: number; report_count: number }>;
    worker_performance?: { actual_worker_hours: number; earned_standard_hours: number; efficiency_percent: number };
    machine_performance?: { machine_count: number; machine_line_count: number; total_machine_hours: number };
    machine_summary?: Array<{ machine_id: number; machine_code?: string; run_count: number; machine_hours: number; maximum_output: number; counted_output: number; ok: number; ng: number; efficiency_percent: number }>;
};

const pad = (value: number) => String(value).padStart(2, "0");
const today = () => {
    const date = new Date();
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const escapeXml = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
const dateLabel = (value: unknown) => {
    const [year, month, day] = String(value || "").slice(0, 10).split("-");
    return year && month && day ? `${day}/${month}/${year}` : String(value || "");
};

function sheet(name: string, headers: string[], rows: unknown[][]) {
    const header = `<Row>${headers.map((item) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(item)}</Data></Cell>`).join("")}</Row>`;
    const body = rows.map((row) => `<Row>${row.map((value) => {
        const numeric = typeof value === "number" && Number.isFinite(value);
        return `<Cell><Data ss:Type="${numeric ? "Number" : "String"}">${escapeXml(numeric ? value : String(value ?? ""))}</Data></Cell>`;
    }).join("")}</Row>`).join("");
    return `<Worksheet ss:Name="${escapeXml(name.slice(0, 31))}"><Table>${header}${body}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions></Worksheet>`;
}

function buildWorkbook(summary: Summary, from: string, to: string) {
    const processRows = (summary.process_summary || []).map((row) => [row.process_name, row.report_count, row.ok, row.ng, row.ok + row.ng, row.ok + row.ng ? row.ok / (row.ok + row.ng) * 100 : 0]);
    const shiftRows = (summary.shift_summary || []).map((row) => [row.shift, row.report_count, row.ok, row.ng, row.ok + row.ng, row.ok + row.ng ? row.ok / (row.ok + row.ng) * 100 : 0]);
    const dayRows = (summary.daily_summary || []).filter((row) => row.ok + row.ng > 0).map((row) => [dateLabel(row.work_date), row.report_count, row.ok, row.ng, row.ok + row.ng, row.ok + row.ng ? row.ok / (row.ok + row.ng) * 100 : 0]);
    const productRows = (summary.product_summary || []).map((row) => [row.product_code, row.report_count, row.quantity, row.ok, row.ng]);
    const machineRows = (summary.machine_summary || []).map((row) => [row.machine_code || row.machine_id, row.run_count, row.machine_hours, row.maximum_output, row.counted_output, row.ok, row.ng, row.efficiency_percent]);
    const performance = summary.worker_performance || { actual_worker_hours: 0, earned_standard_hours: 0, efficiency_percent: 0 };
    const machinePerformance = summary.machine_performance || { machine_count: 0, machine_line_count: 0, total_machine_hours: 0 };

    return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<DocumentProperties xmlns="urn:schemas-microsoft-com:office:office"><Author>KTC Production Control</Author><Title>Thống kê sản xuất KTC</Title></DocumentProperties>
<Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#EAF2FF" ss:Pattern="Solid"/></Style></Styles>
${sheet("Tổng hợp", ["Chỉ tiêu", "Giá trị"], [["Từ ngày", dateLabel(from)], ["Đến ngày", dateLabel(to)], ["Báo cáo chờ duyệt", Number(summary.pending_count || 0)], ["Tổng báo cáo đã duyệt", Number(summary.approved_count || 0)], ["Tổng OK", Number(summary.total_ok || 0)], ["Tổng NG", Number(summary.total_ng || 0)], ["Tỷ lệ NG (%)", Number(summary.ng_rate || 0)], ["Số máy hoạt động", Number(machinePerformance.machine_count || 0)], ["Số máy/dây chuyền", Number(machinePerformance.machine_line_count || 0)], ["Tổng giờ máy", Number(machinePerformance.total_machine_hours || 0)], ["Giờ công nhân thực tế", Number(performance.actual_worker_hours || 0)], ["Giờ chuẩn", Number(performance.earned_standard_hours || 0)], ["Hiệu suất giờ công (%)", Number(performance.efficiency_percent || 0)]])}
${sheet("Theo ngày", ["Ngày", "Số báo cáo", "OK", "NG", "Tổng sản lượng", "Tỷ lệ OK (%)"], dayRows)}
${sheet("Công đoạn", ["Công đoạn", "Số báo cáo", "OK", "NG", "Tổng sản lượng", "Tỷ lệ OK (%)"], processRows)}
${sheet("Theo ca", ["Ca", "Số báo cáo", "OK", "NG", "Tổng sản lượng", "Tỷ lệ OK (%)"], shiftRows)}
${sheet("Sản phẩm", ["Mã sản phẩm", "Số báo cáo", "Sản lượng", "OK", "NG"], productRows)}
${sheet("Chi tiết máy", ["Máy", "Số lần chạy", "Giờ máy", "Sản lượng tối đa", "Sản lượng tính", "OK", "NG", "Hiệu suất (%)"], machineRows)}
${sheet("Giờ làm việc", ["Chỉ tiêu", "Giá trị"], [["Tổng giờ công nhân thực tế", Number(performance.actual_worker_hours || 0)], ["Tổng giờ chuẩn", Number(performance.earned_standard_hours || 0)], ["Hiệu suất giờ công (%)", Number(performance.efficiency_percent || 0)]])}
</Workbook>`;
}

function saveBrowser(content: string, fileName: string) {
    const blob = new Blob([content], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function isApprovedRoute(hash: string) {
    return /^#\/(manager|admin|lead)\/approved(?:\/|$)/.test(hash);
}
function isStatisticsRoute(hash: string) {
    return /^#\/(manager|admin|lead)\/statistics(?:\/|$)/.test(hash);
}

export default function ExcelWorkflowTools() {
    const { showToast } = useToast();
    const [hash, setHash] = useState(window.location.hash);
    const [exportRoot, setExportRoot] = useState("");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const onHash = () => setHash(window.location.hash);
        window.addEventListener("hashchange", onHash);
        const timer = window.setInterval(onHash, 500);
        return () => { window.removeEventListener("hashchange", onHash); window.clearInterval(timer); };
    }, []);

    const desktop = Boolean(window.ktcDesktop?.isDesktop);
    const active = useMemo(() => isApprovedRoute(hash) || isStatisticsRoute(hash), [hash]);

    useEffect(() => {
        if (!active || !desktop || !window.ktcDesktop?.getExportRoot) return;
        window.ktcDesktop.getExportRoot().then(setExportRoot).catch(() => setExportRoot(DEFAULT_LABEL));
    }, [active, desktop]);

    if (!active) return null;

    const chooseFolder = async () => {
        if (!desktop || !window.ktcDesktop?.chooseExportRoot) return;
        try {
            const result = await window.ktcDesktop.chooseExportRoot();
            if (!result.canceled) {
                setExportRoot(result.exportRoot);
                showToast("Đã đổi đường dẫn lưu Excel", "success");
            }
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Không thể chọn thư mục", "error");
        }
    };

    const resetFolder = async () => {
        if (!desktop || !window.ktcDesktop?.resetExportRoot) return;
        try {
            const root = await window.ktcDesktop.resetExportRoot();
            setExportRoot(root);
            showToast("Đã đưa về Documents\\KTC\\Bao cao san xuat", "success");
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Không thể đặt lại đường dẫn", "error");
        }
    };

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

    const exportStatistics = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("main input[type=date]"));
            const from = inputs[0]?.value || today();
            const to = inputs[1]?.value || from;
            const response = await api.get("/dashboard/summary", { params: { from, to } });
            const summary = response.data?.data || {};
            const content = buildWorkbook(summary, from, to);
            const fileName = `KTC_ThongKe_TongHop_${from}_${to}.xls`;
            if (desktop && window.ktcDesktop?.saveStatisticsExcel) {
                const result = await window.ktcDesktop.saveStatisticsExcel(content, fileName, from.slice(0, 4));
                showToast(`Đã xuất Excel: ${result.filePath}`, "success");
            } else {
                saveBrowser(content, fileName);
                showToast("Đã xuất toàn bộ thống kê Excel", "success");
            }
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Không thể xuất thống kê Excel", "error");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="ktc-excel-workflow-tools">
            <div className="ktc-excel-workflow-row">
                {isApprovedRoute(hash) && <button type="button" className="ktc-excel-primary" onClick={updateApprovedExcel} disabled={busy}><RefreshCw size={15} /> {busy ? "Đang cập nhật..." : "Cập nhật Excel"}</button>}
                {isStatisticsRoute(hash) && <button type="button" className="ktc-excel-primary" onClick={exportStatistics} disabled={busy}><Download size={15} /> {busy ? "Đang xuất..." : "Xuất toàn bộ Excel"}</button>}
            </div>
            {desktop && <div className="ktc-excel-path-row">
                <FolderOpen size={14} />
                <span title={exportRoot || DEFAULT_LABEL}>{exportRoot || DEFAULT_LABEL}</span>
                <button type="button" onClick={chooseFolder}>Chọn thư mục</button>
                <button type="button" onClick={resetFolder} title={DEFAULT_LABEL}><RotateCcw size={13} /> Mặc định</button>
            </div>}
        </div>
    );
}
