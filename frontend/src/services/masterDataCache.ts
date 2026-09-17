import type { MachineOption, ProductStandardOption } from "./masterDataService";
import { getMachinesByProcess, getProductStandardsByProcess } from "./masterDataService";
import { getDeductionOptionsByProcess, getDefectOptionsByProcess } from "./productionService";
import { isOfflineLikeError, readOfflineSnapshot, writeOfflineSnapshot } from "./offlinePersistentCache";
import { getSessionCached, clearSessionCache } from "./sessionCache";

const TTL_MS = 30 * 60 * 1000;
const MASTER_DATA_EPOCH_KEY = "ktcMasterDataEpoch.v8";
const DEDUCTION_MASTER_VERSION = "v7";
const DEFECT_MASTER_VERSION = "v8";

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
  const code = processCode ? processCode.trim().toUpperCase() : "NONE";
  const key = `products:${processId}:${code}`;
  return getSessionCached(
    epochKey(key),
    TTL_MS,
    () => withOfflineSnapshot(key, () => getProductStandardsByProcess(processId, processCode)),
  );
};

/**
 * Defect master data must not be served from the in-memory session cache.
 * Online API remains the source of truth; persistent snapshot is only a
 * last-resort fallback when the device is genuinely offline.
 */
export const getCachedDefects = async (processId: number): Promise<DefectOptions> => {
  const key = `defects:${processId}:${DEFECT_MASTER_VERSION}`;
  return withOfflineSnapshot(key, () => getDefectOptionsByProcess(processId));
};

/**
 * Deduction master data follows the same rule as defects: online API is the
 * source of truth. Offline devices may use the last persistent snapshot.
 */
export const getCachedDeductions = async (processId: number): Promise<DeductionOptions> => {
  const key = `deductions:${processId}:${DEDUCTION_MASTER_VERSION}`;
  return withOfflineSnapshot(key, () => getDeductionOptionsByProcess(processId));
};

export function prefetchProcessMasterData(processId: number): void {
  void Promise.allSettled([
    getCachedMachines(processId),
    getCachedProductStandards(processId),
    getCachedDefects(processId),
    getCachedDeductions(processId),
  ]);
}

export function bumpMasterDataEpoch(): number {
  const next = getMasterDataEpoch() + 1;
  try {
    localStorage.setItem(MASTER_DATA_EPOCH_KEY, String(next));
  } catch {
    // Ignore storage failures; the current request can still use the new namespace.
  }
  clearSessionCache();
  return next;
}
