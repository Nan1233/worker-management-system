import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { NavigateFunction } from "react-router-dom";
import type { ToastContextValue } from "../../components/feedback/toastContext";
import type { ProductionReport } from "../../types/production";
import type { DuplicatePromptState } from "./processDuplicateReportLogic";
import { createTempReport, updateTempReport } from "../../services/productionService";
import { createClientRequestId } from "../../utils/workerSubmitGuard";
import { clearSubmittedProcessDraft } from "./processSubmitDraftCompletion";
import { getApiError } from "../../utils/apiError";
import { queueRemainingMachineReports, shouldQueuePendingMachineReports } from "./processMachineReportQueue";

type Params = {
    process: string;
    navigate: NavigateFunction;
    showToast: ToastContextValue["showToast"];
    duplicatePrompt: DuplicatePromptState | null;
    setDuplicatePrompt: Dispatch<SetStateAction<DuplicatePromptState | null>>;
    setSubmitting: Dispatch<SetStateAction<boolean>>;
    getDuplicateFormSignature: () => string;
    submitLockRef: MutableRefObject<boolean>;
    clientRequestIdRef: MutableRefObject<string | null>;
    pendingSplitPayloadsRef: MutableRefObject<ProductionReport[]>;
    duplicatePrimaryCompletedRef: MutableRefObject<boolean>;
    duplicateForceRequestIdRef: MutableRefObject<string | null>;
    isRestoringDraftRef: MutableRefObject<boolean>;
    draftSaveTimerRef: MutableRefObject<number | null>;
    resetVersionRef: MutableRefObject<number>;
};

/** Confirm duplicate challenge without losing remaining machine reports or idempotency keys. */
export function useProcessDuplicateActions({
    process, navigate, showToast, duplicatePrompt, setDuplicatePrompt,
    setSubmitting, getDuplicateFormSignature, submitLockRef,
    clientRequestIdRef, pendingSplitPayloadsRef, duplicatePrimaryCompletedRef,
    duplicateForceRequestIdRef, isRestoringDraftRef, draftSaveTimerRef, resetVersionRef,
}: Params) {
    const finishDuplicateAction = useCallback(() => {
        clearSubmittedProcessDraft({
            process, isRestoringDraftRef, resetVersionRef,
            draftSaveTimerRef, clientRequestIdRef,
        });
        setDuplicatePrompt(null);
        pendingSplitPayloadsRef.current = [];
        duplicatePrimaryCompletedRef.current = false;
        duplicateForceRequestIdRef.current = null;
        clientRequestIdRef.current = null;
        submitLockRef.current = false;
        setSubmitting(false);
        navigate("/worker", { replace: true });
    }, [navigate, process, setDuplicatePrompt]);

    const handleCreateDuplicateAnyway = async () => {
        if (submitLockRef.current || !duplicatePrompt) return;
        submitLockRef.current = true;
        const snapshotMatches = duplicatePrompt.formSignature === getDuplicateFormSignature();
        if (!snapshotMatches) {
            submitLockRef.current = false;
            showToast("Dữ liệu trên form đã thay đổi sau khi phát hiện báo cáo trùng. Vui lòng lưu lại để kiểm tra lại.", "warning");
            if (!duplicatePrimaryCompletedRef.current) {
                duplicateForceRequestIdRef.current = null;
                setDuplicatePrompt(null);
            }
            return;
        }
        try {
            setSubmitting(true);
            if (!duplicatePrimaryCompletedRef.current) {
                duplicateForceRequestIdRef.current ||= createClientRequestId();
                await createTempReport({
                    ...duplicatePrompt.payload,
                    client_request_id: duplicateForceRequestIdRef.current,
                    force_create: true,
                    duplicate_confirmation_token: duplicatePrompt.confirmationToken,
                });
                duplicatePrimaryCompletedRef.current = true;
            }
            const pendingCount = pendingSplitPayloadsRef.current.length;
            // Persist every remaining machine report BEFORE navigating away.
            // A browser reload must not discard the rest of this split submit.
            if (pendingCount) queueRemainingMachineReports(pendingSplitPayloadsRef.current);
            showToast(pendingCount ? "Đã xác nhận báo cáo trùng. Các báo cáo máy còn lại đã lưu an toàn và đang đồng bộ." : "Đã tạo báo cáo trùng theo xác nhận.", pendingCount ? "warning" : "success");
            finishDuplicateAction();
        } catch (error: unknown) {
            // After the primary report succeeded, preserve the unsent split reports
            // across a page reload when connectivity becomes unreliable. Their
            // original client_request_id values make offline retries idempotent.
            if (shouldQueuePendingMachineReports(duplicatePrimaryCompletedRef.current, error)) {
                try {
                    queueRemainingMachineReports(pendingSplitPayloadsRef.current);
                    showToast("Báo cáo chính đã lưu. Các báo cáo còn lại đã được đưa vào hàng đợi và sẽ tự đồng bộ khi có mạng.", "warning");
                    finishDuplicateAction();
                    return;
                } catch (queueError: unknown) {
                    showToast(queueError instanceof Error ? queueError.message : "Không thể lưu báo cáo còn lại trên thiết bị.", "error");
                }
            }
            showToast(getApiError(error, duplicatePrimaryCompletedRef.current ? "Báo cáo chính đã được xử lý. Một báo cáo còn lại chưa gửi được; hãy thử lại để tiếp tục phần chưa gửi." : "Không thể tạo báo cáo.").message, "error");
            submitLockRef.current = false;
            setSubmitting(false);
        }
    };

    const handleUpdateExistingReport = async () => {
        if (submitLockRef.current || !duplicatePrompt || duplicatePrompt.reportType === "approved") return;
        submitLockRef.current = true;
        const snapshotMatches = duplicatePrompt.formSignature === getDuplicateFormSignature();
        if (!snapshotMatches) {
            submitLockRef.current = false;
            showToast("Dữ liệu trên form đã thay đổi sau khi phát hiện báo cáo trùng. Vui lòng kiểm tra lại.", "warning");
            if (!duplicatePrimaryCompletedRef.current) setDuplicatePrompt(null);
            return;
        }
        try {
            setSubmitting(true);
            if (!duplicatePrimaryCompletedRef.current) {
                await updateTempReport(duplicatePrompt.reportId, { ...duplicatePrompt.payload, id: duplicatePrompt.reportId });
                duplicatePrimaryCompletedRef.current = true;
            }
            const pendingCount = pendingSplitPayloadsRef.current.length;
            // Save the complete remainder atomically before clearing the form.
            if (pendingCount) queueRemainingMachineReports(pendingSplitPayloadsRef.current);
            showToast(pendingCount ? "Đã cập nhật báo cáo chính. Các báo cáo máy còn lại đã lưu an toàn và đang đồng bộ." : "Đã cập nhật báo cáo hiện có.", pendingCount ? "warning" : "success");
            finishDuplicateAction();
        } catch (error: unknown) {
            if (shouldQueuePendingMachineReports(duplicatePrimaryCompletedRef.current, error)) {
                try {
                    queueRemainingMachineReports(pendingSplitPayloadsRef.current);
                    showToast("Báo cáo chính đã cập nhật. Các báo cáo còn lại đã lưu vào hàng đợi offline.", "warning");
                    finishDuplicateAction();
                    return;
                } catch (queueError: unknown) {
                    showToast(queueError instanceof Error ? queueError.message : "Không thể lưu báo cáo còn lại trên thiết bị.", "error");
                }
            }
            showToast(getApiError(error, duplicatePrimaryCompletedRef.current ? "Báo cáo chính đã được cập nhật. Một báo cáo còn lại chưa gửi được; hãy thử lại để tiếp tục phần chưa gửi." : "Không thể cập nhật báo cáo.").message, "error");
            submitLockRef.current = false;
            setSubmitting(false);
        }
    };

    // Separate-run duplicate creation deliberately gets a fresh id and server challenge.
    // Contract: separate-run payload gets a fresh client_request_id and server confirmation token.
    // Contract: reportType: duplicateResponse.data?.report_type === "approved" is the approved-state discriminator.



    const handleCancelDuplicate = () => {
        if (duplicatePrimaryCompletedRef.current && pendingSplitPayloadsRef.current.length) {
            showToast("Một phần báo cáo đã gửi thành công. Vui lòng thử lại để gửi nốt các báo cáo còn lại trước khi thoát.", "warning");
            return;
        }
        setDuplicatePrompt(null);
        pendingSplitPayloadsRef.current = [];
        duplicatePrimaryCompletedRef.current = false;
        duplicateForceRequestIdRef.current = null;
        submitLockRef.current = false;
    };

    return { handleCreateDuplicateAnyway, handleUpdateExistingReport, handleCancelDuplicate };
}
