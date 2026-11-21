import { useState } from "react";
import type { FormState, MachineLineState, OperationMode, OperationType } from "./processPageConfig";
import { createEmptyMachineLine, initialForm } from "./processPageConfig";
import { getInitialOperationMode, getProcessCapabilities } from "./processPageDomain";

type ProcessCapabilities = ReturnType<typeof getProcessCapabilities>;

/** One owner for editable report values, machine assignments and operation mode. */
export function useProcessReportFormState(capabilities: ProcessCapabilities) {
    const [form, setForm] = useState<FormState>(initialForm);
    const [operationType, setOperationType] = useState<OperationType>("CUT");
    const [isCvkMode, setIsCvkMode] = useState(false);
    const [cutExecutionMode, setCutExecutionMode] = useState<"AUTO" | "NON_AUTO">("AUTO");
    const [operationMode, setOperationMode] = useState<OperationMode>(() => getInitialOperationMode(capabilities));
    const [machineCount, setMachineCount] = useState(1);
    const [machineLines, setMachineLines] = useState<MachineLineState[]>([createEmptyMachineLine()]);
    const [extraData, setExtraData] = useState<Record<string, string>>({});
    return {
        form, setForm, operationType, setOperationType, isCvkMode, setIsCvkMode,
        cutExecutionMode, setCutExecutionMode, operationMode, setOperationMode,
        machineCount, setMachineCount, machineLines, setMachineLines, extraData, setExtraData,
    };
}
