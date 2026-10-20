export type CutExecutionMode = "AUTO" | "NON_AUTO";

export interface MachineCodeOption {
  value: string;
}

export const GC_AUTOMATIC_MACHINE_CODES: ReadonlySet<string>;
export function normalizeMachineCode(value: unknown): string;
export function resolveCutExecutionMode(machineCode: unknown): CutExecutionMode;
export function getVisibleGcMachineOptions<T extends MachineCodeOption>(
  options: T[],
  operationType: "CUT" | "LONG",
  cutExecutionMode: CutExecutionMode,
): T[];
