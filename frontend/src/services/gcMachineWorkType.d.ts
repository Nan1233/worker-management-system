export type GcWorkType = "CUT" | "LONG";

export interface GcMachineLike {
  machine_code?: string | null;
  gc_work_type?: string | null;
}

export interface GcMachineOptionLike {
  value: string;
  workType?: string | null;
}

export function normalizeGcWorkType(value: unknown): GcWorkType | null;
export function gcWorkTypeOfMachine(machines: readonly GcMachineLike[] | null | undefined, machineCode: unknown): GcWorkType | null;
export function scopeGcMachineOptions<T extends GcMachineOptionLike>(options: readonly T[], workType: GcWorkType | null | undefined): T[];
