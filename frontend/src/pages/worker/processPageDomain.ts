import type { ProductStandardOption } from "../../services/masterDataService";
import type { OperationMode, OperationType } from "./processPageConfig";
import { getGcProductWorkType, normalizeWorkType } from "./productSuggestionRules";

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
 * - DO/EP/CAN: machine-only workflows; each supports multiple machines from master Máy.
 * - K1/K2: worker may do Tay or exactly one Máy.
 * - XLBV/SX3/CVK: manual-only in the worker report form.
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
    "cvk": "CVK",
  };
  const processCode = map[process] || codeOf(process);

  return {
    processCode,
    isCutLongProcess: processCode === "GC",
    isInspectionProcess: ["K1", "K2"].includes(processCode),
    isManualOnlyProcess: ["XLBV", "SX3", "CVK"].includes(processCode),
  };
}

export function getInitialOperationMode(c: ProcessCapabilities): OperationMode {
  if (c.isManualOnlyProcess || c.isInspectionProcess) return "MANUAL";

  // GC opens on Cắt + Tự động. Both Cắt execution modes use the
  // machine workspace, so start in MACHINE immediately instead of
  // rendering a MANUAL frame and waiting for a child effect.
  if (c.processCode === "GC") return "MACHINE";

  if (["MAI", "DO", "CAN", "EP"].includes(c.processCode)) return "MACHINE";
  return "MANUAL";
}

export function resolveUsesMultiMachineLines(c: ProcessCapabilities, mode: OperationMode): boolean {
  return ["GC", "MAI", "DO", "EP", "CAN"].includes(c.processCode) && mode === "MACHINE";
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
  const expectedWorkType = normalizeWorkType(args.operationType);
  return args.products.filter((product) => {
    const returnedProcessCode = codeOf(product.process_code);
    const processMatches = !expectedProcessCode || !returnedProcessCode || returnedProcessCode === expectedProcessCode;
    if (!processMatches) return false;

    if (expectedProcessCode === "GC" && expectedWorkType) {
      const masterWorkType = normalizeWorkType(product.work_type);

      // Prefer the explicit master-data work_type. For legacy/test rows where
      // work_type is empty, use the agreed product-code split:
      // Cắt = CAT01, CAT02, CAT03, CAT04
      // Lồng = LONG01, LONG02
      if (masterWorkType) return masterWorkType === expectedWorkType;

      return getGcProductWorkType(product.product_code) === expectedWorkType;
    }

    return true;
  });
}
