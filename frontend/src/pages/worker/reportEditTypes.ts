import type { ProductionDeduction, ProductionDefect, ProductionReport } from "../../types/production";

/** Legacy detail rows may contain aliases not present on current master-data rows. */
export type ReportEditDefect = Partial<ProductionDefect> & {
    defect_label?: string;
};

export type ReportEditDeduction = Partial<ProductionDeduction> & {
    deduction_label?: string;
    name?: string;
    label?: string;
    minutes?: number | string;
    deduction_minutes?: number | string;
    deduction_hours?: number | string;
    duration_hours?: number | string;
};

export type ReportEditMachineLine = Partial<Omit<NonNullable<ProductionReport["machine_lines"]>[number], "deductions" | "defects">> & {
    grinding_machine_no?: string;
    deductions_json?: string | ReportEditDeduction[];
    deductions?: ReportEditDeduction[];
    defects?: ReportEditDefect[];
};

/** The edit API carries saved legacy aliases in addition to the write contract. */
export type ReportEditRecord = Omit<ProductionReport, "machine_lines" | "defects" | "deductions"> & {
    machine_lines?: ReportEditMachineLine[];
    machineLines?: ReportEditMachineLine[];
    defects?: ReportEditDefect[];
    defect_items?: ReportEditDefect[];
    worker_defects?: ReportEditDefect[];
    deductions?: ReportEditDeduction[];
    deduction_items?: ReportEditDeduction[];
    operation?: string;
    training_percent_snapshot?: number | string | null;
    adjustment_count?: number | string | null;
    execution_method?: string;
    __edit_machine_lines?: ReportEditMachineLine[];
};
