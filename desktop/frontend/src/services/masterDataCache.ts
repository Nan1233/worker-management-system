import type { MachineOption, ProductStandardOption } from "./masterDataService";
import { getMachinesByProcess, getProductStandardsByProcess } from "./masterDataService";
import { getDefectOptionsByProcess } from "./productionService";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const TTL_MS = 10 * 60 * 1000;
const machinesCache = new Map<string, CacheEntry<MachineOption[]>>();
const productsCache = new Map<string, CacheEntry<ProductStandardOption[]>>();
const defectsCache = new Map<string, CacheEntry<Awaited<ReturnType<typeof getDefectOptionsByProcess>>>>();

async function getCached<T>(
  cache: Map<string, CacheEntry<T>>,
  cacheKey: string,
  loader: () => Promise<T>,
): Promise<T> {
  const current = cache.get(cacheKey);
  if (current && current.expiresAt > Date.now()) return current.value;

  const value = await loader();
  cache.set(cacheKey, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

export const getCachedMachines = (processId: number, operationType?: "CUT" | "NEST") =>
  getCached(machinesCache, `${processId}:${operationType || ""}`, () => getMachinesByProcess(processId, { operationType }));

export const getCachedProductStandards = (processId: number, filters: { operationType?: "CUT" | "NEST"; operationMode?: "MANUAL" | "MACHINE"; machineId?: number } = {}) =>
  getCached(productsCache, `${processId}:${filters.operationType || ""}:${filters.operationMode || ""}:${filters.machineId || 0}`, () => getProductStandardsByProcess(processId, filters));

export const getCachedDefects = (processId: number) =>
  getCached(defectsCache, String(processId), () => getDefectOptionsByProcess(processId));

export function clearMasterDataCache(processId?: number): void {
  if (processId !== undefined) {
    [...machinesCache.keys()].filter((key) => key.startsWith(`${processId}:`)).forEach((key) => machinesCache.delete(key));
    [...productsCache.keys()].filter((key) => key.startsWith(`${processId}:`)).forEach((key) => productsCache.delete(key));
    defectsCache.delete(String(processId));
    return;
  }
  machinesCache.clear();
  productsCache.clear();
  defectsCache.clear();
}
