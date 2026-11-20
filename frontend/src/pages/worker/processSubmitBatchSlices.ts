import type { ProductionReport } from "../../types/production";

/**
 * A failed in-flight machine submission has an UNKNOWN result: the server
 * may already have accepted it. Keep its original client_request_id so the
 * durable queue can retry idempotently. Never enqueue an already-confirmed
 * predecessor.
 */
export function reportsUnsentAfterNetworkFailure(
    payloads: ProductionReport[], failedIndex: number,
): ProductionReport[] {
    return payloads.slice(failedIndex);
}

/**
 * A duplicate challenge is for the CURRENT machine report. Its confirmation
 * is handled separately; only the strictly later machine reports may enter
 * the offline remainder after the user confirms the primary.
 */
export function reportsAwaitingDuplicateConfirmation(
    payloads: ProductionReport[], duplicateIndex: number,
): ProductionReport[] {
    return payloads.slice(duplicateIndex + 1);
}
