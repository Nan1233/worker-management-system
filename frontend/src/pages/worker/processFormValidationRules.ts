import type { FormState, MachineLineState } from "./processPageConfig";
import { MAX_TOTAL_WORK_MINUTES, parseFlexibleTime } from "./processFormUtils";
import { calculateNgTotal } from "./processQualityLogic";

/** Pure final validation for worker production entry.
 * Order of these rules is preserved by ProcessPage.validateForm so the first
 * user-visible error remains unchanged. Do not relax time or NG invariants here.
 */
export function validateWorkerShift(shift: string): string {
    return ["A", "B", "C", "D"].includes(String(shift || "").trim().toUpperCase())
        ? ""
        : "Ca làm việc phải thuộc A, B, C hoặc D";
}

export function validateCustomReasonNames(
    form: FormState,
    selectedNg: readonly string[],
    selectedDeduction: readonly string[],
    machineLines: readonly MachineLineState[],
): string {
    if (selectedNg.includes("__otherNg") && !String(form.otherNgName || "").trim())
        return "Vui lòng nhập tên NG khác trước khi nhập số lượng";
    if (selectedDeduction.includes("__otherDeduction") && !String(form.otherDeductionName || "").trim())
        return "Vui lòng nhập lý do trừ giờ khác trước khi nhập số phút";
    for (const [index, line] of machineLines.entries()) {
        if (line.selectedDefects?.includes("__otherNg") && !String(line.otherNgName || "").trim())
            return `Dòng máy ${index + 1}: vui lòng nhập tên NG khác`;
        if (line.selectedDeductions?.includes("__otherDeduction") && !String(line.otherDeductionName || "").trim())
            return `Dòng máy ${index + 1}: vui lòng nhập lý do trừ giờ khác`;
    }
    return "";
}

export function validateManualMachineData(
    form: FormState,
    machineLines: readonly MachineLineState[],
    isManualOnlyProcess: boolean,
): string {
    return isManualOnlyProcess && (form.machineNo.trim() || machineLines.some((line) => line.machineCode.trim()))
        ? "Công đoạn làm tay không được chứa dữ liệu máy" : "";
}

export function validateReportTime(form: FormState, usesMachineLineAccounting: boolean): string {
    // Machine-line reports validate time on each machine in validateMachineLines.
    if (usesMachineLineAccounting) return "";
    if (!Number.isFinite(parseFlexibleTime(form.actualTime)) || parseFlexibleTime(form.actualTime) <= 0)
        return "Thời gian làm việc thực tế phải là số hợp lệ lớn hơn 0";
    if (Number(form.actualMinutes || 0) > 59)
        return "Số phút làm thực tế phải từ 0 đến 59";
    const actualMinutes = Math.round(parseFlexibleTime(form.actualTime) * 60);
    const deductionMinutes = Math.round(parseFlexibleTime(form.deductionTime) * 60);
    if (!Number.isFinite(deductionMinutes) || deductionMinutes < 0)
        return "Thời gian trừ không hợp lệ";
    if (actualMinutes + deductionMinutes > MAX_TOTAL_WORK_MINUTES)
        return "Thời gian thực tế + thời gian trừ không được vượt quá 12 giờ";
    if (!Number.isFinite(parseFlexibleTime(form.totalTime)) || parseFlexibleTime(form.totalTime) < 0 || parseFlexibleTime(form.totalTime) > 12)
        return "Tổng thời gian phải từ 0 đến 12 giờ";
    return "";
}

export function validateReportTotals(
    form: FormState,
    activeNgOptions: ReadonlyArray<{ key: string }>,
    isCvkMode: boolean,
    usesMachineLineAccounting: boolean,
    calculateActualOutput: (values: FormState) => number,
): string {
    if (!isCvkMode && Number(form.standardOutput || 0) <= 0)
        return "Định mức phải lớn hơn 0";
    if (Number(form.actualOutput || 0) < 0)
        return "Sản lượng thực tế không hợp lệ";
    const totalDefects = calculateNgTotal(form, [...activeNgOptions]);
    if (totalDefects !== Number(form.ttNg || 0))
        return "TT NG phải bằng tổng số lượng các lỗi NG";
    // Machine-line output is aggregated per machine, not the parent product formula.
    if (!usesMachineLineAccounting && Number(form.actualOutput || 0) !== calculateActualOutput(form))
        return "Thực tế phải bằng TT OK cộng TT NG";
    return "";
}

export function validateRequiredExtraFields(
    fields: ReadonlyArray<{ key: string; label: string; required?: boolean }>,
    extraData: Record<string, string>,
): string {
    const missing = fields.find((field) => field.required && !String(extraData[field.key] || "").trim());
    return missing ? `Vui lòng nhập ${missing.label}` : "";
}
