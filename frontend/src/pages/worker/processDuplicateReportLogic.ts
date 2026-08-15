import type { ProductionReport } from "../../types/production";

export type DuplicateReportType = "temp" | "approved";

export interface DuplicatePromptState {
    reportId: number;
    payload: ProductionReport;
    confirmationToken: string;
    reportType: DuplicateReportType;
    formSignature?: string;
}

interface DuplicateResponseShape {
    duplicate_confirmation_token?: string | null;
    data?: {
        id?: number | string | null;
        report_type?: string | null;
    } | null;
}

export function toDuplicatePrompt(
    response: DuplicateResponseShape | null | undefined,
    payload: ProductionReport
): DuplicatePromptState | null {
    const confirmationToken = String(
        response?.duplicate_confirmation_token || ""
    ).trim();
    const reportId = Number(response?.data?.id || 0);

    if (!confirmationToken || !Number.isFinite(reportId) || reportId <= 0) {
        return null;
    }

    return {
        reportId,
        payload,
        confirmationToken,
        reportType: response?.data?.report_type === "approved" ? "approved" : "temp",
    };
}

export function canWorkerUpdateDuplicate(
    prompt: Pick<DuplicatePromptState, "reportType"> | null | undefined
): boolean {
    return Boolean(prompt && prompt.reportType !== "approved");
}
