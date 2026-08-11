import type { MachineOption, ProductStandardOption } from "./masterDataService";
import { getMachinesByProcess, getProductStandardsByProcess } from "./masterDataService";
import { getDefectOptionsByProcess } from "./productionService";
import { getSessionCached, clearSessionCache } from "./sessionCache";

const TTL_MS = 30 * 60 * 1000;
const MASTER_DATA_EPOCH_KEY = "ktcMasterDataEpoch";

type DefectOptions = Awaited<ReturnType<typeof getDefectOptionsByProcess>>;

function getMasterDataEpoch(): number {
  try {
    const value = Number(localStorage.getItem(MASTER_DATA_EPOCH_KEY));
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function epochKey(key: string): string {
  return `master:v${getMasterDataEpoch()}:${key}`;
}

export const getCachedMachines = (processId: number): Promise<MachineOption[]> =>
  getSessionCached(
    epochKey(`machines:${processId}`),
    TTL_MS,
    () => getMachinesByProcess(processId),
  );

export const getCachedProductStandards = (processId: number, processCode?: string): Promise<ProductStandardOption[]> =>
  getSessionCached(
    epochKey(`products:${processId}:${processCode ? processCode.trim().toUpperCase() : "BY_ID"}`),
    TTL_MS,
    () => getProductStandardsByProcess(processId, processCode),
  );

export const getCachedDefects = (processId: number): Promise<DefectOptions> =>
  getSessionCached(
    epochKey(`defects:${processId}`),
    TTL_MS,
    () => getDefectOptionsByProcess(processId),
  );

export function prefetchProcessMasterData(processId: number, processCode?: string): void {
  void Promise.allSettled([
    getCachedMachines(processId),
    getCachedProductStandards(processId, processCode),
    getCachedDefects(processId),
  ]);
}

/**
 * Advances a browser-wide master-data revision. Other tabs immediately stop
 * addressing the previous cache namespace on their next master-data read.
 */
export function bumpMasterDataEpoch(): number {
  const next = getMasterDataEpoch() + 1;
  try { localStorage.setItem(MASTER_DATA_EPOCH_KEY, String(next)); } catch { /* noop */ }
  clearMasterDataCache();
  return next;
}

export function clearMasterDataCache(processId?: number): void {
  if (processId !== undefined) {
    clearSessionCache(epochKey(`machines:${processId}`));
    clearSessionCache(epochKey(`products:${processId}`));
    clearSessionCache(epochKey(`defects:${processId}`));
    return;
  }
  clearSessionCache("master:");
}
