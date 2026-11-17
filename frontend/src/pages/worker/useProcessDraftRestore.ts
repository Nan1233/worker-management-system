import { useLayoutEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
    createEmptyMachineLine,
    type DeductionKey,
    type DeductionState,
    type FormState,
    type MachineLineState,
    type NgKey,
    type OperationMode,
    type OperationType,
} from "./processPageConfig";
import { loadProcessDraftAsync } from "./processDraftStorage";

type Setter<T> = Dispatch<SetStateAction<T>>;
type Params = {
    process: string;
    isRestoringDraftRef: MutableRefObject<boolean>;
    setForm: Setter<FormState>;
    setDeductions: Setter<DeductionState>;
    setSelectedDeduction: Setter<DeductionKey[]>;
    setSelectedNg: Setter<NgKey[]>;
    setMachineLines: Setter<MachineLineState[]>;
    setMachineCount: Setter<number>;
    setOperationType: Setter<OperationType>;
    setIsCvkMode: Setter<boolean>;
    setCutExecutionMode: Setter<"AUTO" | "NON_AUTO">;
    setOperationMode: Setter<OperationMode>;
    setExtraData: Setter<Record<string, string>>;
};

/** Restore a process draft while preserving worker identity from the current session. */
export function useProcessDraftRestore({
    process, isRestoringDraftRef, setForm, setDeductions,
    setSelectedDeduction, setSelectedNg, setMachineLines, setMachineCount,
    setOperationType, setIsCvkMode, setCutExecutionMode, setOperationMode,
    setExtraData,
}: Params): void {
    useLayoutEffect(() => {
        let cancelled = false;
        isRestoringDraftRef.current = true;
        void loadProcessDraftAsync(process).then((draft) => {
            if (cancelled) return;
            if (!draft) {
                isRestoringDraftRef.current = false;
                return;
            }

            // Preserve identity fields loaded from the current worker profile.
            setForm((current) => ({
                ...current,
                ...draft.form,
                workerCode: current.workerCode,
                workerName: current.workerName,
                trainingPercent: current.trainingPercent,
            }));
            setDeductions(draft.deductions);
            setSelectedDeduction(draft.selectedDeduction as DeductionKey[]);
            setSelectedNg(draft.selectedNg as NgKey[]);
            setMachineLines(draft.machineLines.length ? draft.machineLines : [createEmptyMachineLine()]);
            setMachineCount(Math.max(1, draft.machineCount));
            setOperationType(draft.operationType);
            setIsCvkMode(Boolean(draft.isCvkMode || ["CVK", "XUATNHAP", "KTCD", "TAIPP"].includes(
                String(draft.form?.workType || "")
                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                    .toUpperCase().replace(/[^A-Z0-9]/g, ""),
            )));
            setCutExecutionMode(draft.cutExecutionMode === "NON_AUTO" ? "NON_AUTO" : "AUTO");
            setOperationMode(draft.operationMode);
            setExtraData(draft.extraData || {});

            window.setTimeout(() => {
                if (!cancelled) isRestoringDraftRef.current = false;
            }, 0);
        }).catch(() => {
            if (!cancelled) isRestoringDraftRef.current = false;
        });
        return () => { cancelled = true; };
        // The setters and ref are stable; only a process change should reload a draft.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [process]);
}
