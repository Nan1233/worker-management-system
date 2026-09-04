import type { MachineOption, ProductStandardOption } from "./masterDataService";
import { getMachinesByProcess, getProductStandardsByProcess } from "./masterDataService";
import { getDeductionOptionsByProcess, getDefectOptionsByProcess } from "./productionService";
import { isOfflineLikeError, readOfflineSnapshot, writeOfflineSnapshot } from "./offlinePersistentCache";
import { getSessionCached, clearSessionCache } from "./sessionCache";

const TTL_MS = 30 * 60 * 1000;
// Bump this namespace whenever the worker master contract changes so a browser
// cannot keep an older NG list after a Render deployment.
const MASTER_DATA_EPOCH_KEY = "ktcMasterDataEpoch.v3";

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

/**
 * Manager Excel suggestions must come from master data for the selected
 * process, not only from the currently visible/paginated reports.
 */
function syncManagerMasterDataHints(machines: MachineOption[], products: ProductStandardOption[]): void {
  if (typeof document === "undefined") return;

  const machineList = document.getElementById("manager-machine-hints");
  if (machineList) {
    machineList.replaceChildren();
    const values = Array.from(new Set(
      machines
        .map((item) => String(item?.machine_code || "").trim())
        .filter(Boolean),
    ));
    for (const value of values) {
      const option = document.createElement("option");
      option.value = value;
      machineList.appendChild(option);
    }
  }

  const productList = document.getElementById("manager-product-hints");
  if (productList) {
    productList.replaceChildren();
    const values = Array.from(new Set(
      products
        .map((item) => String(item?.product_code || "").trim())
        .filter(Boolean),
    ));
    for (const value of values) {
      const option = document.createElement("option");
      option.value = value;
      productList.appendChild(option);
    }
  }
}

async function syncManagerHintsForProcess(processId: number): Promise<void> {
  try {
    const [machines, products] = await Promise.all([
      getCachedMachines(processId),
      getCachedProductStandards(processId),
    ]);
    syncManagerMasterDataHints(machines, products);
  } catch {
    // Suggestions are optional UI enhancement; never fail the master-data flow.
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

export const getCachedDefects = (processId: number): Promise<DefectOptions> =>
  getSessionCached(
    epochKey(`defects:${processId}`),
    TTL_MS,
    () => withOfflineSnapshot(`defects:${processId}`, () => getDefectOptionsByProcess(processId)),
  ).then((value) => {
    void syncManagerHintsForProcess(processId);
    return value;
  });

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
    clearSessionCache(epochKey(`products:${processId}:NONE`));
    clearSessionCache(epochKey(`defects:${processId}`));
    clearSessionCache(epochKey(`deductions:${processId}`));
    return;
  }
  clearSessionCache("master:");
}
