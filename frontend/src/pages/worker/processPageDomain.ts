import type { ProductStandardOption } from "../../services/masterDataService";
import type { OperationMode, OperationType } from "./processPageConfig";
import { normalizeWorkType } from "./productSuggestionRules";
import { PROCESS_FORM_SCHEMAS } from "./processFormSchemas";

export type ProcessCapabilities = {
  processCode: string;
  isCutLongProcess: boolean;
  isInspectionProcess: boolean;
  isManualOnlyProcess: boolean;
};

const codeOf = (value: unknown) => String(value || "").trim().toUpperCase();
export const normalizeMasterText = (value: unknown) => codeOf(value);

export function getProcessCapabilities(process: string): ProcessCapabilities {
  // Process form schemas are the single source of truth for slug-to-code
  // mapping. CVK remains a special non-product route outside those schemas.
  const processCode = PROCESS_FORM_SCHEMAS[process]?.processCode
    || (process === "cvk" ? "CVK" : codeOf(process));

  return {
    processCode,
    isCutLongProcess: processCode === "GC",
    isInspectionProcess: ["K1", "K2"].includes(processCode),
    isManualOnlyProcess: ["XLBV", "SX3", "CVK"].includes(processCode),
  };
}

export function getInitialOperationMode(c: ProcessCapabilities): OperationMode {
  if (c.isManualOnlyProcess || c.isInspectionProcess) return "MANUAL";
  if (c.processCode === "GC") return "MACHINE";
  if (["MAI", "DO", "CAN", "EP"].includes(c.processCode)) return "MACHINE";
  return "MANUAL";
}

export function resolveUsesMultiMachineLines(c: ProcessCapabilities, mode: OperationMode): boolean {
  return ["GC", "MAI", "DO", "CAN", "EP"].includes(c.processCode) && mode === "MACHINE";
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

    // GC / Lồng: the list is the same for Máy and Tay, but rows stored as Cắt
    // never belong to the Lồng form (a code that exists for both types keeps its
    // own Lồng row). Rows with an unknown/blank type stay visible so nothing is lost.
    if (expectedProcessCode === "GC" && expectedWorkType === "LONG") {
      return normalizeWorkType(product.work_type) !== "CUT";
    }

    if (expectedProcessCode === "GC" && expectedWorkType) {
      return normalizeWorkType(product.work_type) === expectedWorkType;
    }
    return true;
  });
}
