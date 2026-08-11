import type { MachineOption, ProductStandardOption } from "./masterDataService";
import { getMachinesByProcess, getProductStandardsByProcess } from "./masterDataService";
import { getDeductionOptionsByProcess, getDefectOptionsByProcess } from "./productionService";
import { isOfflineLikeError, readOfflineSnapshot, writeOfflineSnapshot } from "./offlinePersistentCache";
import { getSessionCached, clearSessionCache } from "./sessionCache";

const TTL_MS = 30 * 60 * 1000;
const MASTER_DATA_EPOCH_KEY = "ktcMasterDataEpoch";

type DefectOptions = Awaited<ReturnType<typeof getDefectOptionsByProcess>>;
type DeductionOptions = Awaited<ReturnType<typeof getDeductionOptionsByProcess>>;

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

async function withOfflineSnapshot<T>(name: string, loader: () => Promise<T>): Promise<T> {
  try {
    const value = await loader();
    writeOfflineSnapshot(name, value);
    return value;
  } catch (error) {
    if (isOfflineLikeError(error)) {
      const cached = readOfflineSnapshot<T>(name);
      if (cached !== null) return cached;
    }
    throw error;
  }
}

export const getCachedMachines = (processId: number): Promise<MachineOption[]> =>
  getSessionCached(
    epochKey(`machines:${processId}`),
    TTL_MS,
    () => withOfflineSnapshot(`machines:${processId}`, () => getMachinesByProcess(processId)),
  );

export const getCachedProductStandards = (processId: number, processCode?: string): Promise<ProductStandardOption[]> => {
  const code = processCode ? processCode.trim().toUpperCase() : String(processId);
  return getSessionCached(
    epochKey(`products:${code}`),
    TTL_MS,
    () => withOfflineSnapshot(`products:${code}`, () => getProductStandardsByProcess(processId, processCode)),
  );
};

export const getCachedDefects = (processId: number): Promise<DefectOptions> =>
  getSessionCached(
    epochKey(`defects:${processId}`),
    TTL_MS,
    () => withOfflineSnapshot(`defects:${processId}`, () => getDefectOptionsByProcess(processId)),
  );

export const getCachedDeductions = (processId: number): Promise<DeductionOptions> =>
  getSessionCached(
    epochKey(`deductions:${processId}`),
    TTL_MS,
    () => withOfflineSnapshot(`deductions:${processId}`, () => getDeductionOptionsByProcess(processId)),
  );

export function prefetchProcessMasterData(processId: number): void {
  void Promise.allSettled([
    getCachedMachines(processId),
    getCachedProductStandards(processId),
    getCachedDefects(processId),
    getCachedDeductions(processId),
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
    clearSessionCache(epochKey(`deductions:${processId}`));
    return;
  }
  clearSessionCache("master:");
}
