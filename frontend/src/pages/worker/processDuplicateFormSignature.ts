import type {
    DeductionKey, DeductionState, FormState, MachineLineState,
    NgKey, OperationMode, OperationType,
} from "./processPageConfig";

export type DuplicateFormSignatureInput = {
    processId: number;
    process: string;
    form: FormState;
    extraData: Record<string, string>;
    operationType: OperationType;
    isCvkMode: boolean;
    cutExecutionMode: "AUTO" | "NON_AUTO";
    operationMode: OperationMode;
    machineLines: MachineLineState[];
    machineCount: number;
    deductions: DeductionState;
    selectedDeduction: DeductionKey[];
    selectedNg: NgKey[];
};

/** Include every editable input that can affect a duplicate confirmation. */
export function createDuplicateFormSignature(input: DuplicateFormSignatureInput): string {
    return JSON.stringify(input);
}
