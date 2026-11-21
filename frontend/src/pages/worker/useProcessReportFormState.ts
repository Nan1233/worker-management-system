import { useRef, useState } from "react";
import type { ProductionReport } from "../../types/production";
import type { FormState, MachineLineState, OperationMode, OperationType } from "./processPageConfig";
import { createEmptyMachineLine, initialForm } from "./processPageConfig";
import { getInitialOperationMode, getProcessCapabilities } from "./processPageDomain";
import { useProcessEntryState } from "./useProcessEntryState";

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
    const entryState = useProcessEntryState();
    // Keep submission idempotency, offline replay and draft lifecycle refs
    // together with the report whose edits they describe.
    const submitLockRef = useRef(false);
    const clientRequestIdRef = useRef<string | null>(null);
    const pendingSplitPayloadsRef = useRef<ProductionReport[]>([]);
    const duplicatePrimaryCompletedRef = useRef(false);
    const duplicateForceRequestIdRef = useRef<string | null>(null);
    const isRestoringDraftRef = useRef(false);
    const draftSaveTimerRef = useRef<number | null>(null);
    const resetVersionRef = useRef(0);
    return {
        ...entryState,
        submitLockRef, clientRequestIdRef, pendingSplitPayloadsRef,
        duplicatePrimaryCompletedRef, duplicateForceRequestIdRef,
        isRestoringDraftRef, draftSaveTimerRef, resetVersionRef,
        form, setForm, operationType, setOperationType, isCvkMode, setIsCvkMode,
        cutExecutionMode, setCutExecutionMode, operationMode, setOperationMode,
        machineCount, setMachineCount, machineLines, setMachineLines, extraData, setExtraData,
    };
}
