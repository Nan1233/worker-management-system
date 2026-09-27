import type { WorkerProfile } from "../types/worker";

/**
 * Canonical process ids in the current DB. Older FE builds used 60001..60005
 * for these processes; accept those ids at the boundary so old cached routes
 * and persisted assignments cannot make a valid worker look unauthorized.
 */
const LEGACY_PROCESS_ID_MAP: Record<number, number> = {
  60001: 3, // DO
  60002: 8, // CAN
  60003: 7, // EP
  60004: 6, // XLBV
  60005: 9, // SX3
};

export const normalizeProcessId = (processId: number): number => {
  const numeric = Number(processId);
  return LEGACY_PROCESS_ID_MAP[numeric] ?? numeric;
};

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

  return new Set(values.map(normalizeProcessId).filter((value) => Number.isInteger(value) && value > 0));
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
  // CVK is not a real process in the current DB and remains disabled.
  if (Number(processId) === 60006 || String(processCode ?? "").trim().toUpperCase() === "CVK") return false;
  if (!worker || worker.status !== "active") return false;

  const normalizedId = normalizeProcessId(processId);
  const ids = getWorkerProcessIds(worker);
  const codes = getWorkerProcessCodes(worker);
  const normalizedCode = String(processCode ?? "").trim().toUpperCase();
  return ids.has(normalizedId) || (normalizedCode !== "" && codes.has(normalizedCode));
};
