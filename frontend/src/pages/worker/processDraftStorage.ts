import type { DeductionState, FormState, MachineLineState, NgKey, DeductionKey, OperationMode, OperationType } from "./processPageConfig";

export type ProcessDraft = {
  version: 1;
  savedAt: number;
  process: string;
  form: FormState;
  deductions: DeductionState;
  selectedDeduction: DeductionKey[];
  selectedNg: NgKey[];
  machineLines: MachineLineState[];
  machineCount: number;
  operationType: OperationType;
  operationMode: OperationMode;
  extraData: Record<string,string>;
};

const keyFor = (process: string) => `ktc:process-draft:${process}`;

export function loadProcessDraft(process: string): ProcessDraft | null {
  try {
    const raw = localStorage.getItem(keyFor(process));
    if (!raw) return null;
    const value = JSON.parse(raw) as ProcessDraft;
    return value?.version === 1 && value.process === process ? value : null;
  } catch { return null; }
}
export function saveProcessDraft(draft: ProcessDraft): void {
  try { localStorage.setItem(keyFor(draft.process), JSON.stringify(draft)); } catch { /* storage unavailable */ }
}
export function clearProcessDraft(process: string): void {
  try { localStorage.removeItem(keyFor(process)); } catch { /* noop */ }
}
export function hasMeaningfulProcessDraft(draft: ProcessDraft): boolean {
  const f = draft.form;
  return Boolean(
    f.productName || f.machineNo || f.ttOk || f.ttNg || f.totalTime || f.actualTime ||
    draft.machineLines.some(l => l.machineCode || l.productCode || l.okQuantity || l.ngQuantity) ||
    draft.selectedDeduction.length || draft.selectedNg.length ||
    Object.values(draft.extraData || {}).some(Boolean)
  );
}
