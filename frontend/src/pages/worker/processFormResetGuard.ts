import type { FormState, MachineLineState } from "./processPageConfig";

/** Reset confirmation guard; pure and free of browser-side effects. */
export function hasProcessReportInput(
    form: FormState,
    selectedNg: readonly string[],
    selectedDeduction: readonly string[],
    machineLines: readonly MachineLineState[],
): boolean {
    return Boolean(
            form.productName.trim()
            || form.machineNo.trim()
            || Number(form.actualTime || 0) > 0
            || Number(form.ttOk || 0) > 0
            || Number(form.ttNg || 0) > 0
            || selectedNg.length
            || selectedDeduction.length
            || machineLines.some((line) =>
                line.machineCode.trim()
                || line.productCode.trim()
                || Number(line.okQuantity || 0) > 0
                || Number(line.ngQuantity || 0) > 0
                || Number(line.hours || 0) > 0
                || Number(line.minutes || 0) > 0
            )
        
    );
}
