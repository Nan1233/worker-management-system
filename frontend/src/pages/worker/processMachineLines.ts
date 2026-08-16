import type { MachineLineState } from "./processPageConfig";

export function aggregateMachineLines(lines: MachineLineState[]) {
  return lines.reduce((a,l) => {
    const hours = Math.max(0, Number(l.hours)||0) + Math.max(0, Number(l.minutes)||0)/60;
    a.totalMachineHours += hours; a.totalOk += Number(l.okQuantity)||0; a.totalNg += Number(l.ngQuantity)||0;
    a.totalCounted += (Number(l.okQuantity)||0) + (Number(l.ngQuantity)||0);
    a.totalMaximum += (Number(l.standardOutputPerHour)||0) * hours;
    return a;
  }, {totalMachineHours:0,totalOk:0,totalNg:0,totalCounted:0,totalMaximum:0});
}
export const getMachineNgTotal = (line: MachineLineState): number => Number(line.ngQuantity)||0;
export const getMaxMachineCount = (lines: MachineLineState[], max=4): number => Math.min(max, Math.max(1, lines.length));
export function toggleMachineDefectLine(line: MachineLineState, key: string, checked: boolean): MachineLineState {
  const selected = new Set(line.selectedDefects);
  checked ? selected.add(key) : selected.delete(key);
  return {...line, selectedDefects:[...selected]};
}
export function updateMachineDefectLine(line: MachineLineState, key: string, value: string): MachineLineState {
  return {...line, defects:{...line.defects,[key]:value}};
}
