import type { MachineOption, ProductStandardOption } from "./masterDataService";
import { getMachinesByProcess, getProductStandardsByProcess } from "./masterDataService";
import { getDefectOptionsByProcess } from "./productionService";
import { getSessionCached, clearSessionCache } from "./sessionCache";

const TTL_MS = 30 * 60 * 1000;

type DefectOptions = Awaited<ReturnType<typeof getDefectOptionsByProcess>>;

export const getCachedMachines = (processId: number): Promise<MachineOption[]> =>
  getSessionCached(
    `master:machines:${processId}`,
    TTL_MS,
    () => getMachinesByProcess(processId),
  );

export const getCachedProductStandards = (processId: number): Promise<ProductStandardOption[]> =>
  getSessionCached(
    `master:products:${processId}`,
    TTL_MS,
    () => getProductStandardsByProcess(processId),
  );

export const getCachedDefects = (processId: number): Promise<DefectOptions> =>
  getSessionCached(
    `master:defects:${processId}`,
    TTL_MS,
    () => getDefectOptionsByProcess(processId),
  );

export function prefetchProcessMasterData(processId: number): void {
  void Promise.allSettled([
    getCachedMachines(processId),
    getCachedProductStandards(processId),
    getCachedDefects(processId),
  ]);
}

export function clearMasterDataCache(processId?: number): void {
  if (processId !== undefined) {
    clearSessionCache(`master:machines:${processId}`);
    clearSessionCache(`master:products:${processId}`);
    clearSessionCache(`master:defects:${processId}`);
    return;
  }
  clearSessionCache("master:");
}
