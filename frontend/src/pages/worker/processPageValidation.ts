import type { MachineLineState } from "./processPageConfig";
import { DEFAULT_MACHINE_REPORT_LINE_LIMIT, getMaxMachineCount } from "./processMachineLines";

const normalizeProduct = (value: unknown): string => String(value ?? "").trim().toUpperCase();

export function validateMachineLines(args: {
  processCode?: string;
  machineLines: MachineLineState[];
  isMachineValid?: (code:string)=>boolean;
  isProductValid?: (machineCode:string, productCode:string)=>boolean;
  maxMachines?: number;
  allowZeroQuantity?: boolean;
}): string | null {
  // The UI keeps one empty placeholder row when the worker adds a machine
  // card. Ignore only rows that are completely untouched; a partially filled
  // row must still be validated so missing machine/product data is surfaced.
  const lines = (args.machineLines || []).filter((line) => {
    const hasText = (value: unknown) => String(value ?? "").trim().length > 0;
    const hasDefectInput = Object.values(line.defects || {}).some(hasText);
    const hasDeductionInput = Object.values(line.deductions || {}).some(hasText);
    return Boolean(
      hasText(line.machineCode)
      || hasText(line.productCode)
      || (String(args.processCode || "").trim().toUpperCase() === "CAN" && hasText(line.materialCode))
      || hasText(line.hours)
      || hasText(line.minutes)
      || hasText(line.actualQuantity)
      || hasText(line.okQuantity)
      || hasText(line.ngQuantity)
      || hasText(line.adjustmentCount)
      || (line.selectedDefects || []).length
      || (line.selectedDeductions || []).length
      || hasDefectInput
      || hasDeductionInput
    );
  });
  if (!lines.length) return String(args.processCode || "").trim().toUpperCase() === "MAI" || String(args.processCode || "").trim().toUpperCase() === "DO" ? "Vui lòng chọn mã sản phẩm và nhập sản lượng trước khi nộp báo cáo" : "Vui lòng nhập ít nhất một máy";
  const maxMachines = args.maxMachines ?? (args.processCode
    ? getMaxMachineCount(args.processCode, args.machineLines)
    : DEFAULT_MACHINE_REPORT_LINE_LIMIT);
  if (lines.length > maxMachines) return `Tối đa ${maxMachines} máy`;
  for (const [lineIndex, line] of lines.entries()) {
    const machineCode = line.machineCode.trim();
    const productCode = line.productCode.trim();
    const machineLabel = machineCode ? `Máy ${machineCode}` : `Máy ${lineIndex + 1}`;
    const manualWithoutMachine = !machineCode && !!productCode && !!args.isProductValid && args.isProductValid("", productCode);

    // Mirror the backend machine-line quantity and time invariants. This is
    // per-line validation, NOT the disabled cross-report daily-hours limit.
    const okRaw = String(line.okQuantity ?? "").trim();
    const ngRaw = String(line.ngQuantity ?? "").trim();
    const okValue = okRaw === "" ? 0 : Number(okRaw);
    const ngValue = ngRaw === "" ? 0 : Number(ngRaw);
    if (!Number.isInteger(okValue) || okValue < 0 || !Number.isInteger(ngValue) || ngValue < 0) {
      return `${machineLabel}: OK và NG phải là số nguyên không âm`;
    }
    if (machineCode) {
      const hours = Number(line.hours || 0);
      const minutes = Number(line.minutes || 0);
      if (!Number.isFinite(hours) || hours < 0 || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
        return `${machineLabel}: giờ phải không âm và phút phải từ 0 đến 59`;
      }
      const deductionValues = Object.values(line.deductions || {});
      if (deductionValues.some((value) => String(value ?? "").trim() !== "" &&
          (!Number.isFinite(Number(value)) || Number(value) < 0))) {
        return `${machineLabel}: thời gian trừ phải không âm`;
      }
      const deductions = deductionValues.reduce(
        (total, value) => total + (Number(value) || 0), 0
      );
      const actualHours = hours + minutes / 60;
      const grossHours = actualHours + deductions / 60;
      if (!Number.isFinite(actualHours) || actualHours <= 0 || actualHours > 12) {
        return `${machineLabel}: thời gian thực tế phải lớn hơn 0 và không quá 12 giờ`;
      }
      if (!Number.isFinite(grossHours) || grossHours > 12) {
        return `${machineLabel}: thời gian thực tế cộng trừ giờ không được quá 12 giờ`;
      }
    }

    // GC Lồng tay is represented by a blank machine. The product validator is
    // the source of truth for whether that product is valid without a machine.
    // Other machine workflows still fail here because their product validator
    // returns false for an empty machine.
    if (machineCode && ["GC", "MAI", "DO", "CAN", "EP", "K1", "K2", "XLBV", "SX3"].includes(String(args.processCode || "").trim().toUpperCase())) {
      const ng = Math.max(0, Math.trunc(Number(line.ngQuantity) || 0));
      // KQSX is derived from OK + NG; workers no longer enter it separately.
      const defectTotal = Object.values(line.defects || {}).reduce((sum, value) => sum + Math.max(0, Math.trunc(Number(value) || 0)), 0);
      if (defectTotal !== ng) return `Máy ${machineCode || "đang chọn"}: tổng chi tiết lỗi (${defectTotal}) phải bằng NG (${ng})`;
    }
    if (!args.allowZeroQuantity && Math.max(0, Number(line.okQuantity) || 0) + Math.max(0, Number(line.ngQuantity) || 0) <= 0) return `${machineLabel}: phải nhập OK hoặc NG lớn hơn 0`;
    if (!productCode && String(args.processCode || "").trim().toUpperCase() !== "CAN") return `${machineLabel}: thiếu mã sản phẩm`;
    if (!machineCode && !manualWithoutMachine && !["MAI", "DO", "CAN"].includes(String(args.processCode || "").trim().toUpperCase())) return "Thiếu số máy";
    if (machineCode && args.isMachineValid && !args.isMachineValid(machineCode)) return `Máy ${machineCode} không hợp lệ`;

    // Product selection and validation use the exact product_code from the process master.
    if (productCode && args.isProductValid) {
      const valid = args.isProductValid(machineCode, productCode)
        || args.isProductValid(machineCode, normalizeProduct(productCode));
      if (!valid) return `Sản phẩm ${productCode} không hợp lệ`;
    }
  }
  return null;
}
