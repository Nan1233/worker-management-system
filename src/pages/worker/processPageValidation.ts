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
    if (!line.machineCode.trim()) return "Thiếu số máy";
    if (!line.productCode.trim()) return "Thiếu mã sản phẩm";
    if (args.isMachineValid && !args.isMachineValid(line.machineCode)) return `Máy ${line.machineCode} không hợp lệ`;
    if (args.isProductValid && !args.isProductValid(line.machineCode,line.productCode)) return `Sản phẩm ${line.productCode} không hợp lệ`;
  }
  return null;
}
