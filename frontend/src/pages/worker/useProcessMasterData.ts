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

const normalizeMasterLabel = (value: unknown): string => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/đ/gi, "d")
  .toLowerCase()
  .replace(/[^a-z0-9]/g, "");

const MAI_ALLOWED_DEDUCTION_NAMES = new Set([
  "Bật máy, xét máy, đầu giờ",
  "Chuyển mã",
  "Chỉnh máy",
  "Chờ chỉnh máy",
  "Mài đá",
  "Ko có KHSX, Dừng máy ko HT",
  "Chờ hàng, hết hàng",
  "Nghỉ giải lao",
  "Dừng máy đi hỗ trợ",
  "5s, đổ bụi,xì bụi,lấy bụi",
].map(normalizeMasterLabel));

const MAI_DISPLAY_LABELS = new Map<string, string>([
  ["chohanghethang", "Chờ hàng, hết hàng"],
  ["kqddao", "KQD ĐẢO"],
  ["ppcmmatdien", "PPCM Mất điện"],
  ["thieulancscsh", "Thiếu - lẫn cs CSH"],
]);

const MAI_ALLOWED_DEFECT_NAMES = new Set([
  "KQD ĐẢO",
  "Xô cs",
  "PPCM Mất điện",
  "Hàng rơi",
  "K- coleet",
  "Thiếu - lẫn cs CSH",
  "Lỗi cao su",
].map(normalizeMasterLabel));

function filterMaiMasterOptions(
  options: WorkerMasterOption[],
  processCode: string,
  processId: number,
  allowedNames: Set<string>,
  preferredCodePrefix: string,
): WorkerMasterOption[] {
  const isMai = String(processCode || "").trim().toUpperCase() === "MAI" || Number(processId) === 2;
  if (!isMai) return options;

  const unique = new Map<string, WorkerMasterOption>();
  const priority = (option: WorkerMasterOption): number => {
    const code = String(option.code || "").trim().toUpperCase();
    if (code.startsWith(preferredCodePrefix)) return 0;
    if (code.startsWith("KTC_")) return 2;
    return 1;
  };

  for (const option of options) {
    const normalizedLabel = normalizeMasterLabel(option.label);
    if (!allowedNames.has(normalizedLabel)) continue;
    const current = unique.get(normalizedLabel);
    if (!current || priority(option) < priority(current)) {
      unique.set(normalizedLabel, {
        ...option,
        label: MAI_DISPLAY_LABELS.get(normalizedLabel) || option.label,
      });
    }
  }

  return Array.from(unique.values());
}

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
        setActiveNgOptions(filterMaiMasterOptions(normalizeDefectOptions(defects.value, resolvedProcessId), processCode, resolvedProcessId, MAI_ALLOWED_DEFECT_NAMES, "MAI_NG_"));
      } else {
        setActiveNgOptions([]);
      }

      if (deductions.status === "fulfilled") {
        setActiveDeductionOptions(
          filterMaiMasterOptions(normalizeDeductionOptions(deductions.value, resolvedProcessId), processCode, resolvedProcessId, MAI_ALLOWED_DEDUCTION_NAMES, "MAI_TTH_"),
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