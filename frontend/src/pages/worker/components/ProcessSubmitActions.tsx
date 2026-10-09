import { handleProcessSubmitClick } from "../processSubmitClickLogic";

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

const readWorkDate = (): string => document.querySelector<HTMLInputElement>("#workerWorkDate")?.value || "";
const readShift = (): string => document.querySelector<HTMLInputElement>('input[name="shift"]:checked')?.value || "";
const readValue = (selector: string): string => document.querySelector<HTMLInputElement>(selector)?.value?.trim() || "";

const normalize = (value: unknown): string => String(value ?? "").trim().toLowerCase();

/**
 * Autosave is intentionally debounced. If the worker clicks "Tiếp tục báo cáo cũ"
 * immediately after changing the machine/product, navigation can happen before
 * the debounce writes the latest machineLines. Persist the visible machine rows
 * synchronously before the parent callback navigates away.
 */
const syncVisibleMachineLinesToDraft = (): void => {
    try {
        const workDate = readWorkDate();
        const shift = normalize(readShift());
        if (!workDate) return;

        const machineLineElements = Array.from(document.querySelectorAll<HTMLElement>(".machine-line"));
        if (!machineLineElements.length) return;

        const lines = machineLineElements.map((_, index) => {
            const machineCode = readValue(`#machineNo-${index}`);
            const productCode = readValue(`#machineProduct-${index}`);
            const hours = readValue(`#machineHours-${index}`) || readValue(`[data-machine-hours="${index}"]`);
            const minutes = readValue(`#machineMinutes-${index}`) || readValue(`[data-machine-minutes="${index}"]`);
            const okQuantity = readValue(`#machineOk-${index}`) || readValue(`[data-machine-ok="${index}"]`);
            const ngQuantity = readValue(`#machineNg-${index}`) || readValue(`[data-machine-ng="${index}"]`);
            return { machineCode, productCode, hours, minutes, okQuantity, ngQuantity };
        });

        const currentMachine = normalize(lines[0]?.machineCode);
        const currentProduct = normalize(lines[0]?.productCode);
        const draftKeys: string[] = [];
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key?.startsWith("ktc:process-draft:v3:")) draftKeys.push(key);
        }

        let bestKey = "";
        let bestDraft: any = null;
        let bestScore = -1;
        for (const key of draftKeys) {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            try {
                const draft = JSON.parse(raw);
                if (normalize(draft?.form?.workDate) !== normalize(workDate)) continue;
                if (shift && normalize(draft?.form?.shift) !== shift) continue;

                const first = Array.isArray(draft?.machineLines) ? draft.machineLines[0] : null;
                let score = Number(draft?.savedAt || 0) / 1e15;
                if (currentMachine && normalize(first?.machineCode) === currentMachine) score += 10;
                if (currentProduct && normalize(first?.productCode) === currentProduct) score += 10;
                if (!currentMachine && currentProduct && normalize(draft?.form?.productName) === currentProduct) score += 8;
                if (!bestDraft || score > bestScore) {
                    bestScore = score;
                    bestKey = key;
                    bestDraft = draft;
                }
            } catch { /* ignore malformed unrelated drafts */ }
        }

        if (!bestKey || !bestDraft) return;

        const previousLines = Array.isArray(bestDraft.machineLines) ? bestDraft.machineLines : [];
        bestDraft.machineLines = lines.map((line, index) => ({
            ...(previousLines[index] || {}),
            machineCode: line.machineCode || previousLines[index]?.machineCode || "",
            productCode: line.productCode || previousLines[index]?.productCode || "",
            hours: line.hours || previousLines[index]?.hours || "",
            minutes: line.minutes || previousLines[index]?.minutes || "",
            okQuantity: line.okQuantity || previousLines[index]?.okQuantity || "",
            ngQuantity: line.ngQuantity || previousLines[index]?.ngQuantity || "",
        }));
        bestDraft.machineCount = Math.max(1, Number(bestDraft.machineCount) || 1, bestDraft.machineLines.length);
        bestDraft.form = {
            ...(bestDraft.form || {}),
            machineNo: lines[0]?.machineCode || bestDraft.form?.machineNo || "",
            productName: lines[0]?.productCode || bestDraft.form?.productName || "",
            actualHours: lines[0]?.hours || bestDraft.form?.actualHours || "",
            actualMinutes: lines[0]?.minutes || bestDraft.form?.actualMinutes || "",
            ttOk: lines[0]?.okQuantity || bestDraft.form?.ttOk || "",
            ttNg: lines[0]?.ngQuantity || bestDraft.form?.ttNg || "",
        };
        bestDraft.savedAt = Date.now();
        localStorage.setItem(bestKey, JSON.stringify(bestDraft));
    } catch (error) {
        console.warn("SYNC MACHINE LINES BEFORE RESUME ERROR:", error);
    }
};

export default function ProcessSubmitActions({ duplicatePrompt, canUpdateExisting, submitting, loadingWorker, onCancelDuplicate, onUpdateExisting, onCreateDuplicate, onReset, onSubmit }: Props) {
    const handleContinueExisting = () => {
        if (submitting) return;
        syncVisibleMachineLinesToDraft();
        onUpdateExisting();
    };

    // Một thao tác duy nhất: bấm "Nộp dữ liệu" sẽ validate và gửi báo cáo ngay
    // (xem handleSubmit trong ProcessPage.tsx). Không còn bước "Xác nhận nộp"
    // trung gian ở đây — giới hạn tổng giờ làm/ngày (12 giờ) vẫn được backend
    // kiểm tra có khóa (enforceDailyHoursLocked trong productionTempCreateModel.js/
    // productionTempUpdateModel.js) và lỗi DAILY_WORKING_HOURS_LIMIT_EXCEEDED sẽ
    // hiện ra qua toast lỗi của handleSubmit, giữ nguyên dữ liệu đã nhập.
    const handleSubmitClick = () => handleProcessSubmitClick(submitting, onSubmit);

    return (
        <>
            {duplicatePrompt && <div className="duplicate-dialog-backdrop" role="presentation">
                <div className="duplicate-dialog" role="dialog" aria-modal="true" aria-labelledby="duplicate-dialog-title">
                    <h2 id="duplicate-dialog-title">Đã tồn tại báo cáo tương tự</h2>
                    {canUpdateExisting ? (
                        <p>Báo cáo này đã tồn tại cho cùng công nhân, ngày, ca, máy và sản phẩm. Bạn có thể tiếp tục chỉnh sửa báo cáo hiện có hoặc tạo một báo cáo mới.</p>
                    ) : (
                        <p>Báo cáo tương tự đã tồn tại nhưng đã hết thời gian 10 phút để công nhân chỉnh sửa. Bạn có thể tạo một báo cáo mới.</p>
                    )}
                    <div className="duplicate-dialog-actions">
                        <button type="button" className="duplicate-dialog-cancel" onClick={onCancelDuplicate} disabled={submitting}>Hủy</button>
                        {canUpdateExisting && <button type="button" className="duplicate-dialog-cancel" onClick={handleContinueExisting} disabled={submitting}>Tiếp tục báo cáo cũ</button>}
                        <button type="button" className="duplicate-dialog-create" onClick={onCreateDuplicate} disabled={submitting}>Tạo báo cáo mới</button>
                    </div>
                </div>
            </div>}

            <div className="worker-action-group" aria-busy={submitting}>
                <div className="worker-action-copy">
                    <strong>{submitting ? "Đang kiểm tra và lưu báo cáo" : "Sẵn sàng gửi báo cáo"}</strong>
                    <span>{submitting ? "Vui lòng giữ màn hình này cho tới khi hoàn tất." : "Hệ thống sẽ kiểm tra dữ liệu trước khi gửi."}</span>
                </div>
                <div className="worker-action-buttons">
                    <button type="button" className="worker-reset-button" onClick={onReset} disabled={submitting}>Làm mới</button>
                    <button type="button" className="worker-floating-save" onClick={handleSubmitClick} disabled={loadingWorker || submitting}>
                        {submitting ? "Đang lưu..." : "Nộp dữ liệu"}
                    </button>
                </div>
            </div>
        </>
    );
}
