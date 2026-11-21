import axios from "axios";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { NavigateFunction } from "react-router-dom";
import type { ProductionReport } from "../../types/production";
import type { ToastContextValue } from "../../components/feedback/toastContext";
import type { DuplicatePromptState } from "./processDuplicateReportLogic";
import { createTempReport } from "../../services/productionService";
import { getApiError } from "../../utils/apiError";
import { createClientRequestId } from "../../utils/workerSubmitGuard";
import { clearSubmittedProcessDraft } from "./processSubmitDraftCompletion";
import { classifyProcessSubmitResponse } from "../../utils/processSubmitOutcome";
import { isTransientNetworkFailure } from "../../services/offlineReportQueue";
import { queueRemainingMachineReports } from "./processMachineReportQueue";
import { reportsAwaitingDuplicateConfirmation, reportsUnsentAfterNetworkFailure } from "./processSubmitBatchSlices";
import { toDuplicatePrompt } from "./processDuplicateReportLogic";

type Params = {
    process: string;
    navigate: NavigateFunction;
    showToast: ToastContextValue["showToast"];
    validateForm: () => string;
    focusValidationTarget: (message: string) => void;
    buildPayloads: (clientRequestId: string | null) => ProductionReport[];
    setSubmitting: Dispatch<SetStateAction<boolean>>;
    setSubmitValidationError: Dispatch<SetStateAction<string>>;
    setDuplicatePrompt: Dispatch<SetStateAction<DuplicatePromptState | null>>;
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

/** Submit validated production reports with durable offline replay and duplicate challenge handling. */
export function useProcessSubmission({
    process, navigate, showToast, validateForm, focusValidationTarget, buildPayloads,
    setSubmitting, setSubmitValidationError, setDuplicatePrompt, getDuplicateFormSignature,
    submitLockRef, clientRequestIdRef, pendingSplitPayloadsRef, duplicatePrimaryCompletedRef,
    duplicateForceRequestIdRef, isRestoringDraftRef, draftSaveTimerRef, resetVersionRef,
}: Params) {
    const finishSubmission = () => {
        finishSubmission();
    };

    const handleSubmit =
        async () => {

            // UX: kiểm tra dữ liệu tại chỗ trước, tránh bắt công nhân chờ một request
            // kiểm tra mạng rồi mới biết form đang thiếu trường bắt buộc.
            const validationMessage = validateForm();

            if (validationMessage) {
                setSubmitValidationError(validationMessage);
                showToast(validationMessage, "warning");
                focusValidationTarget(validationMessage);
                return;
            }


            if (submitLockRef.current) return;
            setSubmitValidationError("");
            submitLockRef.current = true;
            clientRequestIdRef.current ||= createClientRequestId();

            try {
                setSubmitting(true);

                const payloads = buildPayloads(clientRequestIdRef.current);

                if (!navigator.onLine) {
                    queueRemainingMachineReports(payloads);
                    showToast("Đang mất mạng. Các báo cáo đã được lưu trên thiết bị và sẽ tự gửi khi có Internet.", "warning");
                    finishSubmission();
                    return;
                }

                for (let index = 0; index < payloads.length; index += 1) {
                    const payload = payloads[index];
                    let response;
                    try {
                        response = await createTempReport(payload);
                    } catch (error: unknown) {
                        if (axios.isAxiosError(error) && error.response?.status === 429) {
                            showToast("Bạn thao tác quá nhanh. Dữ liệu trên form vẫn được giữ, vui lòng thử lại sau ít phút.", "warning");
                            return;
                        }
                        if (axios.isAxiosError(error) && error.response?.status === 409 && ["DUPLICATE_PRODUCTION_REPORT", "DUPLICATE_CONFIRMATION_REQUIRED"].includes(String(error.response?.data?.code || ""))) {
                            const duplicateResponse = error.response;
                            const challengeToken = String(duplicateResponse.data?.duplicate_confirmation_token || "").trim();
                            if (challengeToken) {
                                const prompt = toDuplicatePrompt(duplicateResponse.data, payload);
                                if (prompt) {
                                    duplicatePrimaryCompletedRef.current = false;
                                    duplicateForceRequestIdRef.current = null;
                                    pendingSplitPayloadsRef.current = reportsAwaitingDuplicateConfirmation(payloads, index);
                                    const reportType = duplicateResponse.data?.report_type === "approved" ? "approved" : "temp";
                                    setDuplicatePrompt({ ...prompt, reportType, formSignature: getDuplicateFormSignature() });
                                    return;
                                }
                            }
                        }
                        if (isTransientNetworkFailure(error)) {
                            queueRemainingMachineReports(reportsUnsentAfterNetworkFailure(payloads, index));
                            showToast("Kết nối Internet bị gián đoạn. Các báo cáo còn lại đã được lưu trên thiết bị và sẽ tự gửi khi có mạng.", "warning");
                            finishSubmission();
                            return;
                        }
                        throw error;
                    }

                    const submitOutcome = classifyProcessSubmitResponse(response);
                    if (submitOutcome === "similar_report" && response?.data?.id) {
                        const prompt = toDuplicatePrompt(response, payload);
                        if (prompt) {
                            duplicatePrimaryCompletedRef.current = false;
                            duplicateForceRequestIdRef.current = null;
                            pendingSplitPayloadsRef.current = reportsAwaitingDuplicateConfirmation(payloads, index);
                            setDuplicatePrompt({ ...prompt, formSignature: getDuplicateFormSignature() });
                            return;
                        }
                    }
                }

                pendingSplitPayloadsRef.current = [];
                showToast("Lưu báo cáo thành công. Các báo cáo đã được gửi chờ duyệt.", "success");
                finishSubmission();

            }
            catch (error: unknown) {

                console.error(
                    "CREATE TEMP REPORT ERROR:",
                    error
                );


                const { message, errors } = getApiError(error, "Lưu báo cáo thất bại");
                const firstFieldError = Object.values(errors)[0];
                showToast(firstFieldError || message, "error");

            }
            finally {

                submitLockRef.current = false;
                setSubmitting(false);

            }

        };



    return { handleSubmit };
}
