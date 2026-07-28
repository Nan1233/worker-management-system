import type { MachineOption, ProductStandardOption } from "./masterDataService";
import { getMachinesByProcess, getProductStandardsByProcess } from "./masterDataService";
import { getDefectOptionsByProcess } from "./productionService";

interface CacheEntry<T> {
  value?: T;
  expiresAt: number;
  pending?: Promise<T>;
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
  const now = Date.now();

  if (current?.value !== undefined && current.expiresAt > now) {
    return current.value;
  }

  // Nếu nhiều component cùng mở một công đoạn, dùng chung request đang chạy
  // thay vì gửi lặp machines/products/defects tới Render và TiDB.
  if (current?.pending) return current.pending;

  const pending = loader()
    .then((value) => {
      cache.set(processId, { value, expiresAt: Date.now() + TTL_MS });
      return value;
    })
    .catch((error) => {
      cache.delete(processId);
      throw error;
    });

  cache.set(processId, { expiresAt: 0, pending });
  return pending;
}

export const getCachedMachines = (processId: number) =>
  getCached(machinesCache, processId, () => getMachinesByProcess(processId));

export const getCachedProductStandards = (processId: number) =>
  getCached(productsCache, processId, () => getProductStandardsByProcess(processId));

export const getCachedDefects = (processId: number) =>
  getCached(defectsCache, processId, () => getDefectOptionsByProcess(processId));

export function prefetchProcessMasterData(processId: number): void {
  void Promise.allSettled([
    getCachedMachines(processId),
    getCachedProductStandards(processId),
    getCachedDefects(processId),
  ]);
}

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
