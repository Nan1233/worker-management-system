import { useState } from "react";
import { getMyDailyWorkingHours } from "../../../services/productionService";
import { parseFlexibleTime } from "../processFormUtils";

interface DuplicatePrompt {
    reportId: number;
}

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

const readIncomingActualHours = (): number => {
    const actualHours = document.querySelector<HTMLInputElement>('input[name="actualHours"]')?.value;
    const actualMinutes = document.querySelector<HTMLInputElement>('input[name="actualMinutes"]')?.value;
    if (actualHours !== undefined || actualMinutes !== undefined) {
        const hours = Number(actualHours || 0);
        const minutes = Number(actualMinutes || 0);
        return Math.max(0, hours + minutes / 60);
    }

    const actualTime = document.querySelector<HTMLInputElement>('input[name="actualTime"]')?.value || "";
    return Math.max(0, parseFlexibleTime(actualTime));
};

const readWorkDate = (): string =>
    document.querySelector<HTMLInputElement>("#workerWorkDate")?.value || "";

const formatHours = (hours: number): string => {
    const totalMinutes = Math.max(0, Math.round(hours * 60));
    const wholeHours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (minutes === 0) return `${wholeHours} giờ`;
    return `${wholeHours} giờ ${minutes} phút`;
};

export default function ProcessSubmitActions({
    duplicatePrompt,
    canUpdateExisting,
    submitting,
    loadingWorker,
    onCancelDuplicate,
    onUpdateExisting,
    onCreateDuplicate,
    onReset,
    onSubmit,
}: Props) {
    const [dailyHoursPrompt, setDailyHoursPrompt] = useState<number | null>(null);
    const [loadingDailyHours, setLoadingDailyHours] = useState(false);
    const [dailyHoursError, setDailyHoursError] = useState("");

    const handleSubmitClick = async () => {
        if (submitting || loadingDailyHours) return;

        const workDate = readWorkDate();
        const incomingHours = readIncomingActualHours();

        if (!workDate) {
            onSubmit();
            return;
        }

        setLoadingDailyHours(true);
        setDailyHoursError("");
        try {
            const summary = await getMyDailyWorkingHours(workDate);
            setDailyHoursPrompt(Math.max(0, Number(summary.counted_hours || 0) + incomingHours));
        } catch (error) {
            console.error("GET DAILY HOURS BEFORE SUBMIT ERROR:", error);
            setDailyHoursError("Không lấy được tổng giờ hôm nay. Bạn vẫn có thể tiếp tục gửi để hệ thống kiểm tra lại.");
            setDailyHoursPrompt(null);
            onSubmit();
        } finally {
            setLoadingDailyHours(false);
        }
    };

    const confirmSubmit = () => {
        setDailyHoursPrompt(null);
        onSubmit();
    };

    return (
        <>
            {duplicatePrompt && (
                <div className="duplicate-dialog-backdrop" role="presentation">
                    <div className="duplicate-dialog" role="dialog" aria-modal="true" aria-labelledby="duplicate-dialog-title">
                        <h2 id="duplicate-dialog-title">Phát hiện báo cáo tương tự</h2>
                        <p>
                            Đã tồn tại báo cáo cùng nhân viên, ngày, ca, máy và sản phẩm.
                            Bạn muốn chỉnh sửa báo cáo cũ hay vẫn tạo báo cáo mới?
                        </p>
                        <div className="duplicate-dialog-actions">
                            <button type="button" className="duplicate-dialog-cancel" onClick={onCancelDuplicate}>Hủy</button>
                            {canUpdateExisting && <button type="button" className="duplicate-dialog-edit" onClick={onUpdateExisting} disabled={submitting}>Chỉnh sửa báo cáo cũ</button>}
                            <button type="button" className="duplicate-dialog-create" onClick={onCreateDuplicate} disabled={submitting}>Vẫn tạo báo cáo mới</button>
                        </div>
                    </div>
                </div>
            )}

            {dailyHoursPrompt !== null && (
                <div className="duplicate-dialog-backdrop" role="presentation">
                    <div className="duplicate-dialog" role="dialog" aria-modal="true" aria-labelledby="daily-hours-dialog-title">
                        <h2 id="daily-hours-dialog-title">Xác nhận nộp báo cáo</h2>
                        <p>
                            Tổng thời gian làm việc hôm nay của bạn sẽ là <strong>{formatHours(dailyHoursPrompt)}</strong>.
                        </p>
                        <p>Thời gian này được tính theo giờ làm thực tế và không tính giờ hỗ trợ/thời gian trừ.</p>
                        <p>Bạn có chắc chắn muốn nộp báo cáo này không?</p>
                        <div className="duplicate-dialog-actions">
                            <button type="button" className="duplicate-dialog-cancel" onClick={() => setDailyHoursPrompt(null)} disabled={submitting}>Hủy</button>
                            <button type="button" className="duplicate-dialog-create" onClick={confirmSubmit} disabled={submitting}>Xác nhận nộp</button>
                        </div>
                    </div>
                </div>
            )}

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
