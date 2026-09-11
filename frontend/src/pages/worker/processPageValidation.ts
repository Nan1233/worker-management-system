import type { MachineLineState } from "./processPageConfig";

export function validateMachineLines(args: {
  machineLines: MachineLineState[];
  isMachineValid?: (code:string)=>boolean;
  isProductValid?: (machineCode:string, productCode:string)=>boolean;
  maxMachines?: number;
}): string | null {
  const lines = args.machineLines || [];
  if (!lines.length) return "Vui lòng nhập ít nhất một máy";
  if (lines.length > (args.maxMachines || 4)) return `Tối đa ${args.maxMachines || 4} máy`;
  for (const line of lines) {
    const machineCode = line.machineCode.trim();
    const productCode = line.productCode.trim();
    const manualWithoutMachine = !machineCode && !!productCode && !!args.isProductValid && args.isProductValid("", productCode);

    // GC Lồng tay is represented by a blank machine. The product validator is
    // the source of truth for whether that product is valid without a machine.
    // Other machine workflows still fail here because their product validator
    // returns false for an empty machine.
    if (!productCode) return "Thiếu mã sản phẩm";
    if (!machineCode && !manualWithoutMachine) return "Thiếu số máy";
    if (machineCode && args.isMachineValid && !args.isMachineValid(machineCode)) return `Máy ${machineCode} không hợp lệ`;
    if (args.isProductValid && !args.isProductValid(machineCode, productCode)) return `Sản phẩm ${productCode} không hợp lệ`;
  }
  return null;
}
