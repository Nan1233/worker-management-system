import { useCallback, useEffect, useRef, useState } from "react";
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
  const requestGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        getCachedMachines(processId),
        getCachedProductStandards(processId, processCode),
        getCachedDefects(processId),
        getCachedDeductions(processId),
      ]);

      if (generation !== requestGeneration.current) return;

      const [machines, products, defects, deductions] = results;
      if (machines.status === "fulfilled") setMachineOptions(machines.value);
      if (products.status === "fulfilled") setProductOptions(products.value);
      if (defects.status === "fulfilled") setActiveNgOptions(normalizeDefectOptions(defects.value));
      if (deductions.status === "fulfilled") setActiveDeductionOptions(normalizeDeductionOptions(deductions.value));

      // A stale/cancelled request must never turn a previously loaded master
      // list into an empty selector.
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
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
