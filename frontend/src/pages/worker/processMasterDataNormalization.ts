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

const normalizeRows = (rows: RawOption[], processId?: number): WorkerMasterOption[] => rows
  .map((row, index) => {
    const id = Number(row.id ?? row.defect_type_id ?? 0) || undefined;
    const code = clean(row.defect_code ?? row.code);
    const name = clean(row.defect_name ?? row.label ?? row.name);
    const configured = allNgOptions.find((option) => same(option.code, code) || same(option.label, name));
    const canonicalCode = code || clean(configured?.code) || `DEFECT_${processId ?? 0}_${index + 1}`;
    const key = clean(configured?.key) || canonicalCode || `defect_${id ?? index + 1}`;
    const label = name || clean(configured?.label) || canonicalCode || `Lỗi NG ${index + 1}`;
    return { id, process_id: processId, defect_type_id: id, code: canonicalCode, label, key, defect_code: canonicalCode, defect_name: label };
  })
  .filter((option) => Boolean(option.key));

function mergeOptions(base: WorkerMasterOption[], extra: WorkerMasterOption[]): WorkerMasterOption[] {
  const result = [...base];
  for (const option of extra) {
    const exists = result.some((item) =>
      (option.defect_type_id && item.defect_type_id === option.defect_type_id) ||
      (option.deduction_type_id && item.deduction_type_id === option.deduction_type_id) ||
      (option.defect_code && item.defect_code && same(option.defect_code, item.defect_code)) ||
      (option.deduction_code && item.deduction_code && same(option.deduction_code, item.deduction_code)) ||
      same(option.label, item.label),
    );
    if (!exists) result.push(option);
  }
  return result;
}

/**
 * Defect types are a DB master-data contract. Never manufacture defect IDs or
 * codes on the worker client: a generated value such as CUT_04 can be displayed
 * by an old fallback list but cannot be accepted by the backend unless that exact
 * master row exists for the selected process.
 */
export function normalizeDefectOptions(rows: RawOption[] | null | undefined, processId?: number): WorkerMasterOption[] {
  const scopedRows = (rows ?? []).filter((row) => {
    if (processId == null) return true;
    const rowProcessId = Number(row.process_id ?? row.processId ?? 0);
    return !rowProcessId || rowProcessId === Number(processId);
  });

  // DB master data is the only source of selectable NG options. The previous
  // frontend fallback arrays could create synthetic codes such as CUT_04; those
  // codes then reached /production-temp and were correctly rejected by the
  // backend. Returning only canonical DB rows prevents that mismatch entirely.
  return normalizeRows(scopedRows, processId);
}

export function normalizeDeductionOptions(rows: RawOption[] | null | undefined, processId?: number): WorkerMasterOption[] {
  const scopedRows = (rows ?? []).filter((row) => {
    if (processId == null) return true;
    const rowProcessId = Number(row.process_id ?? row.processId ?? 0);
    return !rowProcessId || rowProcessId === Number(processId);
  });

  const dbOptions = scopedRows
    .map((row, index) => {
      const id = Number(row.id ?? row.deduction_type_id ?? 0) || undefined;
      const code = clean(row.deduction_code ?? row.code);
      const name = clean(row.deduction_name ?? row.label ?? row.name);
      const configured = deductionOptions.find((option) => same(option.label, name)) ?? deductionOptions.find((option) => same(option.key, code));
      const canonicalCode = code || clean(configured?.key);
      const key = clean(configured?.key) || canonicalCode || `deduction_${id ?? index + 1}`;
      const label = name || clean(configured?.label) || canonicalCode || `Trừ giờ ${index + 1}`;
      return { id, process_id: processId, deduction_type_id: id, code: canonicalCode, label, key, deduction_code: canonicalCode, deduction_name: label };
    })
    .filter((option) => Boolean(option.key));

  const configuredOptions: WorkerMasterOption[] = deductionOptions.map((option) => ({
    code: option.key,
    label: option.label,
    key: option.key,
    process_id: processId,
    deduction_code: option.key,
    deduction_name: option.label,
  }));

  return mergeOptions(configuredOptions, dbOptions);
}