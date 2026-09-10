import axios from "axios";
import type { ProductionReport } from "../types/production";
import { getStoredUser } from "../utils/authStorage";
import { createTempReport } from "./productionService";

const STORAGE_KEY = "ktcOfflineReportQueueV1";
const MAX_ITEMS_PER_OWNER = 50;
const MAX_TOTAL_ITEMS = 100;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
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
    // Items blocked by the previous queue implementation after a 409 duplicate
    // must be retried once so the queue can reconcile them with the server.
    // Validation/business errors remain blocked.
    if (item.status === "blocked" && /trùng|duplicate/i.test(String(item.lastError || ""))) {
        return {
            ...item,
            status: "queued",
            nextRetryAt: Date.now()
        };
    }
    const createdAt = Number(item.createdAt || 0);
    const stale = createdAt > 0 && Date.now() - createdAt > STALE_AFTER_MS;
    if (!stale || item.status === "blocked") return item;
    return {
        ...item,
        status: "blocked",
        nextRetryAt: Number.MAX_SAFE_INTEGER,
        lastError: item.lastError || "Báo cáo đã chờ đồng bộ quá 24 giờ. Hãy kiểm tra trước khi gửi lại."
    };
}

function readAll(): OfflineReportQueueItem[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as OfflineReportQueueItem[];
        if (!Array.isArray(parsed)) return [];
        return parsed.map(normalizeStoredItem).filter((item): item is OfflineReportQueueItem => Boolean(item));
    } catch {
        return [];
    }
}

function writeAll(items: OfflineReportQueueItem[]): void {
    try {
        if (!items.length) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
        throw new Error("Không còn đủ bộ nhớ trên thiết bị để giữ báo cáo offline. Hãy kết nối mạng và đồng bộ trước khi nhập thêm.");
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

function payloadMatchesExistingReport(payload: ProductionReport, existing: any): boolean {
    if (!existing || typeof existing !== "object") return false;
    const existingClient = String(existing.client_request_id || "").trim();
    const payloadClient = String(payload.client_request_id || "").trim();
    if (existingClient && payloadClient && existingClient === payloadClient) return true;

    const existingKey = String(existing.logical_duplicate_key || "").trim();
    const payloadKey = String(payload.logical_duplicate_key || "").trim();
    if (existingKey && payloadKey && existingKey === payloadKey) return true;

    const sameIdentity = String(existing.work_date || "").slice(0, 10) === String(payload.work_date || "").slice(0, 10)
        && String(existing.shift || "").trim().toUpperCase() === String(payload.shift || "").trim().toUpperCase()
        && String(existing.machine_no || "").trim() === String(payload.machine_no || "").trim()
        && String(existing.product_name || "").trim() === String(payload.product_name || "").trim();
    return sameIdentity && Number(existing.process_id || 0) === Number(payload.process_id || 0);
}

function isAlreadyCreatedDuplicate(error: unknown, payload: ProductionReport): boolean {
    const data = responseData(error);
    if (!axios.isAxiosError(error) || Number(error.response?.status || 0) !== 409 || !data) return false;
    if (data.code !== "DUPLICATE_CONFIRMATION_REQUIRED" || data.duplicate_reason !== "similar_report") return false;
    return payloadMatchesExistingReport(payload, data.data || data.existing_report);
}

export function getCurrentOfflineQueueItems(): OfflineReportQueueItem[] {
    const owner = currentOwner();
    if (!owner) return [];
    return readAll().filter((item) => ownerMatches(item.owner, owner));
}

export function enqueueOfflineReport(payload: ProductionReport): OfflineReportQueueItem {
    const owner = currentOwner();
    if (!owner) throw new Error("Không xác định được công nhân cho hàng đợi offline.");
    const clientRequestId = String(payload.client_request_id || "").trim();
    if (!clientRequestId) throw new Error("Báo cáo offline phải có client_request_id.");

    const all = readAll();
    const existing = all.find((item) => ownerMatches(item.owner, owner) && item.payload.client_request_id === clientRequestId);
    if (existing) {
        void flushOfflineReportQueue({ force: true });
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
    void flushOfflineReportQueue({ force: true });
    return item;
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
    const next = readAll().map((item) => {
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
    const all = readAll();
    const next = all.filter((item) => item.id !== id || !ownerMatches(item.owner, owner));
    if (next.length === all.length) return false;
    writeAll(next);
    return true;
}

export async function flushOfflineReportQueue(options: { force?: boolean } = {}): Promise<{ sent: number; remaining: number }> {
    const owner = currentOwner();
    const force = options.force === true;
    if (!owner || (!navigator.onLine && !force)) {
        return { sent: 0, remaining: getCurrentOfflineQueueCount() };
    }

    const all = readAll();
    const mine = all.filter((item) => ownerMatches(item.owner, owner));
    const others = all.filter((item) => !ownerMatches(item.owner, owner));
    const remaining: OfflineReportQueueItem[] = [];
    let sent = 0;
    const now = Date.now();

    for (let index = 0; index < mine.length; index += 1) {
        const item = mine[index];
        if (item.status === "blocked" || (!force && Number(item.nextRetryAt || 0) > now)) {
            remaining.push(item);
            continue;
        }
        try {
            const result = await createTempReport(item.payload);
            if (result?.success === false) {
                throw new Error(result.message || "Backend từ chối báo cáo chưa đồng bộ.");
            }
            sent += 1;
        } catch (error) {
            if (isAlreadyCreatedDuplicate(error, item.payload)) {
                // The original request was already committed by the server.
                // The queue entry is only the lost-response copy, so remove it.
                sent += 1;
                continue;
            }

            const attempts = Number(item.attempts || 0) + 1;
            const message = errorMessage(error);
            if (isTransientNetworkFailure(error)) {
                remaining.push({
                    ...item,
                    attempts,
                    status: "retrying",
                    nextRetryAt: Date.now() + retryDelayMs(attempts),
                    lastError: message
                });
                remaining.push(...mine.slice(index + 1));
                break;
            }

            // 4xx business/validation errors are not connectivity failures.
            // Keep them blocked so they cannot spam the API every few seconds.
            remaining.push({
                ...item,
                attempts,
                status: "blocked",
                nextRetryAt: Number.MAX_SAFE_INTEGER,
                lastError: message
            });
        }
    }

    writeAll([...others, ...remaining]);
    return { sent, remaining: remaining.length };
}
