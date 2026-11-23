import { initialForm, type DeductionState, type FormState, type MachineLineState } from "./processPageConfig";

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
            || Number(form.actualHours || 0) > 0
            || Number(form.actualMinutes || 0) > 0
            || Number(form.totalTime || 0) > 0
            || Number(form.deductionTime || 0) > 0
            || Number(form.actualTime || 0) > 0
            || Number(form.ttOk || 0) > 0
            || Number(form.ttNg || 0) > 0
            || selectedNg.length
            || selectedDeduction.length
            || Object.values(deductions || {}).some((value) => Number(value || 0) > 0)
            || Object.values(extraData || {}).some((value) => String(value ?? "").trim() !== "")
            || machineLines.some((line) =>
                line.machineCode.trim()
                || line.productCode.trim()
                || Number(line.okQuantity || 0) > 0
                || Number(line.ngQuantity || 0) > 0
                || Number(line.hours || 0) > 0
                || Number(line.minutes || 0) > 0
                || Number(line.adjustmentMinutes || 0) > 0
                || Number(line.adjustmentCount || 0) > 0
                || Number(line.actualQuantity || 0) > 0
                || line.selectedDefects.length > 0
                || line.selectedDeductions.length > 0
                || Object.values(line.defects).some((value) => Number(value || 0) > 0)
                || Object.values(line.deductions).some((value) => Number(value || 0) > 0)
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
