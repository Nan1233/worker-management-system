import { useCallback, useEffect, useRef, useState } from "react";
import type { MachineOption, ProductStandardOption } from "../../services/masterDataService";
import {
  getCachedMachines,
  getCachedProductStandards,
  getCachedDefects,
  getCachedDeductions,
} from "../../services/masterDataCache";
import {
  normalizeDefectOptions,
  normalizeDeductionOptions,
  type WorkerMasterOption,
} from "./processMasterDataNormalization";
import {
  AUTH_EPOCH_CHANGED_EVENT,
  CONNECTION_RESTORED_EVENT,
} from "../../services/authRuntimeEvents";

/**
 * Worker master data is sourced ONLY from the DB master configuration.
 *
 * Do not add process-specific frontend fallback lists here.
 * The process_id relation in the master tables is the single source of truth
 * for which NG / Trừ giờ are available to each công đoạn.
 */
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

      if (machines.status === "fulfilled") {
        setMachineOptions(machines.value);
      }

      if (products.status === "fulfilled") {
        setProductOptions(products.value);
      }

      if (defects.status === "fulfilled") {
        // Only defect_types/process relation returned by the master API.
        setActiveNgOptions(normalizeDefectOptions(defects.value, processId));
      } else {
        setActiveNgOptions([]);
      }

      if (deductions.status === "fulfilled") {
        // Only deduction_types/process relation returned by the master API.
        // No frontend fallback/merge is allowed.
        setActiveDeductionOptions(
          normalizeDeductionOptions(deductions.value, processId),
        );
      } else {
        setActiveDeductionOptions([]);
      }
    } finally {
      if (generation === requestGeneration.current) {
        setLoading(false);
      }
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
