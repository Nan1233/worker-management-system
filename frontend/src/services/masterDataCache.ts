import type { MachineOption, ProductStandardOption } from "./masterDataService";
import { getMachinesByProcess, getProductStandardsByProcess } from "./masterDataService";
import { getDeductionOptionsByProcess, getDefectOptionsByProcess } from "./productionService";
import { isOfflineLikeError, readOfflineSnapshot, writeOfflineSnapshot } from "./offlinePersistentCache";
import { getSessionCached, clearSessionCache } from "./sessionCache";
import { normalizeProcessId } from "../utils/processAccess";

const TTL_MS = 30 * 60 * 1000;
// Machine/product masters change by manual SQL edits: keep their browser cache short (60s).
const FAST_MASTER_TTL_MS = 60 * 1000;
// v12: invalidate all browser/session product-master snapshots after adding
// GC Long Tay zero-standard work codes (XUATNHAP, KTCD, TAIPP).
// v13: invalidate browser/session and offline product snapshots after adding GC alias C7236 -> R7236 and C13 machine standard.
// v14: invalidate stale empty machine lists after machine master data was populated in DB.
// v15: invalidate stale process-scoped NG/Tru H snapshots after correcting DO process ID mapping and DB catalogues.
// v18: invalidate cached K2 master lists after applying the approved K2-only UI filters.
const MASTER_DATA_EPOCH_KEY = "ktcMasterDataEpoch.v18";
// p2: invalidate browser/session and offline product snapshots after adding GC product C0575 (Cắt, 1460) and KCT work_type fix.
const PRODUCT_MASTER_VERSION = "p2";
const DEDUCTION_MASTER_VERSION = "v12";
const DEFECT_MASTER_VERSION = "v11";

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

export const getCachedMachines = (processId: number): Promise<MachineOption[]> => {
  const canonicalId = normalizeProcessId(processId);
  return getSessionCached(
    epochKey(`machines:${canonicalId}`),
    FAST_MASTER_TTL_MS,
    () => withOfflineSnapshot(`machines:${canonicalId}`, () => getMachinesByProcess(canonicalId)),
  );
};

export const getCachedProductStandards = (processId: number, processCode?: string): Promise<ProductStandardOption[]> => {
  const canonicalId = normalizeProcessId(processId);
  const code = processCode ? processCode.trim().toUpperCase() : "NONE";
  const key = `products:${canonicalId}:${code}:${PRODUCT_MASTER_VERSION}`;
  return getSessionCached(
    epochKey(key),
    FAST_MASTER_TTL_MS,
    () => withOfflineSnapshot(key, () => getProductStandardsByProcess(canonicalId, processCode)),
  );
};

export const getCachedDefects = (processId: number): Promise<DefectOptions> => {
  const canonicalId = normalizeProcessId(processId);
  const key = `defects:${canonicalId}:${DEFECT_MASTER_VERSION}`;
  return getSessionCached(
    epochKey(key),
    TTL_MS,
    () => withOfflineSnapshot(key, () => getDefectOptionsByProcess(canonicalId)),
  );
};

export const getCachedDeductions = (processId: number): Promise<DeductionOptions> => {
  const canonicalId = normalizeProcessId(processId);
  const key = `deductions:${canonicalId}:${DEDUCTION_MASTER_VERSION}`;
  return getSessionCached(
    epochKey(key),
    TTL_MS,
    () => withOfflineSnapshot(key, () => getDeductionOptionsByProcess(canonicalId)),
  );
};

export function prefetchProcessMasterData(processId: number): void {
  const canonicalId = normalizeProcessId(processId);
  void Promise.allSettled([
    getCachedMachines(canonicalId),
    getCachedProductStandards(canonicalId),
    getCachedDefects(canonicalId),
    getCachedDeductions(canonicalId),
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
