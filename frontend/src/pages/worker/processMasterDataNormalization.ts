import { allNgOptions, deductionOptions } from "./processPageConfig";

export type WorkerMasterOption = {
  id?: number;
  code: string;
  label: string;
  key: string;
  defect_type_id?: number;
  deduction_type_id?: number;
  defect_code?: string;
  defect_name?: string;
  deduction_code?: string;
  deduction_name?: string;
};

type RawOption = {
  id?: number | string | null;
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

export function normalizeDefectOptions(rows: RawOption[] | null | undefined): WorkerMasterOption[] {
  return (rows ?? [])
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
        ...row,
        id,
        defect_type_id: id,
        code: canonicalCode,
        label,
        key,
        defect_code: canonicalCode,
        defect_name: label,
      };
    })
    .filter((option) => Boolean(option.key));
}

export function normalizeDeductionOptions(rows: RawOption[] | null | undefined): WorkerMasterOption[] {
  return (rows ?? [])
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
        ...row,
        id,
        deduction_type_id: id,
        code: canonicalCode,
        label,
        key,
        deduction_code: canonicalCode,
        deduction_name: label,
      };
    })
    .filter((option) => Boolean(option.key));
}
