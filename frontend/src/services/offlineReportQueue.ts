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

export interface OfflineReportQueueItem {
    id: string;
    owner: QueueOwner;
    createdAt: number;
    attempts: number;
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
    return !error.response || error.code === "ERR_NETWORK" || error.code === "ECONNABORTED";
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

    for (const item of mine) {
        try {
            await createTempReport(item.payload);
            sent += 1;
        } catch (error) {
            if (isTransientNetworkFailure(error)) {
                remaining.push({ ...item, attempts: item.attempts + 1 });
                break;
            }
            // Server-side validation/auth errors require manual review; keep item instead of losing production data.
            remaining.push({ ...item, attempts: item.attempts + 1 });
        }
    }

    // Preserve any unprocessed items after a transient failure.
    const processed = sent + remaining.length;
    if (processed < mine.length) remaining.push(...mine.slice(processed));
    writeAll([...others, ...remaining]);
    return { sent, remaining: remaining.length };
}
