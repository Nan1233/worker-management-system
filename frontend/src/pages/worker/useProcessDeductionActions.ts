import type { Dispatch, SetStateAction } from "react";
import type { DeductionKey, DeductionState, FormState } from "./processPageConfig";
import {
    calculateDeductionTimeSummary,
    getProspectiveTotalWorkMinutes,
    normalizeDeductionInput,
    normalizeDeductionStoredValue,
    toggleSelectedDeductionKeys,
    transitionSelectedDeduction,
} from "./processDeductionLogic";
import { MAX_TOTAL_WORK_MINUTES } from "./processFormUtils";

// Deduction actions share the page's existing form/draft state.
export function useProcessDeductionActions({
    form, deductions, setForm, setDeductions, setSelectedDeduction, showToast,
}: {
    form: FormState;
    deductions: DeductionState;
    setForm: Dispatch<SetStateAction<FormState>>;
    setDeductions: Dispatch<SetStateAction<DeductionState>>;
    setSelectedDeduction: Dispatch<SetStateAction<DeductionKey[]>>;
    showToast: (message: string, variant: "warning") => void;
}) {
    const updateTotalDeduction = (
        data: DeductionState
    ) => {
        // Các ô chi tiết nhập bằng PHÚT. Ví dụ 70 = 1 giờ 10 phút.
        setForm((prev) => {
            const summary = calculateDeductionTimeSummary(
                data,
                prev.actualHours,
                prev.actualMinutes
            );

            return {
                ...prev,
                actualTime: String(summary.actualTime),
                deductionTime: String(summary.deductionHours),
                totalTime: String(summary.totalTime)
            };
        });
    };


    // =====================================================
    // CẬP NHẬT GIÁ TRỊ MỘT LOẠI TRỪ GIỜ
    // =====================================================

    // Event handlers compute the next state outside React updater functions.
    // Updaters must remain pure when StrictMode replays them.
    const normalizeDeductionValue = (key: DeductionKey) => {
        const next = { ...deductions, [key]: normalizeDeductionStoredValue(String(deductions[key] || "")) };
        setDeductions(next);
        updateTotalDeduction(next);
    };

    const updateDeductionValue = (key: DeductionKey, value: string) => {
        const normalizedValue = normalizeDeductionInput(value);
        if (normalizedValue !== "" && Number(normalizedValue) > MAX_TOTAL_WORK_MINUTES) {
            showToast("Tổng thời gian tối đa là 12 giờ", "warning");
            return;
        }
        const next = { ...deductions, [key]: normalizedValue };
        if (getProspectiveTotalWorkMinutes(next, form.actualHours, form.actualMinutes) > MAX_TOTAL_WORK_MINUTES) {
            showToast("Không thể tăng thời gian trừ vì tổng thời gian sẽ vượt quá 12 giờ", "warning");
            return;
        }
        setDeductions(next);
        updateTotalDeduction(next);
    };

    const handleToggleDeduction = (key: DeductionKey, checked: boolean) => {
        setSelectedDeduction(previous => toggleSelectedDeductionKeys(previous, key, checked));
        const next = transitionSelectedDeduction(deductions, key, checked);
        setDeductions(next);
        updateTotalDeduction(next);
    };

    return { updateTotalDeduction, normalizeDeductionValue, updateDeductionValue, handleToggleDeduction };
}
