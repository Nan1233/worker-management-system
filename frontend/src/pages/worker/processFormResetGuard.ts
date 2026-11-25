import { initialForm, type DeductionState, type FormState, type MachineLineState } from "./processPageConfig";

// A non-empty malformed or localized numeric input still counts as user data.
// Never discard it without confirming a reset, even when Number(...) is NaN.
const hasEnteredQuantity = (value: unknown): boolean => {
    const text = String(value ?? "").trim();
    if (!text) return false;
    const amount = Number(text.replace(",", "."));
    return !Number.isFinite(amount) || amount !== 0;
};

/** Reset confirmation guard; pure and free of browser-side effects. */
export function hasProcessReportInput(
    form: FormState,
    selectedNg: readonly string[],
    selectedDeduction: readonly string[],
    machineLines: readonly MachineLineState[],
    deductions?: DeductionState,
    extraData?: Record<string, string>,
): boolean {
    return Boolean(
            form.productName.trim()
            || form.machineNo.trim()
            || form.note.trim()
            || form.otherNgName.trim()
            || form.otherDeductionName.trim()
            // Include process-specific and legacy NG fields not listed above.
            // Worker identity is populated automatically and is not user input.
            || Object.entries(form).some(([key, value]) =>
                !["workerCode", "workerName", "trainingPercent"].includes(key)
                && String(value ?? "") !== String(initialForm[key] ?? "")
            )
            || hasEnteredQuantity(form.actualHours)
            || hasEnteredQuantity(form.actualMinutes)
            || hasEnteredQuantity(form.totalTime)
            || hasEnteredQuantity(form.deductionTime)
            || hasEnteredQuantity(form.actualTime)
            || hasEnteredQuantity(form.ttOk)
            || hasEnteredQuantity(form.ttNg)
            || selectedNg.length
            || selectedDeduction.length
            || Object.values(deductions || {}).some((value) => hasEnteredQuantity(value))
            || Object.values(extraData || {}).some((value) => String(value ?? "").trim() !== "")
            || machineLines.some((line) =>
                line.machineCode.trim()
                || line.productCode.trim()
                || String(line.materialCode ?? "").trim()
                || String(line.grindingMachineNo ?? "").trim()
                || hasEnteredQuantity(line.okQuantity)
                || hasEnteredQuantity(line.ngQuantity)
                || hasEnteredQuantity(line.hours)
                || hasEnteredQuantity(line.minutes)
                || hasEnteredQuantity(line.adjustmentMinutes)
                || hasEnteredQuantity(line.adjustmentCount)
                || hasEnteredQuantity(line.actualQuantity)
                || line.selectedDefects.length > 0
                || line.selectedDeductions.length > 0
                || Object.values(line.defects).some((value) => hasEnteredQuantity(value))
                || Object.values(line.deductions).some((value) => hasEnteredQuantity(value))
                || line.otherNgName.trim()
                || line.otherDeductionName.trim()
            )
        
    );
}

/** Reset editable fields while retaining the authenticated worker identity. */
export function resetProcessFormRetainingWorker(previous: FormState, today: string): FormState {
    return {
        ...initialForm,
        actualHours: "",
        actualMinutes: "",
        actualTime: "",
        deductionTime: "",
        totalTime: "",
        workDate: today,
        workerCode: previous.workerCode,
        workerName: previous.workerName,
        trainingPercent: previous.trainingPercent,
    };
}
