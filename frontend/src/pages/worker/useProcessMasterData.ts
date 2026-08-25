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
 * Fallback thời gian trừ được đối chiếu từ file mẫu KTC.
 * Master DB theo process_id vẫn được ưu tiên; các giá trị dưới đây chỉ bổ sung
 * cho dữ liệu cũ chưa có cấu hình master.
 */
const PROCESS_SPECIFIC_DEDUCTION_OPTIONS: Record<string, WorkerMasterOption[]> = {
  K1: [
    { code: "LATE_EARLY", label: "Đi muộn, về sớm", key: "late_early_hours", deduction_code: "LATE_EARLY", deduction_name: "Đi muộn, về sớm" },
    { code: "XLBV_SUPPORT", label: "Trừ giờ XLBV (người làm)", key: "xlbv_support_hours", deduction_code: "XLBV_SUPPORT", deduction_name: "Trừ giờ XLBV (người làm)" },
  ],
  CAN: [
    { code: "OUTPUT_SHORTAGE", label: "Thiếu sản lượng", key: "output_shortage_hours", deduction_code: "OUTPUT_SHORTAGE", deduction_name: "Thiếu sản lượng" },
    { code: "MACHINE_START_CHECK", label: "Bật máy, xét máy, đầu giờ", key: "machine_start_check_hours", deduction_code: "MACHINE_START_CHECK", deduction_name: "Bật máy, xét máy, đầu giờ" },
    { code: "CODE_CHANGE", label: "Chuyển mã", key: "code_change_hours", deduction_code: "CODE_CHANGE", deduction_name: "Chuyển mã" },
    { code: "MACHINE_ADJUST", label: "Chỉnh máy", key: "machine_adjust_hours", deduction_code: "MACHINE_ADJUST", deduction_name: "Chỉnh máy" },
    { code: "POWER_LOSS", label: "Mất điện", key: "power_loss_hours", deduction_code: "POWER_LOSS", deduction_name: "Mất điện" },
    { code: "AIR_LOSS", label: "Mất khí", key: "air_loss_hours", deduction_code: "AIR_LOSS", deduction_name: "Mất khí" },
    { code: "WAIT_MATERIAL", label: "Chờ hàng", key: "wait_material_hours", deduction_code: "WAIT_MATERIAL", deduction_name: "Chờ hàng" },
    { code: "MACHINE_MAINTENANCE", label: "Bảo dưỡng máy", key: "machine_maintenance_hours", deduction_code: "MACHINE_MAINTENANCE", deduction_name: "Bảo dưỡng máy" },
    { code: "BREAK", label: "Nghỉ giải lao", key: "break_hours", deduction_code: "BREAK", deduction_name: "Nghỉ giải lao" },
    { code: "SHIFT_HANDOVER", label: "Giao ca", key: "shift_handover_hours", deduction_code: "SHIFT_HANDOVER", deduction_name: "Giao ca" },
    { code: "SUPPORT", label: "Dừng máy đi hỗ trợ", key: "support_hours", deduction_code: "SUPPORT", deduction_name: "Dừng máy đi hỗ trợ" },
    { code: "FIVE_S", label: "5S", key: "five_s_hours", deduction_code: "FIVE_S", deduction_name: "5S" },
    { code: "TRAINING", label: "Học việc, đào tạo", key: "training_hours", deduction_code: "TRAINING", deduction_name: "Học việc, đào tạo" },
    { code: "LATE_EARLY", label: "Đi muộn về sớm", key: "late_early_hours", deduction_code: "LATE_EARLY", deduction_name: "Đi muộn về sớm" },
  ],
  EP: [
    { code: "LATE_EARLY", label: "Đi muộn về sớm", key: "late_early_hours", deduction_code: "LATE_EARLY", deduction_name: "Đi muộn về sớm" },
    { code: "XLBV_SUPPORT", label: "Trừ giờ XLBV (người làm)", key: "xlbv_support_hours", deduction_code: "XLBV_SUPPORT", deduction_name: "Trừ giờ XLBV (người làm)" },
    { code: "WAIT_MATERIAL", label: "Chờ hàng", key: "wait_material_hours", deduction_code: "WAIT_MATERIAL", deduction_name: "Chờ hàng" },
  ],
  XLBV: [
    { code: "OUTPUT_SHORTAGE", label: "Thiếu sản lượng", key: "output_shortage_hours", deduction_code: "OUTPUT_SHORTAGE", deduction_name: "Thiếu sản lượng" },
    { code: "LATE_EARLY", label: "Đi muộn về sớm", key: "late_early_hours", deduction_code: "LATE_EARLY", deduction_name: "Đi muộn về sớm" },
  ],
  CUT: [
    { code: "OUTPUT_SHORTAGE", label: "Thiếu sản lượng", key: "output_shortage_hours", deduction_code: "OUTPUT_SHORTAGE", deduction_name: "Thiếu sản lượng" },
    { code: "MACHINE_START_CHECK", label: "Bật máy, xét máy", key: "machine_start_check_hours", deduction_code: "MACHINE_START_CHECK", deduction_name: "Bật máy, xét máy" },
    { code: "CODE_CHANGE", label: "Chuyển mã", key: "code_change_hours", deduction_code: "CODE_CHANGE", deduction_name: "Chuyển mã" },
    { code: "MACHINE_ADJUST", label: "Chỉnh máy", key: "machine_adjust_hours", deduction_code: "MACHINE_ADJUST", deduction_name: "Chỉnh máy" },
    { code: "WAIT_MACHINE_ADJUST", label: "Chờ chỉnh máy", key: "wait_machine_adjust_hours", deduction_code: "WAIT_MACHINE_ADJUST", deduction_name: "Chờ chỉnh máy" },
    { code: "POWER_LOSS", label: "Mất điện", key: "power_loss_hours", deduction_code: "POWER_LOSS", deduction_name: "Mất điện" },
    { code: "AIR_LOSS", label: "Mất khí", key: "air_loss_hours", deduction_code: "AIR_LOSS", deduction_name: "Mất khí" },
    { code: "WAIT_MATERIAL", label: "Chờ hàng", key: "wait_material_hours", deduction_code: "WAIT_MATERIAL", deduction_name: "Chờ hàng" },
    { code: "MACHINE_MAINTENANCE", label: "Bảo dưỡng máy", key: "machine_maintenance_hours", deduction_code: "MACHINE_MAINTENANCE", deduction_name: "Bảo dưỡng máy" },
    { code: "BREAK", label: "Nghỉ giải lao", key: "break_hours", deduction_code: "BREAK", deduction_name: "Nghỉ giải lao" },
    { code: "SHIFT_HANDOVER", label: "Giao ca", key: "shift_handover_hours", deduction_code: "SHIFT_HANDOVER", deduction_name: "Giao ca" },
    { code: "SUPPORT", label: "Dừng máy đi hỗ trợ", key: "support_hours", deduction_code: "SUPPORT", deduction_name: "Dừng máy đi hỗ trợ" },
    { code: "WASH_RUBBER", label: "Giặt cs/cân cs, tuốt-tái pp, GL", key: "wash_rubber_hours", deduction_code: "WASH_RUBBER", deduction_name: "Giặt cs/cân cs, tuốt-tái pp, GL" },
    { code: "FIVE_S", label: "5S", key: "five_s_hours", deduction_code: "FIVE_S", deduction_name: "5S" },
    { code: "TRAINING", label: "Học việc, đào tạo", key: "training_hours", deduction_code: "TRAINING", deduction_name: "Học việc, đào tạo" },
    { code: "LATE_EARLY", label: "Đi muộn về sớm", key: "late_early_hours", deduction_code: "LATE_EARLY", deduction_name: "Đi muộn về sớm" },
  ],
  MAI: [
    { code: "OUTPUT_SHORTAGE", label: "Thiếu sản lượng", key: "output_shortage_hours", deduction_code: "OUTPUT_SHORTAGE", deduction_name: "Thiếu sản lượng" },
    { code: "MACHINE_START_CHECK", label: "Bật máy, xét máy, đầu giờ", key: "machine_start_check_hours", deduction_code: "MACHINE_START_CHECK", deduction_name: "Bật máy, xét máy, đầu giờ" },
    { code: "CODE_CHANGE", label: "Chuyển mã", key: "code_change_hours", deduction_code: "CODE_CHANGE", deduction_name: "Chuyển mã" },
    { code: "MACHINE_ADJUST", label: "Chỉnh máy", key: "machine_adjust_hours", deduction_code: "MACHINE_ADJUST", deduction_name: "Chỉnh máy" },
    { code: "WAIT_MACHINE_ADJUST", label: "Chờ chỉnh máy", key: "wait_machine_adjust_hours", deduction_code: "WAIT_MACHINE_ADJUST", deduction_name: "Chờ chỉnh máy" },
    { code: "GRINDING_STONE", label: "Mài đá", key: "grinding_stone_hours", deduction_code: "GRINDING_STONE", deduction_name: "Mài đá" },
    { code: "MACHINE_MAINTENANCE", label: "Bảo dưỡng máy", key: "machine_maintenance_hours", deduction_code: "MACHINE_MAINTENANCE", deduction_name: "Bảo dưỡng máy" },
    { code: "NO_PLAN_STOP", label: "Ko có KHSX, Dừng máy ko HT", key: "no_plan_stop_hours", deduction_code: "NO_PLAN_STOP", deduction_name: "Ko có KHSX, Dừng máy ko HT" },
    { code: "WAIT_MATERIAL", label: "Chờ hàng, hết hàng", key: "wait_material_hours", deduction_code: "WAIT_MATERIAL", deduction_name: "Chờ hàng, hết hàng" },
    { code: "WEAK_AIR", label: "Khí yếu", key: "weak_air_hours", deduction_code: "WEAK_AIR", deduction_name: "Khí yếu" },
    { code: "BREAK", label: "Nghỉ giải lao", key: "break_hours", deduction_code: "BREAK", deduction_name: "Nghỉ giải lao" },
    { code: "SHIFT_HANDOVER", label: "Giao ca", key: "shift_handover_hours", deduction_code: "SHIFT_HANDOVER", deduction_name: "Giao ca" },
    { code: "SUPPORT", label: "Dừng máy đi hỗ trợ", key: "support_hours", deduction_code: "SUPPORT", deduction_name: "Dừng máy đi hỗ trợ" },
    { code: "FIVE_S", label: "5S, đổ bụi, xì bụi, lấy bụi", key: "five_s_hours", deduction_code: "FIVE_S", deduction_name: "5S, đổ bụi, xì bụi, lấy bụi" },
    { code: "TRAINING", label: "Học việc", key: "training_hours", deduction_code: "TRAINING", deduction_name: "Học việc" },
    { code: "DUST_CLEANING", label: "Thổi bụi, lấy bụi", key: "dust_cleaning_hours", deduction_code: "DUST_CLEANING", deduction_name: "Thổi bụi, lấy bụi" },
    { code: "MEASUREMENT_SUPPORT", label: "Đi đo kiểm soát", key: "measurement_support_hours", deduction_code: "MEASUREMENT_SUPPORT", deduction_name: "Đi đo kiểm soát" },
    { code: "LATE_EARLY", label: "Đi muộn/về sớm", key: "late_early_hours", deduction_code: "LATE_EARLY", deduction_name: "Đi muộn/về sớm" },
    { code: "DUST_COLLECTOR", label: "Tắt máy hút bụi", key: "dust_collector_hours", deduction_code: "DUST_COLLECTOR", deduction_name: "Tắt máy hút bụi" },
    { code: "POWER_LOSS", label: "Mất điện", key: "power_loss_hours", deduction_code: "POWER_LOSS", deduction_name: "Mất điện" },
  ],
  DO: [
    { code: "OUTPUT_SHORTAGE", label: "Thiếu sản lượng", key: "output_shortage_hours", deduction_code: "OUTPUT_SHORTAGE", deduction_name: "Thiếu sản lượng" },
    { code: "MACHINE_ADJUST", label: "Chỉnh máy", key: "machine_adjust_hours", deduction_code: "MACHINE_ADJUST", deduction_name: "Chỉnh máy" },
    { code: "POWER_LOSS", label: "Mất điện", key: "power_loss_hours", deduction_code: "POWER_LOSS", deduction_name: "Mất điện" },
    { code: "NO_PLAN", label: "Ko có KHSX", key: "no_plan_hours", deduction_code: "NO_PLAN", deduction_name: "Ko có KHSX" },
    { code: "WAIT_MACHINE_ADJUST", label: "Chờ chỉnh máy", key: "wait_machine_adjust_hours", deduction_code: "WAIT_MACHINE_ADJUST", deduction_name: "Chờ chỉnh máy" },
    { code: "BREAK", label: "Nghỉ giải lao", key: "break_hours", deduction_code: "BREAK", deduction_name: "Nghỉ giải lao" },
    { code: "SHIFT_HANDOVER", label: "Giao ca", key: "shift_handover_hours", deduction_code: "SHIFT_HANDOVER", deduction_name: "Giao ca" },
    { code: "SUPPORT", label: "Dừng máy đi hỗ trợ", key: "support_hours", deduction_code: "SUPPORT", deduction_name: "Dừng máy đi hỗ trợ" },
    { code: "FIVE_S", label: "5S/lấy bụi", key: "five_s_hours", deduction_code: "FIVE_S", deduction_name: "5S/lấy bụi" },
    { code: "OTHER_WORK", label: "Rải hàng, mài, cv khác", key: "other_work_hours", deduction_code: "OTHER_WORK", deduction_name: "Rải hàng, mài, cv khác" },
    { code: "DATA_SAVE", label: "Lưu DL", key: "data_save_hours", deduction_code: "DATA_SAVE", deduction_name: "Lưu DL" },
    { code: "START_CHECK", label: "KS DF, KS đầu giờ", key: "start_check_hours", deduction_code: "START_CHECK", deduction_name: "KS DF, KS đầu giờ" },
    { code: "DUST_BLOW", label: "Thổi bụi", key: "dust_blow_hours", deduction_code: "DUST_BLOW", deduction_name: "Thổi bụi" },
    { code: "OTHER", label: "Khác, đẩy hàng xuất", key: "other_hours", deduction_code: "OTHER", deduction_name: "Khác, đẩy hàng xuất" },
    { code: "LATE_EARLY", label: "Đi muộn về sớm", key: "late_early_hours", deduction_code: "LATE_EARLY", deduction_name: "Đi muộn về sớm" },
    { code: "STOCK_CHECK", label: "Kiểm kho", key: "stock_check_hours", deduction_code: "STOCK_CHECK", deduction_name: "Kiểm kho" },
    { code: "TRAINING", label: "Học việc, đào tạo", key: "training_hours", deduction_code: "TRAINING", deduction_name: "Học việc, đào tạo" },
  ],
  K2: [
    { code: "OUTPUT_SHORTAGE", label: "Thiếu sản lượng", key: "output_shortage_hours", deduction_code: "OUTPUT_SHORTAGE", deduction_name: "Thiếu sản lượng" },
    { code: "BREAK", label: "Nghỉ giải lao", key: "break_hours", deduction_code: "BREAK", deduction_name: "Nghỉ giải lao" },
    { code: "FIVE_S", label: "5S", key: "five_s_hours", deduction_code: "FIVE_S", deduction_name: "5S" },
    { code: "CODE_CHANGE", label: "Chuyển mã", key: "code_change_hours", deduction_code: "CODE_CHANGE", deduction_name: "Chuyển mã" },
    { code: "CLEANING", label: "Lau ố, lau gót chống", key: "cleaning_hours", deduction_code: "CLEANING", deduction_name: "Lau ố, lau gót chống" },
    { code: "ROLLING_MARK", label: "Lăn mốc", key: "rolling_mark_hours", deduction_code: "ROLLING_MARK", deduction_name: "Lăn mốc" },
    { code: "SUPPORT", label: "Hỗ trợ", key: "support_hours", deduction_code: "SUPPORT", deduction_name: "Hỗ trợ" },
    { code: "TRAY_CLEANING", label: "Lau khay, lọc khay", key: "tray_cleaning_hours", deduction_code: "TRAY_CLEANING", deduction_name: "Lau khay, lọc khay" },
    { code: "DUST_BLOW", label: "Quét hàng, thổi bụi", key: "dust_blow_hours", deduction_code: "DUST_BLOW", deduction_name: "Quét hàng, thổi bụi" },
    { code: "SHIFT_HANDOVER", label: "Giao ca", key: "shift_handover_hours", deduction_code: "SHIFT_HANDOVER", deduction_name: "Giao ca" },
    { code: "TRAINING", label: "Học kiểm, đào tạo", key: "training_hours", deduction_code: "TRAINING", deduction_name: "Học kiểm, đào tạo" },
    { code: "CHECK_WORK", label: "Check hàng", key: "check_work_hours", deduction_code: "CHECK_WORK", deduction_name: "Check hàng" },
    { code: "POWER_LOSS", label: "Xem MGH, mất điện", key: "power_loss_hours", deduction_code: "POWER_LOSS", deduction_name: "Xem MGH, mất điện" },
    { code: "MATERIAL_MOVE", label: "Lấy hàng và cất hàng", key: "material_move_hours", deduction_code: "MATERIAL_MOVE", deduction_name: "Lấy hàng và cất hàng" },
    { code: "LATE_EARLY", label: "Đi muộn về sớm", key: "late_early_hours", deduction_code: "LATE_EARLY", deduction_name: "Đi muộn về sớm" },
  ],
  SX3: [],
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
