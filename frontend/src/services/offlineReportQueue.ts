import axios from "axios";
import type { ProductionReport } from "../types/production";
import { getStoredUser } from "../utils/authStorage";
import { checkSimilarTempReport, createTempReport } from "./productionService";

const STORAGE_KEY = "ktcOfflineReportQueueV1";
const MAX_ITEMS_PER_OWNER = 50;
const MAX_TOTAL_ITEMS = 100;
// A 422 whose duplicate check keeps failing transiently is retried with backoff, but not forever.
const MAX_UNKNOWN_SIMILAR_RETRIES = 5;
export const OFFLINE_QUEUE_CHANGED_EVENT = "ktc:offline-queue-changed";

interface QueueOwner {
    userId: number;
    workerId: number | null;
    workerCode: string;
}

export type OfflineQueueStatus = "queued" | "retrying" | "blocked";

export interface OfflineReportQueueItem {
    id: string;
    owner: QueueOwner;
    createdAt: number;
    attempts: number;
    status: OfflineQueueStatus;
    nextRetryAt: number;
    lastError?: string;
    /** Safe backend business code of the ORIGINAL create failure (never a token/payload). */
    lastErrorCode?: string;
    /** Outcome of the follow-up duplicate check when it could not give a definite answer. */
    similarCheck?: "failed-business" | "failed-transient";
    payload: ProductionReport;
}

function currentOwner(): QueueOwner | null {
    const user = getStoredUser();
    if (!user || user.role !== "worker") return null;
    return {
        userId: Number(user.id),
        workerId: user.worker_id == null ? null : Number(user.worker_id),
        workerCode: String(user.worker_code || "").trim().toUpperCase()
    };
}

function ownerMatches(a: QueueOwner, b: QueueOwner): boolean {
    return a.userId === b.userId && a.workerId === b.workerId && a.workerCode === b.workerCode;
}

function normalizeStoredItem(item: OfflineReportQueueItem): OfflineReportQueueItem | null {
    if (!item?.payload || !item?.owner || !item?.id) return null;

    const lastError = String(item.lastError || "");
    if (item.status === "blocked" && (/trùng|duplicate/i.test(lastError) || /chờ đồng bộ quá 24 giờ/i.test(lastError))) {
        return {
            ...item,
            status: "queued",
            nextRetryAt: Date.now(),
            lastError: undefined
        };
    }

    // Do not automatically block old reports. KTC workers can backdate reports
    // within the business-approved window, so queue age alone is not a reason
    // to prevent automatic delivery. Only deterministic server errors may block.
    return item;
}

function readAll(options: { failOnCorrupt?: boolean } = {}): OfflineReportQueueItem[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === null) return [];
        const parsed = JSON.parse(stored) as OfflineReportQueueItem[];
        if (!Array.isArray(parsed)) throw new Error("Offline queue is not an array");
        const normalized = parsed.map(normalizeStoredItem).filter((item): item is OfflineReportQueueItem => Boolean(item));
        if (options.failOnCorrupt && normalized.length !== parsed.length) {
            throw new Error("Offline queue contains invalid items");
        }
        return normalized;
    } catch {
        // Readers may show an empty state when storage is inaccessible, but
        // writers MUST NOT overwrite a corrupt queue and destroy unsent reports.
        if (options.failOnCorrupt) {
            throw new Error("Dữ liệu báo cáo offline trên thiết bị đang lỗi. Không thể ghi đè vì có nguy cơ mất báo cáo chưa gửi.");
        }
        return [];
    }
}

function assertSameQueuedSubmission(existing: OfflineReportQueueItem, incoming: ProductionReport): void {
    if (JSON.stringify(existing.payload) !== JSON.stringify(incoming)) {
        // A request ID is an idempotency identity, not permission to discard
        // a different report under the same identifier.
        throw new Error("Mã gửi báo cáo đã được dùng cho dữ liệu khác. Báo cáo chưa được lưu offline; vui lòng kiểm tra lại.");
    }
}

function writeAll(items: OfflineReportQueueItem[]): void {
    try {
        const expected = items.length ? JSON.stringify(items) : null;
        if (expected === null) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, expected);
        // Some embedded browsers/storage shims can fail without throwing.
        // Never tell the worker the batch was saved without read-back.
        if (localStorage.getItem(STORAGE_KEY) !== expected) {
            throw new Error("offline write verification failed");
        }
    } catch {
        throw new Error("Không xác nhận được việc lưu báo cáo offline trên thiết bị. Dữ liệu vẫn ở biểu mẫu; vui lòng kiểm tra bộ nhớ trước khi thử lại.");
    }
    window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_CHANGED_EVENT));
}

export function isTransientNetworkFailure(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false;
    if (axios.isCancel(error)) return false;
    const status = Number(error.response?.status || 0);
    return !error.response
        || error.code === "ERR_NETWORK"
        || error.code === "ECONNABORTED"
        || error.code === "ETIMEDOUT"
        || error.code === "ECONNRESET"
        || status === 408
        || status === 425
        || status === 429
        || status >= 500;
}

function retryDelayMs(attempts: number): number {
    const step = Math.max(0, Math.min(6, attempts));
    return Math.min(15 * 60_000, 15_000 * 2 ** step);
}

function errorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message;
        return String(message || error.message || "Không thể đồng bộ báo cáo").slice(0, 240);
    }
    return error instanceof Error ? error.message.slice(0, 240) : "Không thể đồng bộ báo cáo";
}

function responseData(error: unknown): any {
    if (!axios.isAxiosError(error)) return null;
    return error.response?.data || null;
}

function isAlreadyCreatedDuplicate(error: unknown, payload: ProductionReport): boolean {
    const data = responseData(error);
    if (!axios.isAxiosError(error) || Number(error.response?.status || 0) !== 409 || !data) return false;
    if (data.code !== "DUPLICATE_CONFIRMATION_REQUIRED" || data.duplicate_reason !== "similar_report") return false;

    const existing = data.data || data.existing_report;
    const existingClient = String(existing?.client_request_id || "").trim();
    const payloadClient = String(payload.client_request_id || "").trim();
    return Boolean(existingClient && payloadClient && existingClient === payloadClient);
}

export type SimilarCheckOutcome = "exists" | "absent" | "unknown-transient" | "unknown-business";

/**
 * Duplicate check after a 422. A failed check is NEVER reported as "absent" or "exists":
 * it is "unknown" so the original create error is kept and the item is not marked sent.
 */
export async function serverAlreadyHasQueuedReport(payload: ProductionReport): Promise<SimilarCheckOutcome> {
    try {
        const result = await checkSimilarTempReport({
            process_id: payload.process_id,
            work_date: payload.work_date,
            shift: payload.shift,
            machine_no: payload.machine_no,
            product_name: payload.product_name,
            operation_mode: payload.operation_mode,
            work_type: payload.work_type,
            operation_type: payload.operation_type,
        });
        // A similar report is not proof that THIS client_request_id was saved.
        // Never discard a worker's unsent payload because another report has
        // the same date, shift, machine and product.
        const existingRequestId = String((result?.data as { client_request_id?: string } | null)?.client_request_id || "").trim();
        const submittedRequestId = String(payload.client_request_id || "").trim();
        return result?.duplicate && result?.data?.id
            && existingRequestId && submittedRequestId && existingRequestId === submittedRequestId
            ? "exists" : "absent";
    } catch (error) {
        return isTransientNetworkFailure(error) ? "unknown-transient" : "unknown-business";
    }
}

function safeErrorCode(error: unknown): string | undefined {
    const code = responseData(error)?.code;
    return typeof code === "string" && /^[A-Z0-9_]{3,64}$/.test(code) ? code : undefined;
}

export function getCurrentOfflineQueueItems(): OfflineReportQueueItem[] {
    const owner = currentOwner();
    if (!owner) return [];
    return readAll().filter((item) => ownerMatches(item.owner, owner));
}

let activeFlushPromise: Promise<{ sent: number; remaining: number }> | null = null;
let activeFlushOwner: QueueOwner | null = null;

export function enqueueOfflineReport(payload: ProductionReport): OfflineReportQueueItem {
    const owner = currentOwner();
    if (!owner) throw new Error("Không xác định được công nhân cho hàng đợi offline.");
    const clientRequestId = String(payload.client_request_id || "").trim();
    if (!clientRequestId) throw new Error("Báo cáo offline phải có client_request_id.");

    const all = readAll({ failOnCorrupt: true });
    const existing = all.find((item) => ownerMatches(item.owner, owner) && item.payload.client_request_id === clientRequestId);
    if (existing) {
        assertSameQueuedSubmission(existing, payload);
        void flushOfflineReportQueue();
        return existing;
    }
    const mine = all.filter((item) => ownerMatches(item.owner, owner));
    if (mine.length >= MAX_ITEMS_PER_OWNER) {
        throw new Error(`Thiết bị đang giữ ${mine.length} báo cáo chưa đồng bộ. Hãy đồng bộ hoặc xử lý hàng đợi trước khi nhập thêm.`);
    }
    if (all.length >= MAX_TOTAL_ITEMS) {
        throw new Error("Hàng đợi offline trên thiết bị đã đầy. Không thể lưu thêm báo cáo mà không có nguy cơ mất dữ liệu.");
    }

    const item: OfflineReportQueueItem = {
        id: crypto.randomUUID(),
        owner,
        createdAt: Date.now(),
        attempts: 0,
        status: "queued",
        nextRetryAt: Date.now(),
        payload
    };
    writeAll([...all, item]);
    void flushOfflineReportQueue();
    return item;
}

/**
 * Atomically stage a multi-machine submission. Capacity and request IDs are
 * checked for the entire batch BEFORE a single localStorage write. A partial
 * queue is never presented to the worker as a fully saved submission.
 */
export function enqueueOfflineReports(payloads: ProductionReport[]): OfflineReportQueueItem[] {
    if (!payloads.length) return [];
    const owner = currentOwner();
    if (!owner) throw new Error("Không xác định được công nhân cho hàng đợi offline.");

    const all = readAll({ failOnCorrupt: true });
    const newlyQueued: OfflineReportQueueItem[] = [];
    const result: OfflineReportQueueItem[] = [];
    const known = new Map(
        all.filter((item) => ownerMatches(item.owner, owner))
            .map((item) => [String(item.payload.client_request_id || "").trim(), item] as const)
    );

    for (const payload of payloads) {
        const requestId = String(payload.client_request_id || "").trim();
        if (!requestId) throw new Error("Báo cáo offline phải có client_request_id.");
        const existing = known.get(requestId);
        if (existing) {
            assertSameQueuedSubmission(existing, payload);
            result.push(existing);
            continue;
        }
        const item: OfflineReportQueueItem = {
            id: crypto.randomUUID(),
            owner,
            createdAt: Date.now(),
            attempts: 0,
            status: "queued",
            nextRetryAt: Date.now(),
            payload
        };
        newlyQueued.push(item);
        known.set(requestId, item);
        result.push(item);
    }

    const mineCount = all.filter((item) => ownerMatches(item.owner, owner)).length;
    if (mineCount + newlyQueued.length > MAX_ITEMS_PER_OWNER) {
        throw new Error("Hàng đợi offline của công nhân không đủ chỗ cho toàn bộ báo cáo. Hãy đồng bộ trước khi lưu.");
    }
    if (all.length + newlyQueued.length > MAX_TOTAL_ITEMS) {
        throw new Error("Thiết bị không đủ chỗ cho toàn bộ nhóm báo cáo offline. Chưa có báo cáo mới nào được lưu.");
    }
    if (newlyQueued.length) writeAll([...all, ...newlyQueued]);
    void flushOfflineReportQueue();
    return result;
}

export function getCurrentOfflineQueueCount(): number {
    const owner = currentOwner();
    if (!owner) return 0;
    return readAll().filter((item) => ownerMatches(item.owner, owner)).length;
}

export function retryBlockedOfflineReport(id: string): boolean {
    const owner = currentOwner();
    if (!owner) return false;
    let changed = false;
    const next = readAll({ failOnCorrupt: true }).map((item) => {
        if (item.id !== id || !ownerMatches(item.owner, owner)) return item;
        changed = true;
        return { ...item, status: "queued" as const, nextRetryAt: Date.now(), lastError: undefined };
    });
    if (changed) writeAll(next);
    return changed;
}

export function removeOfflineReport(id: string): boolean {
    const owner = currentOwner();
    if (!owner) return false;
    const all = readAll({ failOnCorrupt: true });
    const next = all.filter((item) => item.id !== id || !ownerMatches(item.owner, owner));
    if (next.length === all.length) return false;
    writeAll(next);
    return true;
}

async function flushOfflineReportQueueInternal(options: { force?: boolean } = {}): Promise<{ sent: number; remaining: number }> {
    const owner = currentOwner();
    const force = options.force === true;
    if (!owner) {
        return { sent: 0, remaining: 0 };
    }

    const all = readAll({ failOnCorrupt: true });
    const mine = all.filter((item) => ownerMatches(item.owner, owner));
    const remaining: OfflineReportQueueItem[] = [];
    const sameSignedInWorker = () => {
        const current = currentOwner();
        return current !== null && ownerMatches(current, owner);
    };
    let sent = 0;
    const now = Date.now();

    for (let index = 0; index < mine.length; index += 1) {
        // The login may have changed while a previous request was pending.
        // Never send the next worker's payload under another account's token.
        if (!sameSignedInWorker()) return { sent, remaining: getCurrentOfflineQueueCount() };
        const item = mine[index];
        if ((!force && item.status === "blocked") || (!force && Number(item.nextRetryAt || 0) > now)) {
            remaining.push(item);
            continue;
        }
        try {
            const result = await createTempReport(item.payload);
            if (!sameSignedInWorker()) return { sent, remaining: getCurrentOfflineQueueCount() };
            if (result?.success === false) {
                throw new Error(result.message || "Backend từ chối báo cáo chưa đồng bộ.");
            }
            sent += 1;
        } catch (error) {
            if (!sameSignedInWorker()) return { sent, remaining: getCurrentOfflineQueueCount() };
            if (isAlreadyCreatedDuplicate(error, item.payload)) {
                sent += 1;
                continue;
            }

            const attempts = Number(item.attempts || 0) + 1;
            const message = errorMessage(error);
            const status = Number(axios.isAxiosError(error) ? error.response?.status || 0 : 0);
            let similarCheck: OfflineReportQueueItem["similarCheck"];
            if (status === 422) {
                const outcome = await serverAlreadyHasQueuedReport(item.payload);
                if (!sameSignedInWorker()) return { sent, remaining: getCurrentOfflineQueueCount() };
                if (outcome === "exists") {
                    sent += 1;
                    continue;
                }
                if (outcome === "unknown-transient" && attempts < MAX_UNKNOWN_SIMILAR_RETRIES) {
                    // Cannot tell whether the server already has it: retry later (backoff), keep the original error.
                    remaining.push({
                        ...item,
                        attempts,
                        status: "retrying",
                        nextRetryAt: Date.now() + retryDelayMs(attempts),
                        lastError: message,
                        lastErrorCode: safeErrorCode(error),
                        similarCheck: "failed-transient"
                    });
                    remaining.push(...mine.slice(index + 1));
                    break;
                }
                if (outcome === "unknown-business") similarCheck = "failed-business";
                if (outcome === "unknown-transient") similarCheck = "failed-transient";
            }

            if (isTransientNetworkFailure(error)) {
                remaining.push({
                    ...item,
                    attempts,
                    status: "retrying",
                    nextRetryAt: Date.now() + retryDelayMs(attempts),
                    lastError: message,
                    lastErrorCode: safeErrorCode(error)
                });
                remaining.push(...mine.slice(index + 1));
                break;
            }

            remaining.push({
                ...item,
                attempts,
                status: "blocked",
                nextRetryAt: Number.MAX_SAFE_INTEGER,
                // Always the ORIGINAL create error; a failed duplicate check never overwrites it.
                lastError: message,
                lastErrorCode: safeErrorCode(error),
                similarCheck
            });
        }
    }

    if (!sameSignedInWorker()) return { sent, remaining: getCurrentOfflineQueueCount() };

    // Merge against CURRENT storage, not the snapshot taken before API awaits.
    // Otherwise a new submission, another owner's queue or a manual removal
    // during the flush can be silently overwritten or resurrected.
    const originalIds = new Set(mine.map((item) => item.id));
    const pendingById = new Map(remaining.map((item) => [item.id, item]));
    const latest = readAll({ failOnCorrupt: true });
    const merged: OfflineReportQueueItem[] = [];
    for (const item of latest) {
        if (!originalIds.has(item.id) || !ownerMatches(item.owner, owner)) {
            merged.push(item);
            continue;
        }
        const pending = pendingById.get(item.id);
        if (pending) merged.push(pending);
        // No pending entry means this exact request was confirmed by the API.
    }
    // Read/write stays synchronous after this account check; preserve records
    // added while the original network request was in flight.
    if (JSON.stringify(latest) !== JSON.stringify(merged)) writeAll(merged);
    return { sent, remaining: merged.filter((item) => ownerMatches(item.owner, owner)).length };
}

export function flushOfflineReportQueue(options: { force?: boolean } = {}): Promise<{ sent: number; remaining: number }> {
    const requestedOwner = currentOwner();
    if (activeFlushPromise) {
        // A new session must never receive A's in-flight result as if it were
        // B's completed flush. Queue B's flush after the old session settles.
        if (requestedOwner && activeFlushOwner && !ownerMatches(requestedOwner, activeFlushOwner)) {
            return activeFlushPromise.catch(() => ({ sent: 0, remaining: 0 }))
                .then(() => flushOfflineReportQueue(options));
        }
        return activeFlushPromise;
    }
    activeFlushOwner = requestedOwner;
    activeFlushPromise = flushOfflineReportQueueInternal(options).finally(() => {
        activeFlushPromise = null;
        activeFlushOwner = null;
    });
    return activeFlushPromise;
}
