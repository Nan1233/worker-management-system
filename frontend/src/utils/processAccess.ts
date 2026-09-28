import type { WorkerProfile } from "../types/worker";

const PROCESS_ID_BY_CODE: Record<string, number> = {
  GC: 1,
  MAI: 2,
  DO: 3,
  K1: 4,
  K2: 5,
  XLBV: 6,
  EP: 7,
  CAN: 8,
  SX3: 9,
};

const LEGACY_PROCESS_ID_MAP: Record<number, number> = {
  60001: PROCESS_ID_BY_CODE.DO,
  60002: PROCESS_ID_BY_CODE.CAN,
  60003: PROCESS_ID_BY_CODE.EP,
  60004: PROCESS_ID_BY_CODE.XLBV,
  60005: PROCESS_ID_BY_CODE.SX3,
};

export const normalizeProcessCode = (processCode?: string | null): string =>
  String(processCode ?? "").trim().toUpperCase();

export const normalizeProcessId = (processId: number): number => {
  const numeric = Number(processId);
  return LEGACY_PROCESS_ID_MAP[numeric] ?? numeric;
};

export const getCanonicalProcessId = (processId: number, processCode?: string | null): number => {
  const code = normalizeProcessCode(processCode);
  return PROCESS_ID_BY_CODE[code] ?? normalizeProcessId(processId);
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
    ? (worker?.processes ?? []).map((item) => getCanonicalProcessId(Number(item.id), item.code))
    : splitCsv(worker?.process_ids).map(Number).map(normalizeProcessId);

  return new Set(values.filter((value) => Number.isInteger(value) && value > 0));
};

export const getWorkerProcessCodes = (worker: WorkerProfile | null | undefined): Set<string> => {
  const values = hasStructuredProcesses(worker)
    ? (worker?.processes ?? []).map((item) => String(item.code ?? ""))
    : splitCsv(worker?.process_codes);

  return new Set(values.map(normalizeProcessCode).filter(Boolean));
};

export const workerCanAccessProcess = (
  worker: WorkerProfile | null | undefined,
  processId: number,
  processCode?: string
): boolean => {
  if (normalizeProcessCode(processCode) === "CVK" || Number(processId) === 60006) return false;
  if (!worker || worker.status !== "active") return false;

  const normalizedId = getCanonicalProcessId(processId, processCode);
  const ids = getWorkerProcessIds(worker);
  const codes = getWorkerProcessCodes(worker);
  const normalizedCode = normalizeProcessCode(processCode);
  return ids.has(normalizedId) || (normalizedCode !== "" && codes.has(normalizedCode));
};
