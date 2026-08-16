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
    } | null;
}

function unwrapDuplicatePayload(
    response: DuplicateResponseShape | null | undefined
): DuplicateResponseShape | null {
    if (!response || typeof response !== "object") return null;

    // Accept both the normalized API payload and an AxiosResponse-like
    // wrapper. This prevents duplicate handling from depending on which
    // layer called the helper.
    // If the current object already carries the challenge token, it is the
    // API payload we need. Do not unwrap its `data` field and lose the token.
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

    return {
        reportId,
        payload,
        confirmationToken,
        reportType: body?.data?.report_type === "approved" || body?.report_type === "approved"
            ? "approved"
            : "temp",
    };
}

export function canWorkerUpdateDuplicate(
    prompt: Pick<DuplicatePromptState, "reportType"> | null | undefined
): boolean {
    return Boolean(prompt && prompt.reportType !== "approved");
}
