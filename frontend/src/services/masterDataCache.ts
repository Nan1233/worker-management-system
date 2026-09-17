import type { MachineOption, ProductStandardOption } from "./masterDataService";
import { getMachinesByProcess, getProductStandardsByProcess } from "./masterDataService";
import { getDeductionOptionsByProcess, getDefectOptionsByProcess } from "./productionService";
import { isOfflineLikeError, readOfflineSnapshot, writeOfflineSnapshot } from "./offlinePersistentCache";
import { getSessionCached, clearSessionCache } from "./sessionCache";

// Master data changes infrequently, so keep it in the authenticated tab session
// for 30 minutes. getSessionCached also deduplicates concurrent requests.
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
 * Defect master data is session-cached per authenticated worker/process.
 * The API remains the source of truth; epoch/version invalidation clears the
 * session cache whenever master configuration changes.
 */
export const getCachedDefects = (processId: number): Promise<DefectOptions> => {
  const key = `defects:${processId}:${DEFECT_MASTER_VERSION}`;
  return getSessionCached(
    epochKey(key),
    TTL_MS,
    () => withOfflineSnapshot(key, () => getDefectOptionsByProcess(processId)),
  );
};

/**
 * Deduction master data follows the same session-cache policy as defects.
 * Online API data is cached for normal navigation; the persistent snapshot is
 * still available as a last-resort fallback when the device is offline.
 */
export const getCachedDeductions = (processId: number): Promise<DeductionOptions> => {
  const key = `deductions:${processId}:${DEDUCTION_MASTER_VERSION}`;
  return getSessionCached(
    epochKey(key),
    TTL_MS,
    () => withOfflineSnapshot(key, () => getDeductionOptionsByProcess(processId)),
  );
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
