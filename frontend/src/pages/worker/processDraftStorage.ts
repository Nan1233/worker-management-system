import { getStoredUser } from "../../utils/authStorage";
import { createEmptyMachineLine, getCurrentLocalDate } from "./processPageConfig";
import type { DeductionState, FormState, MachineLineState, NgKey, DeductionKey, OperationMode, OperationType } from "./processPageConfig";

export const PROCESS_DRAFT_SAVE_FAILED_EVENT = "ktc:process-draft-save-failed";

export type ProcessDraft = {
  version: 1 | 2 | 3;
  savedAt: number;
  process: string;
  ownerWorkerId?: number | null;
  ownerWorkerCode?: string | null;
  form: FormState;
  deductions: DeductionState;
  selectedDeduction: DeductionKey[];
  selectedNg: NgKey[];
  machineLines: MachineLineState[];
  machineCount: number;
  operationType: OperationType;
  operationMode: OperationMode;
  isCvkMode?: boolean;
  cutExecutionMode?: "AUTO" | "NON_AUTO";
  extraData: Record<string,string>;
};

const getCurrentWorkerIdentity = () => {
  const user = getStoredUser();
  const workerId = Number(user?.worker_id);
  const workerCode = String(user?.worker_code || "").trim();
  return {
    workerId: Number.isInteger(workerId) && workerId > 0 ? workerId : null,
    workerCode: workerCode || null,
  };
};

const encodeKeyPart = (value: string | number) => encodeURIComponent(String(value));

const keyFor = (process: string, workerId: number | null, workerCode: string | null) => {
  const identity = workerId != null
    ? `id-${workerId}`
    : workerCode
      ? `code-${encodeKeyPart(workerCode)}`
      : "anonymous";
  return `ktc:process-draft:v3:${identity}:${encodeKeyPart(process)}`;
};

const legacyKeyForV2 = (process: string, workerId: number | null, workerCode: string | null) => {
  const identity = workerId != null
    ? `id-${workerId}`
    : workerCode
      ? `code-${encodeKeyPart(workerCode)}`
      : "anonymous";
  return `ktc:process-draft:v2:${identity}:${encodeKeyPart(process)}`;
};

const legacyClearMarkerKeyForV2 = (process: string, workerId: number | null, workerCode: string | null) =>
  `${legacyKeyForV2(process, workerId, workerCode)}:clear-marker`;

const invalidateLegacyV2Draft = (process: string, workerId: number | null, workerCode: string | null) => {
  try {
    localStorage.removeItem(legacyKeyForV2(process, workerId, workerCode));
    localStorage.removeItem(legacyClearMarkerKeyForV2(process, workerId, workerCode));
  } catch { /* storage unavailable */ }
};

// Browser storage is finite. Store only changed fields instead of copying the
// full default machine-line schema into every draft. Restore merges defaults.
const compactMachineLine = (line: MachineLineState): Partial<MachineLineState> => {
  const defaults = createEmptyMachineLine();
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(line)) {
    const defaultValue = (defaults as unknown as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (value && typeof value === "object" && !Array.isArray(value) &&
        Object.keys(value).length === 0) continue;
    if (Object.is(value, defaultValue)) continue;
    result[key] = value;
  }
  return result as Partial<MachineLineState>;
};

const DRAFT_CLEAR_SUPPRESS_MS = 1200;
const clearMarkerKeyFor = (process: string, workerId: number | null, workerCode: string | null) =>
  `${keyFor(process, workerId, workerCode)}:clear-marker`;

const isAutosaveSuppressed = (process: string, workerId: number | null, workerCode: string | null) => {
  const markerKey = clearMarkerKeyFor(process, workerId, workerCode);
  const until = Number(localStorage.getItem(markerKey) || 0);
  if (!until) return false;
  if (until > Date.now()) return true;
  localStorage.removeItem(markerKey);
  return false;
};

const FORM_LABELS: Record<string, string> = {
  workerCode: "Mã công nhân",
  workerName: "Công nhân",
  trainingPercent: "Đào tạo",
  workDate: "Ngày sản xuất",
  shift: "Ca làm việc",
  productName: "Mã sản phẩm",
  machineNo: "Mã máy",
  standardOutput: "Định mức",
  actualOutput: "Sản lượng thực tế",
  totalTime: "Tổng thời gian",
  actualTime: "Thời gian thực tế",
  actualHours: "Giờ thực tế",
  actualMinutes: "Phút thực tế",
  deductionTime: "Thời gian trừ",
  ttOk: "TT OK",
  ttNg: "TT NG",
};

const humanizeKey = (key: string) =>
  FORM_LABELS[key]
  || key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());

const valueText = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  return String(value);
};

function buildDraftResumeMessage(draft: ProcessDraft): string {
  const f = draft.form || {};
  const lines: string[] = [
    "KTC – BÁO CÁO ĐANG LÀM DỞ",
    "",
    `Công đoạn: ${draft.process}`,
    `Lưu lần cuối: ${new Date(draft.savedAt).toLocaleString("vi-VN")}`,
    "",
    "THÔNG TIN BÁO CÁO",
  ];

  Object.entries(f).forEach(([key, value]) => {
    lines.push(`• ${humanizeKey(key)}: ${valueText(value)}`);
  });

  lines.push("", `Hình thức: ${draft.operationMode === "MACHINE" ? "Làm máy" : "Làm tay"}`);
  if (draft.operationType) {
    lines.push(`Loại gia công: ${draft.operationType === "CUT" ? "Cắt" : "Lồng"}`);
  }

  lines.push("", "THÔNG TIN MÁY / SẢN PHẨM");
  if (draft.machineLines?.length) {
    draft.machineLines.forEach((line: MachineLineState, index) => {
      lines.push(`Máy ${index + 1}:`);
      lines.push(`  • Mã máy: ${valueText(line.machineCode)}`);
      lines.push(`  • Mã sản phẩm: ${valueText(line.productCode)}`);
      lines.push(`  • Giờ chạy: ${valueText(line.hours)}`);
      lines.push(`  • Phút chạy: ${valueText(line.minutes)}`);
      lines.push(`  • OK: ${valueText(line.okQuantity)}`);
      lines.push(`  • NG: ${valueText(line.ngQuantity)}`);
      lines.push(`  • Định mức/giờ: ${valueText(line.standardOutputPerHour)}`);
      lines.push(`  • Thời gian định mức: ${valueText(line.standardTimeSeconds)}`);
      if (line.selectedDefects?.length) lines.push(`  • Lỗi NG đã chọn: ${line.selectedDefects.join(", ")}`);
      Object.entries(line.defects || {})
        .filter(([, value]) => value !== "" && value !== "0")
        .forEach(([key, value]) => lines.push(`  • NG ${key}: ${valueText(value)}`));
    });
  } else {
    lines.push("• Chưa có dữ liệu máy");
  }

  lines.push("", "TRỪ GIỜ");
  const deductions = Object.entries(draft.deductions || {}).filter(([, value]) => value !== "" && value !== null && value !== undefined && value !== "0");
  if (deductions.length) {
    deductions.forEach(([key, value]) => lines.push(`• ${humanizeKey(key)}: ${valueText(value)}`));
  } else {
    lines.push("• Không có");
  }

  lines.push("", "LỖI NG ĐÃ CHỌN");
  lines.push(draft.selectedNg?.length ? `• ${draft.selectedNg.join(", ")}` : "• Không có");

  lines.push("", "THÔNG TIN BỔ SUNG");
  const extra = Object.entries(draft.extraData || {}).filter(([, value]) => value !== "" && value !== null && value !== undefined);
  if (extra.length) {
    extra.forEach(([key, value]) => lines.push(`• ${humanizeKey(key)}: ${value}`));
  } else {
    lines.push("• Không có");
  }

  lines.push(
    "",
    "Bạn có muốn làm tiếp báo cáo này không?",
    "Chọn OK để khôi phục TOÀN BỘ dữ liệu trên.",
    "Chọn Hủy để bỏ báo cáo đang làm dở và nhập báo cáo mới.",
  );

  return lines.join("\n");
}

function normalizeDraftForResume(draft: ProcessDraft): ProcessDraft {
  const form = { ...(draft.form || {}) } as FormState;
  const sourceLines = Array.isArray(draft.machineLines) ? draft.machineLines : [];
  const lineCount = Math.max(1, Number(draft.machineCount) || 1, sourceLines.length);
  const machineLines = Array.from({ length: lineCount }, (_, index) => ({
    ...createEmptyMachineLine(),
    ...(sourceLines[index] || {}),
  }));

  const first = machineLines[0];
  if (form.machineNo || form.productName || form.actualHours || form.actualMinutes) {
    machineLines[0] = {
      ...first,
      machineCode: first.machineCode || form.machineNo || "",
      productCode: first.productCode || form.productName || "",
      hours: first.hours || form.actualHours || "",
      minutes: first.minutes || form.actualMinutes || "",
      standardOutputPerHour: first.standardOutputPerHour || Number(form.standardOutput || 0) || 0,
      okQuantity: first.okQuantity || form.ttOk || "",
      ngQuantity: first.ngQuantity || form.ttNg || "",
    };
  }

  const restoredFirst = machineLines[0];
  if (!form.machineNo && restoredFirst.machineCode) form.machineNo = restoredFirst.machineCode;
  if (!form.productName && restoredFirst.productCode) form.productName = restoredFirst.productCode;
  if (!form.actualHours && restoredFirst.hours) form.actualHours = restoredFirst.hours;
  if (!form.actualMinutes && restoredFirst.minutes) form.actualMinutes = restoredFirst.minutes;
  if (!form.ttOk && restoredFirst.okQuantity) form.ttOk = restoredFirst.okQuantity;
  if (!form.ttNg && restoredFirst.ngQuantity) form.ttNg = restoredFirst.ngQuantity;
  if ((!form.standardOutput || form.standardOutput === "0") && restoredFirst.standardOutputPerHour) {
    form.standardOutput = String(restoredFirst.standardOutputPerHour);
  }

  // IMPORTANT: do not infer MACHINE merely because machineLines contains data.
  // Lồng/Tay also uses the first machine-line object as the common product/time
  // storage model, so that old inference changed a saved MANUAL report into
  // Lồng/Máy after browser reload. v3 drafts already persist the authoritative
  // operationMode; preserve it exactly. Only fall back to MACHINE for malformed
  // legacy drafts that have no valid mode at all.
  const storedOperationMode = draft.operationMode;
  const operationMode: OperationMode = storedOperationMode === "MANUAL" || storedOperationMode === "MACHINE"
    ? storedOperationMode
    : machineLines.some((line) =>
        Boolean(line.machineCode || line.productCode || line.hours || line.minutes || line.okQuantity || line.ngQuantity)
      )
      ? "MACHINE"
      : "MANUAL";

  return {
    ...draft,
    form,
    machineLines,
    machineCount: lineCount,
    operationMode,
    isCvkMode: Boolean(draft.isCvkMode || String(form.workType || "").toUpperCase() === "CVK"),
    cutExecutionMode: draft.cutExecutionMode === "NON_AUTO" ? "NON_AUTO" : "AUTO",
    selectedDeduction: Array.isArray(draft.selectedDeduction) ? draft.selectedDeduction : [],
    selectedNg: Array.isArray(draft.selectedNg) ? draft.selectedNg : [],
    extraData: draft.extraData || {},
    deductions: draft.deductions || ({} as DeductionState),
  };
}

const isDefaultSameDayShiftDraft = (draft: ProcessDraft): boolean => {
  const draftDate = String(draft.form?.workDate || "").trim();
  const draftShift = String(draft.form?.shift || "").trim().toUpperCase();
  const today = getCurrentLocalDate();
  return draftDate === today && draftShift === "A";
};

export function loadProcessDraft(process: string): ProcessDraft | null {
  try {
    const { workerId, workerCode } = getCurrentWorkerIdentity();
    if (workerId == null && !workerCode) return null;

    invalidateLegacyV2Draft(process, workerId, workerCode);
    if (isAutosaveSuppressed(process, workerId, workerCode)) return null;

    const raw = localStorage.getItem(keyFor(process, workerId, workerCode));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as ProcessDraft;
    if (
      parsed?.version !== 3 ||
      parsed.process !== process ||
      !hasMeaningfulProcessDraft(parsed)
    ) return null;

    if (parsed.ownerWorkerId != null && workerId != null && Number(parsed.ownerWorkerId) !== workerId) return null;
    if (parsed.ownerWorkerCode && workerCode && String(parsed.ownerWorkerCode).trim() !== workerCode) return null;

    const value = normalizeDraftForResume(parsed);

    // DO work-in-progress should always resume automatically after refresh.
    if (String(process).toLowerCase() === "do" || isDefaultSameDayShiftDraft(value)) {
      return value;
    }

    const shouldResume = window.confirm(buildDraftResumeMessage(value));
    if (!shouldResume) {
      localStorage.removeItem(keyFor(process, workerId, workerCode));
      return null;
    }

    return value;
  } catch {
    return null;
  }
}

export function saveProcessDraft(draft: ProcessDraft): void {
  try {
    const { workerId, workerCode } = getCurrentWorkerIdentity();
    if (workerId == null && !workerCode) return;
    if (isAutosaveSuppressed(draft.process, workerId, workerCode)) return;

    const sourceLines = Array.isArray(draft.machineLines) ? draft.machineLines : [];
    const ownedDraft: ProcessDraft = {
      ...draft,
      version: 3,
      ownerWorkerId: workerId,
      ownerWorkerCode: workerCode,
      machineLines: sourceLines.map((line) => compactMachineLine(line) as MachineLineState),
      machineCount: Math.max(1, Number(draft.machineCount) || 1, sourceLines.length),
    };

    const firstMachineLine = ownedDraft.machineLines[0];
    if (firstMachineLine) {
      ownedDraft.form = {
        ...ownedDraft.form,
        machineNo: String(firstMachineLine.machineCode || ownedDraft.form.machineNo || ""),
        productName: String(firstMachineLine.productCode || ownedDraft.form.productName || ""),
      };
    }

    const storageKey = keyFor(draft.process, workerId, workerCode);
    const previous = localStorage.getItem(storageKey);
    if (previous !== null) {
      // Never overwrite a possibly recoverable draft when its JSON is damaged.
      const parsed = JSON.parse(previous) as ProcessDraft;
      if (parsed?.version !== 3 || parsed.process !== draft.process ||
          (parsed.ownerWorkerId != null && Number(parsed.ownerWorkerId) !== workerId) ||
          (parsed.ownerWorkerCode && String(parsed.ownerWorkerCode).trim() !== workerCode)) {
        throw new Error("Existing draft is invalid or has a different owner");
      }
    }
    const serialized = JSON.stringify(ownedDraft);
    localStorage.setItem(storageKey, serialized);
    if (localStorage.getItem(storageKey) !== serialized) {
      throw new Error("Draft write verification failed");
    }
  } catch (error) {
    // Do not log the draft itself: it may contain worker and production data.
    // Keep the previous draft intact and expose only the storage failure reason.
    const failureName = error instanceof Error ? error.name : "UnknownError";
    const failureMessage = error instanceof Error ? error.message : String(error);
    try {
      console.warn("[KTC draft] Autosave failed", {
        reason: failureName,
        message: failureMessage,
        process: draft.process,
      });
    } catch { /* logging must never block the warning event */ }
    // Autosave cannot throw inside a timer or pagehide. Notify the form once
    // instead of claiming an unsaved draft will survive a reload.
    try { window.dispatchEvent(new Event(PROCESS_DRAFT_SAVE_FAILED_EVENT)); } catch { /* unavailable */ }
  }
}

export function clearProcessDraft(process: string): void {
  try {
    const { workerId, workerCode } = getCurrentWorkerIdentity();
    if (workerId == null && !workerCode) return;
    localStorage.removeItem(keyFor(process, workerId, workerCode));
    invalidateLegacyV2Draft(process, workerId, workerCode);
    localStorage.setItem(
      clearMarkerKeyFor(process, workerId, workerCode),
      String(Date.now() + DRAFT_CLEAR_SUPPRESS_MS),
    );
  } catch { /* noop */ }
}

export function hasMeaningfulProcessDraft(draft: ProcessDraft): boolean {
  const f = draft.form || {};
  return Boolean(
    f.productName || f.machineNo || f.workType || draft.isCvkMode || f.ttOk || f.ttNg || f.totalTime || f.actualTime || f.actualHours || f.actualMinutes ||
    draft.machineLines?.some(l => l.machineCode || l.productCode || l.hours || l.minutes || l.okQuantity || l.ngQuantity) ||
    draft.selectedDeduction?.length || draft.selectedNg?.length ||
    Object.values(draft.extraData || {}).some(Boolean)
  );
}