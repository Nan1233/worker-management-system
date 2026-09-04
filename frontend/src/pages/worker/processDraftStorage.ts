import { getStoredUser } from "../../utils/authStorage";
import type { DeductionState, FormState, MachineLineState, NgKey, DeductionKey, OperationMode, OperationType } from "./processPageConfig";

export type ProcessDraft = {
  version: 1 | 2;
  savedAt: number;
  process: string;
  /** Identity of the worker who owns this local draft. */
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
  extraData: Record<string,string>;
};

/**
 * Drafts are private to the currently authenticated worker.
 * The old implementation keyed only by process (`ktc:process-draft:${process}`),
 * which allowed worker B to restore worker A's unfinished report on the same device.
 */
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
  return `ktc:process-draft:v2:${identity}:${encodeKeyPart(process)}`;
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
    if (value !== "" && value !== null && value !== undefined) {
      lines.push(`• ${humanizeKey(key)}: ${valueText(value)}`);
    }
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
      const defects = Object.entries(line.defects || {}).filter(([, value]) => value !== "" && value !== "0");
      defects.forEach(([key, value]) => lines.push(`  • NG ${key}: ${valueText(value)}`));
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

export function loadProcessDraft(process: string): ProcessDraft | null {
  try {
    const { workerId, workerCode } = getCurrentWorkerIdentity();
    // No authenticated worker => never restore a worker draft.
    if (workerId == null && !workerCode) return null;

    const raw = localStorage.getItem(keyFor(process, workerId, workerCode));
    if (!raw) return null;

    const value = JSON.parse(raw) as ProcessDraft;
    if (
      value?.version !== 2 ||
      value.process !== process ||
      !hasMeaningfulProcessDraft(value)
    ) return null;

    // Defense in depth: verify the draft owner against the current auth user.
    if (value.ownerWorkerId != null && workerId != null && Number(value.ownerWorkerId) !== workerId) return null;
    if (value.ownerWorkerCode && workerCode && String(value.ownerWorkerCode).trim() !== workerCode) return null;

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
    // Never persist an unscoped draft. This prevents accidental cross-user data.
    if (workerId == null && !workerCode) return;

    const ownedDraft: ProcessDraft = {
      ...draft,
      version: 2,
      ownerWorkerId: workerId,
      ownerWorkerCode: workerCode,
    };
    localStorage.setItem(keyFor(draft.process, workerId, workerCode), JSON.stringify(ownedDraft));
  } catch { /* storage unavailable */ }
}

export function clearProcessDraft(process: string): void {
  try {
    const { workerId, workerCode } = getCurrentWorkerIdentity();
    if (workerId == null && !workerCode) return;
    localStorage.removeItem(keyFor(process, workerId, workerCode));
  } catch { /* noop */ }
}

export function hasMeaningfulProcessDraft(draft: ProcessDraft): boolean {
  const f = draft.form || {};
  return Boolean(
    f.productName || f.machineNo || f.ttOk || f.ttNg || f.totalTime || f.actualTime ||
    draft.machineLines.some(l => l.machineCode || l.productCode || l.okQuantity || l.ngQuantity) ||
    draft.selectedDeduction.length || draft.selectedNg.length ||
    Object.values(draft.extraData || {}).some(Boolean)
  );
}
