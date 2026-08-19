import type { ProductionReport } from "../../types/production";

export function getValidReportIds(reports: ProductionReport[]): number[] {
  return reports.map(r => Number(r.id)).filter(id => Number.isInteger(id) && id > 0);
}

export function reconcileSelectedReportIds(previous: number[], reports: ProductionReport[]): number[] {
  const valid = new Set(getValidReportIds(reports));
  return previous.filter(id => valid.has(id));
}

export function toggleReportId(previous: number[], id: number): number[] {
  const n = Number(id);
  return previous.includes(n) ? previous.filter(x => x !== n) : [...previous, n];
}

export function toggleCurrentPageIds(previous: number[], pageIds: number[], allSelected: boolean): number[] {
  const page = [...new Set(pageIds.map(Number).filter(Number.isInteger))];
  if (allSelected) {
    const remove = new Set(page);
    return previous.filter(id => !remove.has(id));
  }
  return [...new Set([...previous, ...page])];
}
