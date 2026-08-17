import type { MachineLineState } from "./processPageConfig";

type NgOption = { key?: string; code?: string | null; id?: number };

export function aggregateMachineLines(
  lines: MachineLineState[],
  activeNgOptions: NgOption[] = [],
) {
  const defects: Record<string, number> = {};
  const selected = new Set<string>();
  let firstProductCode = "";
  let totalStandardOutput = 0;

  const result = lines.reduce((a, l) => {
    const hours = Math.max(0, Number(l.hours) || 0) + Math.max(0, Number(l.minutes) || 0) / 60;
    const ok = Number(l.okQuantity) || 0;
    const ng = Number(l.ngQuantity) || 0;
    a.totalMachineHours += hours;
    a.totalOk += ok;
    a.totalNg += ng;
    a.totalCounted += ok + ng;
    a.totalMaximum += (Number(l.standardOutputPerHour) || 0) * hours;
    totalStandardOutput += (Number(l.standardOutputPerHour) || 0) * hours;
    if (!firstProductCode) firstProductCode = String(l.productCode || "");

    for (const key of Array.isArray(l.selectedDefects) ? l.selectedDefects : []) {
      selected.add(String(key));
    }

    const lineDefects = l.defects || {};
    for (const option of activeNgOptions) {
      const key = String(option.key || option.code || "");
      if (key) defects[key] = (defects[key] || 0) + (Number(lineDefects[key]) || 0);
    }
    return a;
  }, {
    totalMachineHours: 0,
    totalOk: 0,
    totalNg: 0,
    totalCounted: 0,
    totalMaximum: 0,
  });

  return {
    ...result,
    selectedNg: [...selected],
    firstProductCode,
    totalStandardOutput: totalStandardOutput || result.totalMaximum,
    defects,
  };
}

export const getMachineNgTotal = (line: MachineLineState): number =>
  Number(line.ngQuantity) || 0;

export function getMaxMachineCount(
  processCodeOrLines: string | MachineLineState[],
  linesOrMax?: MachineLineState[] | number,
  machineOptions?: unknown[],
): number {
  const lines = Array.isArray(processCodeOrLines)
    ? processCodeOrLines
    : (Array.isArray(linesOrMax) ? linesOrMax : []);
  const optionCount = Array.isArray(machineOptions) ? machineOptions.length : 0;
  const requested = Math.max(lines.length, optionCount, 1);
  return Math.min(4, requested);
}

export function toggleMachineDefectLine(
  line: MachineLineState,
  key: string,
  checked?: boolean,
): MachineLineState {
  const selected = new Set(line.selectedDefects || []);
  const nextChecked = checked === undefined ? !selected.has(key) : checked;
  nextChecked ? selected.add(key) : selected.delete(key);
  return { ...line, selectedDefects: [...selected] };
}

export function updateMachineDefectLine(
  line: MachineLineState,
  key: string,
  value: string,
): MachineLineState {
  return { ...line, defects: { ...line.defects, [key]: value } };
}
