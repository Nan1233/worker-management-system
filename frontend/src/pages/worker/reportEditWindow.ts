// Worker self-edit window for temporary reports. Mirrors the backend rule
// (backend/models/productionTempUpdateModel.js + middleware/notifyWorkerOnTempEdit.js):
//   - pending / need_fix : 10 minutes from creation
//   - rejected           : 10 minutes from the moment it was rejected
//                          (lifecycle pending -> rejected -> edit -> pending)
//   - approved / other   : not editable by the worker
// The backend remains the authority; this only decides what the UI offers.

export const WORKER_EDIT_WINDOW_MS = 10 * 60 * 1000;

const EDITABLE_STATUSES = new Set(["pending", "need_fix", "rejected"]);

export type WorkerEditWindow = {
    editable: boolean;
    remainingMs: number;
    fromRejection: boolean;
    reason: "OK" | "STATUS_NOT_EDITABLE" | "WINDOW_EXPIRED" | "TIME_UNKNOWN";
};

/** DB timestamps arrive as "YYYY-MM-DD HH:mm:ss" (UTC) or ISO strings. */
export function parseDbDateMs(value: unknown): number {
    if (value === null || value === undefined) return Number.NaN;
    const text = String(value).trim();
    if (!text) return Number.NaN;
    const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text) ? `${text.replace(" ", "T")}Z` : text;
    return new Date(normalized).getTime();
}

export function getWorkerEditWindow(
    report: { status?: unknown; created_at?: unknown; updated_at?: unknown } | null | undefined,
    nowMs: number = Date.now()
): WorkerEditWindow {
    const status = String(report?.status ?? "pending").trim().toLowerCase();
    const fromRejection = status === "rejected";
    if (!EDITABLE_STATUSES.has(status)) {
        return { editable: false, remainingMs: 0, fromRejection, reason: "STATUS_NOT_EDITABLE" };
    }
    const startMs = parseDbDateMs(fromRejection ? report?.updated_at : report?.created_at);
    if (!Number.isFinite(startMs)) {
        return { editable: false, remainingMs: 0, fromRejection, reason: "TIME_UNKNOWN" };
    }
    const remainingMs = Math.max(0, startMs + WORKER_EDIT_WINDOW_MS - nowMs);
    return {
        editable: remainingMs > 0,
        remainingMs,
        fromRejection,
        reason: remainingMs > 0 ? "OK" : "WINDOW_EXPIRED"
    };
}

export function formatRemaining(remainingMs: number): string {
    const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
