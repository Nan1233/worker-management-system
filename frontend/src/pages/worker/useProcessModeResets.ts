import { useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { FormState, MachineLineState, OperationMode, OperationType } from "./processPageConfig";
import { createEmptyMachineLine } from "./processPageConfig";
import { getInitialOperationMode, getProcessCapabilities } from "./processPageDomain";

type Params = {
    process: string;
    processCode: string;
    isCutLongProcess: boolean;
    isInspectionProcess: boolean;
    operationType: OperationType;
    operationMode: OperationMode;
    usesSingleMachine: boolean;
    isRestoringDraftRef: MutableRefObject<boolean>;
    setForm: Dispatch<SetStateAction<FormState>>;
    setMachineLines: Dispatch<SetStateAction<MachineLineState[]>>;
    setMachineCount: Dispatch<SetStateAction<number>>;
    setExtraData: Dispatch<SetStateAction<Record<string, string>>>;
    setOperationMode: Dispatch<SetStateAction<OperationMode>>;
};

/** Preserve form clearing rules when changing process, operation type or machine mode. */
export function useProcessModeResets({
    process, processCode, isCutLongProcess, isInspectionProcess,
    operationType, operationMode, usesSingleMachine, isRestoringDraftRef,
    setForm, setMachineLines, setMachineCount, setExtraData, setOperationMode,
}: Params): void {
    useEffect(() => {
        if (isRestoringDraftRef.current) return;
        if (!isCutLongProcess) return;
        setForm((current) => current.productName ? { ...current, productName: "", standardOutput: "" } : current);
        setMachineLines((current) => current.map((line) => line.productCode
            ? { ...line, productCode: "", standardOutputPerHour: 0, standardTimeSeconds: null, standardSource: null, standardError: "" }
            : line));
    }, [operationType, isCutLongProcess, isRestoringDraftRef, setForm, setMachineLines]);

    useEffect(() => {
        if (isRestoringDraftRef.current) return;
        if (!isCutLongProcess && !isInspectionProcess) return;
        setForm((current) => ({ ...current, productName: "", standardOutput: "", machineNo: "" }));
        setMachineLines([createEmptyMachineLine()]);
        setMachineCount(1);
    }, [operationMode, isCutLongProcess, isInspectionProcess, isRestoringDraftRef, setForm, setMachineLines, setMachineCount]);

    useEffect(() => {
        if (isRestoringDraftRef.current) return;
        setExtraData({});
        setMachineLines([createEmptyMachineLine()]);
        setMachineCount(1);
        setOperationMode(
            getInitialOperationMode(getProcessCapabilities(processCode))
        );
    }, [process, processCode, isRestoringDraftRef, setExtraData, setMachineLines, setMachineCount, setOperationMode]);

    useEffect(() => {
        if (!usesSingleMachine) {
            setForm((current) => current.machineNo ? { ...current, machineNo: "" } : current);
        }
    }, [usesSingleMachine, setForm]);


}
