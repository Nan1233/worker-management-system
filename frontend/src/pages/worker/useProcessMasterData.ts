import { useCallback, useEffect, useState } from "react";
import type { MachineOption, ProductStandardOption } from "../../services/masterDataService";
import { getCachedMachines, getCachedProductStandards, getCachedDefects, getCachedDeductions } from "../../services/masterDataCache";
import {
  normalizeDefectOptions,
  normalizeDeductionOptions,
  type WorkerMasterOption,
} from "./processMasterDataNormalization";
import {
  AUTH_EPOCH_CHANGED_EVENT,
  CONNECTION_RESTORED_EVENT,
} from "../../services/authRuntimeEvents";

export function useProcessMasterData(processId: number, processCode: string) {
  const [machineOptions, setMachineOptions] = useState<MachineOption[]>([]);
  const [productOptions, setProductOptions] = useState<ProductStandardOption[]>([]);
  const [activeNgOptions, setActiveNgOptions] = useState<WorkerMasterOption[]>([]);
  const [activeDeductionOptions, setActiveDeductionOptions] = useState<WorkerMasterOption[]>([]);
  const [loadingMasterData, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [machines, products, defects, deductions] = await Promise.all([
        getCachedMachines(processId),
        getCachedProductStandards(processId, processCode),
        getCachedDefects(processId),
        getCachedDeductions(processId),
      ]);

      setMachineOptions(machines);
      setProductOptions(products);
      setActiveNgOptions(normalizeDefectOptions(defects));
      setActiveDeductionOptions(normalizeDeductionOptions(deductions));
    } catch {
      // Keep the last successful master data instead of replacing it with []
      // when a stale-session request is cancelled during account switching.
    } finally {
      setLoading(false);
    }
  }, [processId, processCode]);

  useEffect(() => {
    let alive = true;
    void load();

    const reloadAfterAuthRecovery = () => {
      if (!alive) return;
      void load();
    };

    window.addEventListener("ktc:auth-ready", reloadAfterAuthRecovery);
    window.addEventListener(AUTH_EPOCH_CHANGED_EVENT, reloadAfterAuthRecovery);
    window.addEventListener(CONNECTION_RESTORED_EVENT, reloadAfterAuthRecovery);

    return () => {
      alive = false;
      window.removeEventListener("ktc:auth-ready", reloadAfterAuthRecovery);
      window.removeEventListener(AUTH_EPOCH_CHANGED_EVENT, reloadAfterAuthRecovery);
      window.removeEventListener(CONNECTION_RESTORED_EVENT, reloadAfterAuthRecovery);
    };
  }, [load]);

  return {
    machineOptions,
    productOptions,
    activeNgOptions,
    activeDeductionOptions,
    loadingMasterData,
  };
}