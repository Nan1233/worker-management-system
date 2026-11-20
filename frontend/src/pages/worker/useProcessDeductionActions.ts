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
    form, setForm, setDeductions, setSelectedDeduction, showToast,
}: {
    form: FormState;
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

const normalizeDeductionValue = (key: DeductionKey) => {
    setDeductions((prev) => {
        const normalizedValue = normalizeDeductionStoredValue(String(prev[key] || ""));
        const next = { ...prev, [key]: normalizedValue };
        updateTotalDeduction(next);
        return next;
    });
};

const updateDeductionValue = (
    key: DeductionKey,
    value: string
) => {

    const normalizedValue = normalizeDeductionInput(value);

    if (normalizedValue !== "" && Number(normalizedValue) > MAX_TOTAL_WORK_MINUTES) {
        showToast("Tổng thời gian tối đa là 12 giờ", "warning");
        return;
    }

    setDeductions((prev) => {
        const next = {
            ...prev,
            [key]: normalizedValue
        };

        const prospectiveTotalMinutes = getProspectiveTotalWorkMinutes(
            next,
            form.actualHours,
            form.actualMinutes
        );

        if (prospectiveTotalMinutes > MAX_TOTAL_WORK_MINUTES) {
            showToast(
                "Không thể tăng thời gian trừ vì tổng thời gian sẽ vượt quá 12 giờ",
                "warning"
            );
            return prev;
        }

        updateTotalDeduction(next);
        return next;
    });

};


    // =====================================================
    // CHỌN / BỎ CHỌN LOẠI TRỪ GIỜ
    // =====================================================

    // Deduction checkbox transitions are pure; keep time accounting centralized.
    const handleToggleDeduction = (key: DeductionKey, checked: boolean) => {
        setSelectedDeduction((previous) => toggleSelectedDeductionKeys(previous, key, checked));
        setDeductions((previous) => {
            const next = transitionSelectedDeduction(previous, key, checked);
            updateTotalDeduction(next);
            return next;
        });
    };


    return { updateTotalDeduction, normalizeDeductionValue, updateDeductionValue, handleToggleDeduction };
}
