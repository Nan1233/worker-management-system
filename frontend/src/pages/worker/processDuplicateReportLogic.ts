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
    id?: number | string | null;
    report_id?: number | string | null;
    report_type?: string | null;
    data?: {
        id?: number | string | null;
        report_id?: number | string | null;
        report_type?: string | null;
        duplicate_confirmation_token?: string | null;
        created_at?: string | null;
        updated_at?: string | null;
    } | null;
}

function unwrapDuplicatePayload(
    response: DuplicateResponseShape | null | undefined
): DuplicateResponseShape | null {
    if (!response || typeof response !== "object") return null;

    if ("duplicate_confirmation_token" in response) {
        return response;
    }

    const nested = response.data;
    if (
        nested &&
        typeof nested === "object" &&
        ("duplicate_confirmation_token" in nested ||
            "id" in nested ||
            "report_type" in nested)
    ) {
        return nested as DuplicateResponseShape;
    }

    return response;
}

function isWorkerEditWindowExpired(body: DuplicateResponseShape | null): boolean {
    const reportType = body?.data?.report_type || body?.report_type;
    if (reportType === "approved") return true;

    const createdAt = String(body?.data?.created_at || "").trim();
    if (!createdAt) return false;

    const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(createdAt)
        ? `${createdAt.replace(" ", "T")}Z`
        : createdAt;
    const createdMs = new Date(normalized).getTime();
    return !Number.isFinite(createdMs) || createdMs + 10 * 60 * 1000 <= Date.now();
}

export function toDuplicatePrompt(
    response: DuplicateResponseShape | null | undefined,
    payload: ProductionReport
): DuplicatePromptState | null {
    const body = unwrapDuplicatePayload(response);
    const confirmationToken = String(
        body?.duplicate_confirmation_token || ""
    ).trim();
    const reportId = Number(body?.data?.id || body?.data?.report_id || body?.id || 0);

    if (!confirmationToken || !Number.isFinite(reportId) || reportId <= 0) {
        return null;
    }

    const originalReportType = body?.data?.report_type === "approved" || body?.report_type === "approved"
        ? "approved"
        : "temp";

    // A worker may only edit a TEMP report during the 10-minute window.
    // Expired TEMP reports must never be auto-resumed: show the duplicate
    // dialog and allow the worker to explicitly create a new report instead.
    const reportType: DuplicateReportType =
        originalReportType === "temp" && isWorkerEditWindowExpired(body)
            ? "approved"
            : originalReportType;

    return {
        reportId,
        payload,
        confirmationToken,
        reportType,
    };
}

export function canWorkerUpdateDuplicate(
    prompt: Pick<DuplicatePromptState, "reportType"> | null | undefined
): boolean {
    return Boolean(prompt && prompt.reportType !== "approved");
}
