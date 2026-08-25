import { allNgOptions, deductionOptions } from "./processPageConfig";

export type WorkerMasterOption = {
  id?: number;
  code: string;
  label: string;
  key: string;
  process_id?: number;
  defect_type_id?: number;
  deduction_type_id?: number;
  defect_code?: string;
  defect_name?: string;
  deduction_code?: string;
  deduction_name?: string;
};

type RawOption = {
  id?: number | string | null;
  process_id?: number | string | null;
  processId?: number | string | null;
  defect_type_id?: number | string | null;
  defect_code?: string | null;
  defect_name?: string | null;
  deduction_type_id?: number | string | null;
  deduction_code?: string | null;
  deduction_name?: string | null;
  code?: string | null;
  label?: string | null;
  name?: string | null;
};

const clean = (value: unknown): string => String(value ?? "").trim();

const same = (a: unknown, b: unknown): boolean => {
  const left = clean(a).toUpperCase();
  const right = clean(b).toUpperCase();
  return Boolean(left && right && left === right);
};

/**
 * Master lỗi luôn thuộc về một công đoạn.
 * Nếu API trả process_id/processId thì chỉ nhận đúng process đang mở.
 * API cũ có thể không trả trường này vì đã filter theo process ở backend,
 * nên trong trường hợp đó giữ nguyên toàn bộ rows đã được API scope sẵn.
 */
export function normalizeDefectOptions(
  rows: RawOption[] | null | undefined,
  processId?: number,
): WorkerMasterOption[] {
  return (rows ?? [])
    .filter((row) => {
      if (processId == null) return true;
      const rowProcessId = Number(row.process_id ?? row.processId ?? 0);
      return !rowProcessId || rowProcessId === Number(processId);
    })
    .map((row, index) => {
      const id = Number(row.id ?? row.defect_type_id ?? 0) || undefined;
      const code = clean(row.defect_code ?? row.code);
      const name = clean(row.defect_name ?? row.label ?? row.name);
      const configured = allNgOptions.find(
        (option) => same(option.code, code) || same(option.label, name),
      );
      const canonicalCode = code || clean(configured?.code);
      const key = clean(configured?.key) || canonicalCode || `defect_${id ?? index + 1}`;
      const label = name || clean(configured?.label) || canonicalCode || `Lỗi NG ${index + 1}`;

      return {
        id,
        process_id: processId,
        defect_type_id: id,
        code: canonicalCode,
        label,
        key,
        defect_code: canonicalCode,
        defect_name: label,
        ...(row.deduction_type_id != null
          ? { deduction_type_id: Number(row.deduction_type_id) || undefined }
          : {}),
        ...(row.deduction_code != null
          ? { deduction_code: clean(row.deduction_code) || undefined }
          : {}),
        ...(row.deduction_name != null
          ? { deduction_name: clean(row.deduction_name) || undefined }
          : {}),
      };
    })
    .filter((option) => Boolean(option.key));
}

/**
 * Master trừ giờ cũng thuộc về một công đoạn.
 * Không cho một loại trừ giờ của công đoạn khác lọt vào selector hiện tại.
 */
export function normalizeDeductionOptions(
  rows: RawOption[] | null | undefined,
  processId?: number,
): WorkerMasterOption[] {
  return (rows ?? [])
    .filter((row) => {
      if (processId == null) return true;
      const rowProcessId = Number(row.process_id ?? row.processId ?? 0);
      return !rowProcessId || rowProcessId === Number(processId);
    })
    .map((row, index) => {
      const id = Number(row.id ?? row.deduction_type_id ?? 0) || undefined;
      const code = clean(row.deduction_code ?? row.code);
      const name = clean(row.deduction_name ?? row.label ?? row.name);
      const configured = deductionOptions.find(
        (option) => same(option.label, name),
      ) ?? deductionOptions.find(
        (option) => same(option.key, code),
      );
      const canonicalCode = code || clean(configured?.key);
      const key = clean(configured?.key) || canonicalCode || `deduction_${id ?? index + 1}`;
      const label = name || clean(configured?.label) || canonicalCode || `Trừ giờ ${index + 1}`;

      return {
        id,
        process_id: processId,
        deduction_type_id: id,
        code: canonicalCode,
        label,
        key,
        deduction_code: canonicalCode,
        deduction_name: label,
        ...(row.defect_type_id != null
          ? { defect_type_id: Number(row.defect_type_id) || undefined }
          : {}),
        ...(row.defect_code != null
          ? { defect_code: clean(row.defect_code) || undefined }
          : {}),
        ...(row.defect_name != null
          ? { defect_name: clean(row.defect_name) || undefined }
          : {}),
      };
    })
    .filter((option) => Boolean(option.key));
}
