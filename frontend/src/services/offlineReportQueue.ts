import axios from "axios";
import type { ProductionReport } from "../types/production";
import { getStoredUser } from "../utils/authStorage";
import { createTempReport } from "./productionService";

const STORAGE_KEY = "ktcOfflineReportQueueV1";
const MAX_ITEMS = 25;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

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

function readAll(): OfflineReportQueueItem[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as OfflineReportQueueItem[];
        const now = Date.now();
        return Array.isArray(parsed)
            ? parsed.filter((item) => item?.payload && now - Number(item.createdAt || 0) <= MAX_AGE_MS)
            : [];
    } catch {
        return [];
    }
}

function writeAll(items: OfflineReportQueueItem[]): void {
    const safe = items.slice(-MAX_ITEMS);
    if (!safe.length) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
}

export function isTransientNetworkFailure(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false;
    if (axios.isCancel(error)) return false;
    const status = Number(error.response?.status || 0);
    return !error.response
        || error.code === "ERR_NETWORK"
        || error.code === "ECONNABORTED"
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
    if (existing) return existing;

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
    return item;
}

export function getCurrentOfflineQueueCount(): number {
    const owner = currentOwner();
    if (!owner) return 0;
    return readAll().filter((item) => ownerMatches(item.owner, owner)).length;
}

export async function flushOfflineReportQueue(): Promise<{ sent: number; remaining: number }> {
    const owner = currentOwner();
    if (!owner || !navigator.onLine) return { sent: 0, remaining: getCurrentOfflineQueueCount() };

    const all = readAll();
    const mine = all.filter((item) => ownerMatches(item.owner, owner));
    const others = all.filter((item) => !ownerMatches(item.owner, owner));
    const remaining: OfflineReportQueueItem[] = [];
    let sent = 0;
    const now = Date.now();

    for (let index = 0; index < mine.length; index += 1) {
        const item = mine[index];
        if (item.status === "blocked" || Number(item.nextRetryAt || 0) > now) {
            remaining.push(item);
            continue;
        }
        try {
            await createTempReport(item.payload);
            sent += 1;
        } catch (error) {
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
                // Khi mạng/server đang lỗi, dừng batch để không bắn hàng loạt request thất bại.
                remaining.push(...mine.slice(index + 1));
                break;
            }
            // 4xx nghiệp vụ/auth không tự retry vô hạn. Giữ dữ liệu để worker/manager xử lý thủ công.
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
