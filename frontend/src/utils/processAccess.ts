import type { WorkerProfile } from "../types/worker";

const splitCsv = (value?: string | null): string[] =>
  String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const hasStructuredProcesses = (worker: WorkerProfile | null | undefined): boolean =>
  Array.isArray(worker?.processes);

export const getWorkerProcessIds = (worker: WorkerProfile | null | undefined): Set<number> => {
  const values = hasStructuredProcesses(worker)
    ? (worker?.processes ?? []).map((item) => Number(item.id))
    : splitCsv(worker?.process_ids).map(Number);

  return new Set(values.filter((value) => Number.isInteger(value) && value > 0));
};

export const getWorkerProcessCodes = (worker: WorkerProfile | null | undefined): Set<string> => {
  const values = hasStructuredProcesses(worker)
    ? (worker?.processes ?? []).map((item) => String(item.code ?? ""))
    : splitCsv(worker?.process_codes);

  return new Set(values.map((value) => value.trim().toUpperCase()).filter(Boolean));
};

export const workerCanAccessProcess = (
  worker: WorkerProfile | null | undefined,
  processId: number,
  processCode?: string
): boolean => {
  // SX3 is intentionally removed from the KTC worker process list.
  if (Number(processId) === 60005 || String(processCode ?? "").trim().toUpperCase() === "SX3") return false;
  if (!worker || worker.status !== "active") return false;

  // CVK is a common time-based work process. It is intentionally available to
  // every active worker because Xuất/Nhập/Hỗ trợ does not represent a normal
  // production process assignment and has no product productivity.
  if (Number(processId) === 60006 || String(processCode ?? "").trim().toUpperCase() === "CVK") return true;

  const ids = getWorkerProcessIds(worker);
  const codes = getWorkerProcessCodes(worker);
  const normalizedCode = String(processCode ?? "").trim().toUpperCase();
  return ids.has(processId) || (normalizedCode !== "" && codes.has(normalizedCode));
};
