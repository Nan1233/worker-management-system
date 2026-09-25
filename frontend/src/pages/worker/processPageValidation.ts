import type { MachineLineState } from "./processPageConfig";

const normalizeProduct = (value: unknown): string => String(value ?? "").trim().toUpperCase();

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

    // Worker-facing GC forms use alias codes (for example C2556), while the
    // master may expose the same product under product_code/alias_code. The
    // caller normally normalizes this before validation, but keep the
    // validation contract alias-safe so a canonical/alias row cannot be
    // rejected merely because the UI stores the worker-facing code.
    if (args.isProductValid) {
      const valid = args.isProductValid(machineCode, productCode)
        || args.isProductValid(machineCode, normalizeProduct(productCode));
      if (!valid) return `Sản phẩm ${productCode} không hợp lệ`;
    }
  }
  return null;
}
