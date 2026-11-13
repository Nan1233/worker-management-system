import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type {
    DeductionKey, DeductionState, FormState, MachineLineState, NgKey,
    OperationMode, OperationType,
} from "./processPageConfig";
import type { ProcessDraft } from "./processDraftStorage";
import {
    hasMeaningfulProcessDraft,
    saveProcessDraftAsync,
} from "./processDraftStorage";

type Params = {
    process: string;
    processCode: string;
    form: FormState;
    deductions: DeductionState;
    selectedDeduction: DeductionKey[];
    selectedNg: NgKey[];
    machineLines: MachineLineState[];
    machineCount: number;
    operationType: OperationType;
    operationMode: OperationMode;
    isCvkMode: boolean;
    cutExecutionMode: ProcessDraft["cutExecutionMode"];
    extraData: Record<string, string>;
    loadingWorker: boolean;
    loadingMasterData: boolean;
    submitting: boolean;
    isRestoringDraftRef: MutableRefObject<boolean>;
    draftSaveTimerRef: MutableRefObject<number | null>;
    resetVersionRef: MutableRefObject<number>;
};

/** Keep draft snapshots and their persistence lifecycle together. */
export function useProcessDraftAutosave({
    process, processCode, form, deductions, selectedDeduction, selectedNg,
    machineLines, machineCount, operationType, operationMode, isCvkMode,
    cutExecutionMode, extraData, loadingWorker, loadingMasterData, submitting,
    isRestoringDraftRef, resetVersionRef,
}: Params): void {
    // DO persists immediately on pagehide, including edits inside the debounce window.
    const doDraftSnapshotRef = useRef<ProcessDraft | null>(null);
    useEffect(() => {
        doDraftSnapshotRef.current = {
            version: 3, savedAt: Date.now(), process, form, deductions,
            selectedDeduction, selectedNg, machineLines, machineCount,
            operationType, operationMode, isCvkMode, cutExecutionMode, extraData,
        };
    }, [
        process, form, deductions, selectedDeduction, selectedNg, machineLines,
        machineCount, operationType, operationMode, isCvkMode, cutExecutionMode, extraData,
    ]);
    useEffect(() => {
        if (processCode !== "DO") return;
        const persistOnLeave = () => {
            if (submitting || isRestoringDraftRef.current) return;
            const draft = doDraftSnapshotRef.current;
            if (draft && hasMeaningfulProcessDraft(draft)) void saveProcessDraftAsync(draft);
        };
        window.addEventListener("pagehide", persistOnLeave);
        return () => window.removeEventListener("pagehide", persistOnLeave);
    }, [processCode, submitting, isRestoringDraftRef]);

    useEffect(() => {
        if (loadingWorker || loadingMasterData || submitting || isRestoringDraftRef.current) return;

        const resetVersion = resetVersionRef.current;
        const snapshot = {
            version: 1 as const,
            savedAt: Date.now(),
            process,
            form,
            deductions,
            selectedDeduction,
            selectedNg,
            machineLines,
            machineCount,
            operationType,
            operationMode,
            isCvkMode,
            cutExecutionMode,
            extraData,
        };

        // Persist immediately after each committed form change. A 700ms debounce
        // could lose the last edits on reload, tab close, or navigation.
        if (resetVersionRef.current === resetVersion && hasMeaningfulProcessDraft(snapshot)) {
            void saveProcessDraftAsync(snapshot);
        }
        // Never delete a saved draft merely because the initial form is empty.
        // Only explicit reset or confirmed submission may clear it.
    }, [
        process, form, deductions, selectedDeduction, selectedNg, machineLines,
        machineCount, operationType, operationMode, isCvkMode, cutExecutionMode,
        extraData, loadingWorker, loadingMasterData, submitting,
        isRestoringDraftRef, resetVersionRef,
    ]);
}
