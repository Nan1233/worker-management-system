import { useState } from "react";
import { getMyDailyWorkingHours } from "../../../services/productionService";
import { formatDurationMinutes, parseTimeToMinutes } from "../processFormUtils";

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

type TimeDetails = { actualMinutes: number; deductionMinutes: number; totalMinutes: number };

const readIncomingTimes = (): TimeDetails => {
    const actualHours = Number(document.querySelector<HTMLInputElement>('[data-worker-time-part="actual-hours"]')?.value || 0);
    const actualMinutesPart = Number(document.querySelector<HTMLInputElement>('[data-worker-time-part="actual-minutes"]')?.value || 0);
    const deductionValue = document.querySelector<HTMLInputElement>('[data-worker-time-value="deduction"]')?.value || "0";

    const safeHours = Number.isFinite(actualHours) ? Math.max(0, actualHours) : 0;
    const safeMinutes = Number.isFinite(actualMinutesPart) ? Math.max(0, Math.min(59, actualMinutesPart)) : 0;
    const actualMinutes = safeHours * 60 + safeMinutes;
    const deductionMinutes = parseTimeToMinutes(deductionValue);
    const totalMinutes = actualMinutes + deductionMinutes;

    return { actualMinutes, deductionMinutes, totalMinutes };
};

const readWorkDate = (): string => document.querySelector<HTMLInputElement>("#workerWorkDate")?.value || "";

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
            const rawExistingHours = Number(summary.counted_hours || 0);
            const existingMinutes = Number.isFinite(rawExistingHours) ? Math.max(0, Math.round(rawExistingHours * 60)) : 0;
            const promptTotalMinutes = existingMinutes + incoming.totalMinutes;
            setDailyTimeDetails({ ...incoming, totalMinutes: promptTotalMinutes });
            setDailyHoursPrompt(promptTotalMinutes);
        } catch (error) {
            console.error("GET DAILY HOURS BEFORE SUBMIT ERROR:", error);
            setDailyHoursError("Không lấy được tổng giờ hôm nay. Bạn vẫn có thể tiếp tục gửi để hệ thống kiểm tra lại.");
            setDailyTimeDetails(incoming);
            setDailyHoursPrompt(incoming.totalMinutes);
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
                    <p><strong>Thời gian thực tế:</strong> {formatDurationMinutes(dailyTimeDetails.actualMinutes)}</p>
                    <p><strong>Thời gian trừ:</strong> {formatDurationMinutes(dailyTimeDetails.deductionMinutes)}</p>
                    <p><strong>Tổng thời gian hôm nay sau khi nộp:</strong> {formatDurationMinutes(dailyTimeDetails.totalMinutes)}</p>
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
