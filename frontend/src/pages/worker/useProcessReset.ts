import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ProductionReport } from "../../types/production";
import type { ToastContextValue } from "../../components/feedback/toastContext";
import type {
    FormState, MachineLineState, DeductionState, DeductionKey, NgKey,
    OperationMode, OperationType,
} from "./processPageConfig";
import { createEmptyMachineLine, getCurrentLocalDate, initialDeduction } from "./processPageConfig";
import { hasProcessReportInput, resetProcessFormRetainingWorker } from "./processFormResetGuard";
import { clearProcessDraftAsync } from "./processDraftStorage";

type Params = {
    process: string;
    showToast: ToastContextValue["showToast"];
    submitting: boolean;
    form: FormState;
    selectedNg: NgKey[];
    selectedDeduction: DeductionKey[];
    machineLines: MachineLineState[];
    submitLockRef: MutableRefObject<boolean>;
    clientRequestIdRef: MutableRefObject<string | null>;
    pendingSplitPayloadsRef: MutableRefObject<ProductionReport[]>;
    duplicatePrimaryCompletedRef: MutableRefObject<boolean>;
    duplicateForceRequestIdRef: MutableRefObject<string | null>;
    isRestoringDraftRef: MutableRefObject<boolean>;
    draftSaveTimerRef: MutableRefObject<number | null>;
    resetVersionRef: MutableRefObject<number>;
    setForm: Dispatch<SetStateAction<FormState>>;
    setSubmitValidationError: Dispatch<SetStateAction<string>>;
    setDeductions: Dispatch<SetStateAction<DeductionState>>;
    setSelectedDeduction: Dispatch<SetStateAction<DeductionKey[]>>;
    setSelectedNg: Dispatch<SetStateAction<NgKey[]>>;
    setOperationType: Dispatch<SetStateAction<OperationType>>;
    setOperationMode: Dispatch<SetStateAction<OperationMode>>;
    setMachineCount: Dispatch<SetStateAction<number>>;
    setMachineLines: Dispatch<SetStateAction<MachineLineState[]>>;
    setShowDeduction: Dispatch<SetStateAction<boolean>>;
    setShowNg: Dispatch<SetStateAction<boolean>>;
};

/** Confirm reset, cancel stale autosaves, retain worker identity and reset machine cards. */
export function useProcessReset({
    process, showToast, submitting, form, selectedNg, selectedDeduction, machineLines,
    submitLockRef, clientRequestIdRef, pendingSplitPayloadsRef,
    duplicatePrimaryCompletedRef, duplicateForceRequestIdRef, isRestoringDraftRef,
    draftSaveTimerRef, resetVersionRef, setForm, setSubmitValidationError,
    setDeductions, setSelectedDeduction, setSelectedNg, setOperationType,
    setOperationMode, setMachineCount, setMachineLines, setShowDeduction, setShowNg,
}: Params) {
    const handleReset = () => {
        if (duplicatePrimaryCompletedRef.current && pendingSplitPayloadsRef.current.length) {
            showToast("Một phần báo cáo đã gửi thành công. Hãy gửi nốt phần còn lại trước khi làm mới biểu mẫu.", "warning");
            return;
        }
        if (submitLockRef.current || submitting) return;
        const hasEnteredData = hasProcessReportInput(form, selectedNg, selectedDeduction, machineLines);

        if (hasEnteredData && !window.confirm("Làm mới sẽ xóa dữ liệu bạn đang nhập. Bạn có chắc muốn tiếp tục?")) {
            return;
        }

        // Invalidate any pending draft autosave before clearing the form.
        resetVersionRef.current += 1;
        isRestoringDraftRef.current = false;
        if (draftSaveTimerRef.current !== null) {
            window.clearTimeout(draftSaveTimerRef.current);
            draftSaveTimerRef.current = null;
        }
        void clearProcessDraftAsync(process);

        setForm((prev) => resetProcessFormRetainingWorker(prev, getCurrentLocalDate()));


        setSubmitValidationError("");
        clientRequestIdRef.current = null;
        duplicateForceRequestIdRef.current = null;
        setDeductions(
            initialDeduction
        );


        setSelectedDeduction(
            []
        );


        setSelectedNg(
            []
        );

        setOperationType("CUT");
        setOperationMode("MANUAL");
        setMachineCount(1);
        setMachineLines([createEmptyMachineLine()]);




        setShowDeduction(
            false
        );


        setShowNg(
            false
        );

    };

    return { handleReset };
}
