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

/**
 * Các khoản thời lượng đặc thù của từng công đoạn nhưng bản chất vẫn là
 * THỜI GIAN TRỪ. Chúng được đưa vào cùng selector Trừ giờ để tổng thời gian
 * và payload deductions dùng chung một cơ chế.
 *
 * Giá trị UI của deduction luôn là phút; backend chuyển/ghi nhận theo giờ.
 */
const PROCESS_SPECIFIC_DEDUCTION_OPTIONS: Record<string, WorkerMasterOption[]> = {
  K1: [
    { code: "LATE_EARLY", label: "Đi muộn / về sớm", key: "late_early_hours", deduction_code: "LATE_EARLY", deduction_name: "Đi muộn / về sớm" },
  ],
  CAN: [
    { code: "VSK", label: "VSK", key: "vsk_hours", deduction_code: "VSK", deduction_name: "VSK" },
    { code: "FIVE_S_OVERTIME", label: "5S + gia ca", key: "five_s_overtime_hours", deduction_code: "FIVE_S_OVERTIME", deduction_name: "5S + gia ca" },
    { code: "MOLD_WARMUP", label: "Hâm khuôn", key: "mold_warmup_hours", deduction_code: "MOLD_WARMUP", deduction_name: "Hâm khuôn" },
    { code: "MOLD_REPAIR", label: "Sửa khuôn", key: "mold_repair_hours", deduction_code: "MOLD_REPAIR", deduction_name: "Sửa khuôn" },
    { code: "MACHINE_REPAIR", label: "Sửa máy", key: "machine_repair_hours", deduction_code: "MACHINE_REPAIR", deduction_name: "Sửa máy" },
    { code: "MACHINE_STOP", label: "Dừng máy", key: "machine_stop_hours", deduction_code: "MACHINE_STOP", deduction_name: "Dừng máy" },
  ],
  XLBV: [
    { code: "STOP_OPERATION", label: "Dừng thao tác", key: "stop_operation_hours", deduction_code: "STOP_OPERATION", deduction_name: "Dừng thao tác" },
    { code: "SHORTAGE", label: "Thiếu sản lượng", key: "shortage_hours", deduction_code: "SHORTAGE", deduction_name: "Thiếu sản lượng" },
  ],
  SX3: [
    { code: "MACHINE_STOP", label: "Dừng máy", key: "stop_operation_minutes", deduction_code: "MACHINE_STOP", deduction_name: "Dừng máy" },
  ],
};

const mergeDeductionOptions = (base: WorkerMasterOption[], processCode: string): WorkerMasterOption[] => {
  const merged = [...base];
  const existingKeys = new Set(merged.map((item) => String(item.key || "").trim()));
  for (const item of PROCESS_SPECIFIC_DEDUCTION_OPTIONS[processCode] || []) {
    if (!existingKeys.has(item.key)) {
      merged.push(item);
      existingKeys.add(item.key);
    }
  }
  return merged;
};

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
      if (defects.status === "fulfilled") {
        setActiveNgOptions(normalizeDefectOptions(defects.value, processId));
      }
      if (deductions.status === "fulfilled") {
        const normalized = normalizeDeductionOptions(deductions.value, processId);
        setActiveDeductionOptions(mergeDeductionOptions(normalized, String(processCode || "").trim().toUpperCase()));
      }

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
