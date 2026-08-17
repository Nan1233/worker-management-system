import type { ProductStandardOption } from "../../services/masterDataService";
import type { OperationMode, OperationType } from "./processPageConfig";

export type ProcessCapabilities = {
  processCode: string;
  isCutLongProcess: boolean;
  isInspectionProcess: boolean;
  isManualOnlyProcess: boolean;
};

const codeOf = (value: unknown) => String(value || "").trim().toUpperCase();
export const normalizeMasterText = (value: unknown) => codeOf(value);

/**
 * KTC worker form policy:
 * - GC: Cắt/Lồng, each mode can be Tay or Máy; machine mode supports multiple machines.
 * - MAI: machine workflow, supports multiple machines.
 * - K1/K2: worker may do Tay or exactly one Máy.
 * - DO/EP/CAN: exactly one Máy.
 * - XLBV/SX3: manual-only in the worker report form.
 */
export function getProcessCapabilities(process: string): ProcessCapabilities {
  const map: Record<string, string> = {
    "cat-long": "GC",
    "mai": "MAI",
    "do": "DO",
    "kiem-1": "K1",
    "kiem-2": "K2",
    "can": "CAN",
    "ep": "EP",
    "bavia": "XLBV",
    "sx3": "SX3",
  };
  const processCode = map[process] || codeOf(process);

  return {
    processCode,
    isCutLongProcess: processCode === "GC",
    // Only K1/K2 have a Tay/Máy switch. DO is machine-only.
    isInspectionProcess: ["K1", "K2"].includes(processCode),
    isManualOnlyProcess: ["XLBV", "SX3"].includes(processCode),
  };
}

export function getInitialOperationMode(c: ProcessCapabilities): OperationMode {
  if (c.isManualOnlyProcess || c.isInspectionProcess) return "MANUAL";
  if (["MAI", "DO", "CAN", "EP"].includes(c.processCode)) return "MACHINE";
  return "MANUAL";
}

export function resolveUsesMultiMachineLines(c: ProcessCapabilities, mode: OperationMode): boolean {
  return (c.processCode === "GC" || c.processCode === "MAI") && mode === "MACHINE";
}

export function resolveUsesSingleMachine(c: ProcessCapabilities, mode: OperationMode): boolean {
  if (mode !== "MACHINE") return false;
  return !resolveUsesMultiMachineLines(c, mode);
}

export const usesMultiMachineLines = resolveUsesMultiMachineLines;
export const usesSingleMachine = resolveUsesSingleMachine;
export function getProcessCapabilitiesLegacy(process: string) { return getProcessCapabilities(process); }

export function filterProductsForProcessScope(args: {
  products: ProductStandardOption[];
  processCode?: string;
  processId?: number;
  operationType?: OperationType;
}): ProductStandardOption[] {
  const expectedProcessCode = codeOf(args.processCode);
  const expectedWorkType = codeOf(args.operationType);
  return args.products.filter((product) => {
    const returnedProcessCode = codeOf(product.process_code);
    const processMatches = !expectedProcessCode || !returnedProcessCode || returnedProcessCode === expectedProcessCode;
    if (!processMatches) return false;
    if (expectedProcessCode === "GC" && expectedWorkType) {
      return normalizeMasterText(product.work_type) === expectedWorkType;
    }
    return true;
  });
}
