import type { MachineLineState } from "./processPageConfig";

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
  if (!lines.length) return String(args.processCode || "").trim().toUpperCase() === "MAI" ? "Vui lòng chọn mã sản phẩm và nhập sản lượng trước khi nộp báo cáo" : "Vui lòng nhập ít nhất một máy";
  if (lines.length > (args.maxMachines || 4)) return `Tối đa ${args.maxMachines || 4} máy`;
  for (const [lineIndex, line] of lines.entries()) {
    const machineCode = line.machineCode.trim();
    const productCode = line.productCode.trim();
    const machineLabel = machineCode ? `Máy ${machineCode}` : `Máy ${lineIndex + 1}`;
    const manualWithoutMachine = !machineCode && !!productCode && !!args.isProductValid && args.isProductValid("", productCode);

    // GC Lồng tay is represented by a blank machine. The product validator is
    // the source of truth for whether that product is valid without a machine.
    // Other machine workflows still fail here because their product validator
    // returns false for an empty machine.
    if (String(args.processCode || "").trim().toUpperCase() === "MAI") {
      const ng = Math.max(0, Math.trunc(Number(line.ngQuantity) || 0));
      // KQSX is derived from OK + NG; workers no longer enter it separately.
      const defectTotal = Object.values(line.defects || {}).reduce((sum, value) => sum + Math.max(0, Math.trunc(Number(value) || 0)), 0);
      if (defectTotal !== ng) return `Máy ${machineCode || "đang chọn"}: tổng chi tiết lỗi (${defectTotal}) phải bằng NG (${ng})`;
    }
    if (!args.allowZeroQuantity && Math.max(0, Number(line.okQuantity) || 0) + Math.max(0, Number(line.ngQuantity) || 0) <= 0) return `${machineLabel}: phải nhập OK hoặc NG lớn hơn 0`;
    if (!productCode) return `${machineLabel}: thiếu mã sản phẩm`;
    if (!machineCode && !manualWithoutMachine) return "Thiếu số máy";
    if (machineCode && args.isMachineValid && !args.isMachineValid(machineCode)) return `Máy ${machineCode} không hợp lệ`;

    // Product selection and validation use the exact product_code from the process master.
    if (args.isProductValid) {
      const valid = args.isProductValid(machineCode, productCode)
        || args.isProductValid(machineCode, normalizeProduct(productCode));
      if (!valid) return `Sản phẩm ${productCode} không hợp lệ`;
    }
  }
  return null;
}
