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
  key?: string | null;
};

const clean = (value: unknown): string => String(value ?? "").trim();

const normalizeRows = (rows: RawOption[], processId?: number): WorkerMasterOption[] => rows
  .map((row, index) => {
    const id = Number(row.id ?? row.defect_type_id ?? 0) || undefined;
    const code = clean(row.defect_code ?? row.code);
    const configured = row as RawOption & { key?: string | null; label?: string | null };
    const name = clean(row.defect_name ?? row.label ?? row.name);
    // Keep an explicitly configured key when present; otherwise derive a stable
    // identifier from the DB code/ID rather than inventing a process code.
    const canonicalCode = code ? code.toUpperCase() : id ? `defect:${id}` : `defect-row:${processId ?? 0}:${index + 1}`;
    const key = clean(configured?.key) || canonicalCode;
    const label = name || clean(configured?.label) || canonicalCode;
    return {
      id,
      process_id: processId,
      defect_type_id: id,
      code,
      label,
      key,
      defect_code: code,
      defect_name: name,
    };
  })
  .filter((option) => Boolean(option.id || option.code || option.label));

/** DB master data is the only source of selectable NG options. */
export function normalizeDefectOptions(rows: RawOption[] | null | undefined, processId?: number): WorkerMasterOption[] {
  const scopedRows = (rows ?? []).filter((row) => {
    if (processId == null) return true;
    const rowProcessId = Number(row.process_id ?? row.processId ?? 0);
    return !rowProcessId || rowProcessId === Number(processId);
  });
  return normalizeRows(scopedRows, processId);
}

export function normalizeDeductionOptions(rows: RawOption[] | null | undefined, processId?: number): WorkerMasterOption[] {
  const scopedRows = (rows ?? []).filter((row) => {
    if (processId == null) return true;
    const rowProcessId = Number(row.process_id ?? row.processId ?? 0);
    return !rowProcessId || rowProcessId === Number(processId);
  });

  return scopedRows
    .map((row, index) => {
      const id = Number(row.id ?? row.deduction_type_id ?? 0) || undefined;
      const code = clean(row.deduction_code ?? row.code);
      const name = clean(row.deduction_name ?? row.label ?? row.name);
      const key = id
        ? `deduction:${id}`
        : code
          ? `code:${code.toUpperCase()}`
          : `deduction-row:${processId ?? 0}:${index + 1}`;
      return {
        id,
        process_id: processId,
        deduction_type_id: id,
        code,
        label: name || code || `Trừ giờ ${index + 1}`,
        key,
        deduction_code: code,
        deduction_name: name,
      };
    });
}
