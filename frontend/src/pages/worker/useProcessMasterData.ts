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

const ZERO_STANDARD_LONG_WORK_CODES = new Set(["XUATNHAP", "KTCD", "TAIPP"]);
const PROCESS_ID_BY_CODE: Record<string, number> = {
  GC: 1,
  MAI: 2,
  DO: 60001,
  K1: 3,
  K2: 4,
  CAN: 60002,
  EP: 60003,
  XLBV: 60004,
  SX3: 60005,
  CVK: 60006,
};

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
    const resolvedProcessId = Number.isInteger(processId) && processId > 0
      ? processId
      : PROCESS_ID_BY_CODE[String(processCode || "").trim().toUpperCase()] || 0;

    if (!resolvedProcessId) {
      setMachineOptions([]);
      setProductOptions([]);
      setActiveNgOptions([]);
      setActiveDeductionOptions([]);
      setLoading(false);
      return;
    }

    const generation = ++requestGeneration.current;
    setLoading(true);

    const isProcessSelectionRoute =
      typeof window !== "undefined" &&
      window.location.pathname.replace(/\/+$/, "").endsWith("/worker/process/select");

    try {
      const [machines, products] = await Promise.allSettled([
        getCachedMachines(resolvedProcessId),
        getCachedProductStandards(resolvedProcessId, processCode),
      ]);

      if (generation !== requestGeneration.current) return;

      if (machines.status === "fulfilled") {
        setMachineOptions(machines.value);
      } else {
        setMachineOptions([]);
      }

      if (products.status === "fulfilled") {
        // XUATNHAP / KTCD / TAIPP are real DB master rows with
        // standard_output=0. The form still requires a positive value for
        // normal products, so expose a UI-only placeholder of 1 for these
        // three codes. processReportSubmission converts them back to 0.
        // This does NOT create or modify DB master data.
        const workerProducts = processCode === "GC"
          ? products.value.map((product) => {
              const code = String(product.product_code || "").trim().toUpperCase();
              return ZERO_STANDARD_LONG_WORK_CODES.has(code)
                ? { ...product, standard_output: 1 }
                : product;
            })
          : products.value;
        setProductOptions(workerProducts);
      } else {
        setProductOptions([]);
      }

      setLoading(false);

      const optionalResults = await Promise.allSettled([
        getCachedDefects(resolvedProcessId),
        isProcessSelectionRoute
          ? Promise.resolve([] as Awaited<ReturnType<typeof getCachedDeductions>>)
          : getCachedDeductions(resolvedProcessId),
      ]);

      if (generation !== requestGeneration.current) return;

      const [defects, deductions] = optionalResults;

      if (defects.status === "fulfilled") {
        setActiveNgOptions(normalizeDefectOptions(defects.value, resolvedProcessId));
      } else {
        setActiveNgOptions([]);
      }

      if (deductions.status === "fulfilled") {
        setActiveDeductionOptions(
          normalizeDeductionOptions(deductions.value, resolvedProcessId),
        );
      } else {
        setActiveDeductionOptions([]);
      }
    } catch {
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