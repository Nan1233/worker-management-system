import { useState } from "react";
import { getMyDailyWorkingHours } from "../../../services/productionService";
import { parseFlexibleTime } from "../processFormUtils";

interface DuplicatePrompt { reportId: number; }
interface Props {
    duplicatePrompt: DuplicatePrompt | null;
    canUpdateExisting: boolean;
    submitting: boolean;
    loadingWorker: boolean;
    onCancelDuplicate: () => void;
    onUpdateExisting: () => void;
    onCreateDuplicate: () => void;
    onReset: () => void;
    onSubmit: () => void;
}

type TimeDetails = { actual: number; deduction: number; total: number };

const readIncomingTimes = (): TimeDetails => {
    const actualHours = Number(document.querySelector<HTMLInputElement>('[data-worker-time-part="actual-hours"]')?.value || 0);
    const actualMinutes = Number(document.querySelector<HTMLInputElement>('[data-worker-time-part="actual-minutes"]')?.value || 0);
    const deductionValue = document.querySelector<HTMLInputElement>('[data-worker-time-value="deduction"]')?.value || "0";
    const totalValue = document.querySelector<HTMLInputElement>('[data-worker-time-value="total"]')?.value || "";

    const actual = Math.max(0, (Number.isFinite(actualHours) ? actualHours : 0) + (Number.isFinite(actualMinutes) ? actualMinutes : 0) / 60);
    const deduction = Math.max(0, parseFlexibleTime(deductionValue));
    const parsedTotal = parseFlexibleTime(totalValue);
    const total = Number.isFinite(parsedTotal) && parsedTotal > 0 ? parsedTotal : actual + deduction;

    return { actual, deduction, total };
};

const readWorkDate = (): string => document.querySelector<HTMLInputElement>("#workerWorkDate")?.value || "";

const formatHours = (hours: number): string => {
    const totalMinutes = Math.max(0, Math.round(hours * 60));
    const wholeHours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (minutes === 0) return `${wholeHours} giờ`;
    return `${wholeHours} giờ ${minutes} phút`;
};

export default function ProcessSubmitActions({ duplicatePrompt, canUpdateExisting, submitting, loadingWorker, onCancelDuplicate, onUpdateExisting, onCreateDuplicate, onReset, onSubmit }: Props) {
    const [dailyHoursPrompt, setDailyHoursPrompt] = useState<number | null>(null);
    const [dailyTimeDetails, setDailyTimeDetails] = useState<TimeDetails | null>(null);
    const [loadingDailyHours, setLoadingDailyHours] = useState(false);
    const [dailyHoursError, setDailyHoursError] = useState("");

    const handleSubmitClick = async () => {
        if (submitting || loadingDailyHours) return;
        const workDate = readWorkDate();
        const incoming = readIncomingTimes();

        if (!workDate) { onSubmit(); return; }

        setLoadingDailyHours(true);
        setDailyHoursError("");
        try {
            const summary = await getMyDailyWorkingHours(workDate);
            const existingTotal = Math.max(0, Number(summary.counted_hours || 0));
            const promptTotal = existingTotal + incoming.total;
            setDailyTimeDetails({ actual: incoming.actual, deduction: incoming.deduction, total: promptTotal });
            setDailyHoursPrompt(promptTotal);
        } catch (error) {
            console.error("GET DAILY HOURS BEFORE SUBMIT ERROR:", error);
            setDailyHoursError("Không lấy được tổng giờ hôm nay. Bạn vẫn có thể tiếp tục gửi để hệ thống kiểm tra lại.");
            setDailyTimeDetails(incoming);
            setDailyHoursPrompt(incoming.total);
            onSubmit();
        } finally {
            setLoadingDailyHours(false);
        }
    };

    const closeSubmitPrompt = () => { setDailyHoursPrompt(null); setDailyTimeDetails(null); };
    const confirmSubmit = () => { closeSubmitPrompt(); onSubmit(); };

    return (
        <>
            {duplicatePrompt && <div className="duplicate-dialog-backdrop" role="presentation">
                <div className="duplicate-dialog" role="dialog" aria-modal="true" aria-labelledby="duplicate-dialog-title">
                    <h2 id="duplicate-dialog-title">Phát hiện báo cáo tương tự</h2>
                    <p>Đã tồn tại báo cáo cùng nhân viên, ngày, ca, máy và sản phẩm. Bạn muốn chỉnh sửa báo cáo cũ hay vẫn tạo báo cáo mới?</p>
                    <div className="duplicate-dialog-actions">
                        <button type="button" className="duplicate-dialog-cancel" onClick={onCancelDuplicate}>Hủy</button>
                        {canUpdateExisting && <button type="button" className="duplicate-dialog-edit" onClick={onUpdateExisting} disabled={submitting}>Chỉnh sửa báo cáo cũ</button>}
                        <button type="button" className="duplicate-dialog-create" onClick={onCreateDuplicate} disabled={submitting}>Vẫn tạo báo cáo mới</button>
                    </div>
                </div>
            </div>}

            {dailyHoursPrompt !== null && dailyTimeDetails !== null && <div className="duplicate-dialog-backdrop" role="presentation">
                <div className="duplicate-dialog" role="dialog" aria-modal="true" aria-labelledby="daily-hours-dialog-title">
                    <h2 id="daily-hours-dialog-title">Xác nhận nộp báo cáo</h2>
                    <p><strong>Thời gian thực tế:</strong> {formatHours(dailyTimeDetails.actual)}</p>
                    <p><strong>Thời gian trừ:</strong> {formatHours(dailyTimeDetails.deduction)}</p>
                    <p><strong>Tổng thời gian hôm nay sau khi nộp:</strong> {formatHours(dailyTimeDetails.total)}</p>
                    <p>Thời gian được tính theo <strong>thực tế + thời gian trừ</strong>.</p>
                    <p>Bạn có chắc chắn muốn nộp báo cáo này không?</p>
                    <div className="duplicate-dialog-actions">
                        <button type="button" className="duplicate-dialog-cancel" onClick={closeSubmitPrompt} disabled={submitting}>Hủy</button>
                        <button type="button" className="duplicate-dialog-create" onClick={confirmSubmit} disabled={submitting}>Xác nhận nộp</button>
                    </div>
                </div>
            </div>}

            <div className="worker-action-group" aria-busy={submitting || loadingDailyHours}>
                <div className="worker-action-copy">
                    <strong>{submitting ? "Đang kiểm tra và lưu báo cáo" : "Sẵn sàng gửi báo cáo"}</strong>
                    <span>{submitting ? "Vui lòng giữ màn hình này cho tới khi hoàn tất." : "Hệ thống sẽ kiểm tra dữ liệu trước khi gửi."}</span>
                    {dailyHoursError && <span role="alert">{dailyHoursError}</span>}
                </div>
                <div className="worker-action-buttons">
                    <button type="button" className="worker-reset-button" onClick={onReset} disabled={submitting || loadingDailyHours}>Làm mới</button>
                    <button type="button" className="worker-floating-save" onClick={() => void handleSubmitClick()} disabled={loadingWorker || submitting || loadingDailyHours}>
                        {loadingDailyHours ? "Đang kiểm tra..." : submitting ? "Đang lưu..." : "Nộp dữ liệu"}
                    </button>
                </div>
            </div>
        </>
    );
}
