import axios from "axios";
import type { ProductionReport } from "../types/production";
import { getStoredUser } from "../utils/authStorage";
import { checkSimilarTempReport, createTempReport } from "./productionService";

const STORAGE_KEY = "ktcOfflineReportQueueV1";
const MAX_ITEMS_PER_OWNER = 50;
const MAX_TOTAL_ITEMS = 100;
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
    if (item.status === "blocked" && /trùng|duplicate/i.test(String(item.lastError || ""))) {
        return {
            ...item,
            status: "queued",
            nextRetryAt: Date.now()
        };
    }
    // Do not automatically block old reports. KTC workers can backdate reports
    // within the business-approved window, so queue age alone is not a reason
    // to prevent automatic delivery. Only deterministic server errors may block.
    return item;
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

function isAlreadyCreatedDuplicate(error: unknown, payload: ProductionReport): boolean {
    const data = responseData(error);
    if (!axios.isAxiosError(error) || Number(error.response?.status || 0) !== 409 || !data) return false;
    if (data.code !== "DUPLICATE_CONFIRMATION_REQUIRED" || data.duplicate_reason !== "similar_report") return false;

    const existing = data.data || data.existing_report;
    const existingClient = String(existing?.client_request_id || "").trim();
    const payloadClient = String(payload.client_request_id || "").trim();
    return Boolean(existingClient && payloadClient && existingClient === payloadClient);
}

async function serverAlreadyHasQueuedReport(payload: ProductionReport): Promise<boolean> {
    try {
        const result = await checkSimilarTempReport({
            process_id: payload.process_id,
            work_date: payload.work_date,
            shift: payload.shift,
            machine_no: payload.machine_no,
            product_name: payload.product_name,
        });
        return Boolean(result?.duplicate && result?.data?.id);
    } catch {
        return false;
    }
}

export function getCurrentOfflineQueueItems(): OfflineReportQueueItem[] {
    const owner = currentOwner();
    if (!owner) return [];
    return readAll().filter((item) => ownerMatches(item.owner, owner));
}

let activeFlushPromise: Promise<{ sent: number; remaining: number }> | null = null;

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

async function flushOfflineReportQueueInternal(options: { force?: boolean } = {}): Promise<{ sent: number; remaining: number }> {
    const owner = currentOwner();
    const force = options.force === true;
    if (!owner) {
        return { sent: 0, remaining: 0 };
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
                sent += 1;
                continue;
            }

            const attempts = Number(item.attempts || 0) + 1;
            const message = errorMessage(error);
            const status = Number(axios.isAxiosError(error) ? error.response?.status || 0 : 0);
            if (status === 422 && await serverAlreadyHasQueuedReport(item.payload)) {
                sent += 1;
                continue;
            }

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

export function flushOfflineReportQueue(options: { force?: boolean } = {}): Promise<{ sent: number; remaining: number }> {
    if (activeFlushPromise) return activeFlushPromise;
    activeFlushPromise = flushOfflineReportQueueInternal(options).finally(() => {
        activeFlushPromise = null;
    });
    return activeFlushPromise;
}
