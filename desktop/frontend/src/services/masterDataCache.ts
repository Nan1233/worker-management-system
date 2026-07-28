import type { MachineOption, ProductStandardOption } from "./masterDataService";
import { getMachinesByProcess, getProductStandardsByProcess } from "./masterDataService";
import { getDefectOptionsByProcess } from "./productionService";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const TTL_MS = 10 * 60 * 1000;
const machinesCache = new Map<number, CacheEntry<MachineOption[]>>();
const productsCache = new Map<number, CacheEntry<ProductStandardOption[]>>();
const defectsCache = new Map<number, CacheEntry<Awaited<ReturnType<typeof getDefectOptionsByProcess>>>>();

async function getCached<T>(
  cache: Map<number, CacheEntry<T>>,
  processId: number,
  loader: () => Promise<T>,
): Promise<T> {
  const current = cache.get(processId);
  if (current && current.expiresAt > Date.now()) return current.value;

  const value = await loader();
  cache.set(processId, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

export const getCachedMachines = (processId: number) =>
  getCached(machinesCache, processId, () => getMachinesByProcess(processId));

export const getCachedProductStandards = (processId: number) =>
  getCached(productsCache, processId, () => getProductStandardsByProcess(processId));

export const getCachedDefects = (processId: number) =>
  getCached(defectsCache, processId, () => getDefectOptionsByProcess(processId));

export function clearMasterDataCache(processId?: number): void {
  if (processId !== undefined) {
    machinesCache.delete(processId);
    productsCache.delete(processId);
    defectsCache.delete(processId);
    return;
  }
  machinesCache.clear();
  productsCache.clear();
  defectsCache.clear();
}
