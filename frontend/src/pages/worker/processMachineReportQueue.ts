import axios from "axios";
import { enqueueOfflineReports, isTransientNetworkFailure } from "../../services/offlineReportQueue";

/**
 * Queue the unsent suffix of a multi-machine submission without modifying
 * client_request_id values. The queue owns durable persistence and retries.
 */
export function queueRemainingMachineReports<T>(reports: T[]): void {
    enqueueOfflineReports(reports);
}

/**
 * Only a confirmed primary report may fall back to queuing the remaining
 * machine reports; a rate-limit response must remain visible to the worker.
 */
export function shouldQueuePendingMachineReports(
    primaryCompleted: boolean,
    error: unknown,
): boolean {
    return primaryCompleted
        && isTransientNetworkFailure(error)
        && !(axios.isAxiosError(error) && error.response?.status === 429);
}
