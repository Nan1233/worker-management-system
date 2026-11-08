import { AxiosHeaders, type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { api } from "./api";
import { getStoredUser } from "../utils/authStorage";
import type { ProductionReport } from "../types/production";

const STORAGE_KEY = "ktcReliableProductionSubmitV1";
const REPLAY_HEADER = "X-KTC-Report-Replay";
const MAX_ITEMS = 100;

interface JournalItem {
    clientRequestId: string;
    createdAt: number;
    owner: {
        userId: number;
        workerId: number | null;
        workerCode: string;
    };
    payload: ProductionReport;
}

interface ReliableRequestConfig extends InternalAxiosRequestConfig {
    _ktcReportJournaled?: boolean;
    _ktcReportOwner?: JournalItem["owner"] | null;
}

function isProductionTempCreate(config?: InternalAxiosRequestConfig | null): boolean {
    if (!config) return false;
    const method = String(config.method || "get").toLowerCase();
    const url = String(config.url || "").split("?")[0].replace(/\/$/, "");
    return method === "post" && (url === "/production-temp" || url.endsWith("/production-temp"));
}

function currentOwner(): JournalItem["owner"] | null {
    const user = getStoredUser();
    if (!user || user.role !== "worker") return null;
    return {
        userId: Number(user.id),
        workerId: user.worker_id == null ? null : Number(user.worker_id),
        workerCode: String(user.worker_code || "").trim().toUpperCase(),
    };
}

function ownerMatches(a: JournalItem["owner"] | null | undefined, b: JournalItem["owner"] | null | undefined): boolean {
    return Boolean(a && b
        && Number.isSafeInteger(a.userId) && a.userId > 0
        && Number.isSafeInteger(b.userId) && b.userId > 0
        && a.userId === b.userId
        && a.workerId === b.workerId
        && a.workerCode === b.workerCode);
}

function readAll(): JournalItem[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        return Array.isArray(parsed) ? parsed.filter((item) => item?.clientRequestId && item?.payload) : [];
    } catch {
        return [];
    }
}

function writeAll(items: JournalItem[]): boolean {
    try {
        if (!items.length) {
            localStorage.removeItem(STORAGE_KEY);
        } else {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        }
        return true;
    } catch (error) {
        // The journal is a best-effort recovery layer. A full browser quota must
        // never prevent an online production report from reaching the backend.
        console.warn("[KTC] Reliable report journal storage is full; continuing without a new journal copy.", error);
        return false;
    }
}

function removeJournalItem(clientRequestId: string, owner: JournalItem["owner"] | null): void {
    if (!owner || !clientRequestId) return;
    const all = readAll();
    const next = all.filter((item) => item.clientRequestId !== clientRequestId || !ownerMatches(item.owner, owner));
    if (next.length === all.length) return;
    // Use the same safe storage wrapper as additions. An unavailable browser
    // storage API must never turn a successful server response into a failure.
    writeAll(next);
}

function payloadFromConfig(config?: InternalAxiosRequestConfig | null): ProductionReport | null {
    if (!config?.data) return null;
    try {
        const data = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        const clientRequestId = String(data?.client_request_id || "").trim();
        if (!clientRequestId) return null;
        return data as ProductionReport;
    } catch {
        return null;
    }
}

function isReplayRequest(config: InternalAxiosRequestConfig): boolean {
    const headers = AxiosHeaders.from(config.headers || {});
    return String(headers.get(REPLAY_HEADER) || "") === "1";
}

function saveBeforeSend(payload: ProductionReport, owner: JournalItem["owner"] | null): void {
    const clientRequestId = String(payload.client_request_id || "").trim();
    if (!owner || !clientRequestId) return;

    const all = readAll();
    if (all.some((item) => item.clientRequestId === clientRequestId && ownerMatches(item.owner, owner))) return;
    if (all.length >= MAX_ITEMS) {
        throw new Error("Thiết bị đang giữ quá nhiều báo cáo chưa xác nhận gửi thành công. Hãy đồng bộ các báo cáo đang chờ trước khi gửi thêm.");
    }

    // Do not block the actual API request when localStorage is full. The form
    // remains the source of truth until the backend responds.
    writeAll([...all, {
        clientRequestId,
        createdAt: Date.now(),
        owner,
        payload,
    }]);
}

async function moveFailedRequestToOfflineQueue(payload: ProductionReport, owner: JournalItem["owner"] | null): Promise<void> {
    // A shared browser can change accounts while the request or dynamic import
    // is in flight. Never move A's report into B's account-owned offline queue.
    if (!ownerMatches(currentOwner(), owner)) return;
    try {
        const queue = await import("./offlineReportQueue");
        if (!ownerMatches(currentOwner(), owner)) return;
        queue.enqueueOfflineReport(payload);
        removeJournalItem(String(payload.client_request_id || ""), owner);
    } catch {
        // Keep the journal when queue storage/import fails. The journal is the
        // last-resort crash/network recovery layer and will be retried by its owner.
    }
}

function isValidationFailure(error: AxiosError): boolean {
    const status = Number(error.response?.status || 0);
    const data = error.response?.data as { errors?: unknown; code?: string } | undefined;
    return status === 422 || (status === 400 && Boolean(data?.errors));
}

function isRetryableNetworkFailure(error: AxiosError): boolean {
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

export function recoverReliableReportJournal(): void {
    const owner = currentOwner();
    if (!owner) return;
    // Do not replay another worker's pending report when devices are shared,
    // and do not delete it: the original worker can recover it after login.
    for (const item of readAll()) {
        if (ownerMatches(item.owner, owner)) {
            void moveFailedRequestToOfflineQueue(item.payload, item.owner);
        }
    }
}

export function initializeReliableReportRecovery(): void {
    void navigator.storage?.persist?.().catch(() => false);

    api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
        if (!isProductionTempCreate(config) || isReplayRequest(config)) return config;

        const payload = payloadFromConfig(config);
        if (!payload) return config;

        const owner = currentOwner();
        saveBeforeSend(payload, owner);
        (config as ReliableRequestConfig)._ktcReportJournaled = true;
        (config as ReliableRequestConfig)._ktcReportOwner = owner;
        return config;
    });

    api.interceptors.response.use(
        (response) => {
            if (isProductionTempCreate(response.config)) {
                const payload = payloadFromConfig(response.config);
                if (payload?.client_request_id) {
                    removeJournalItem(String(payload.client_request_id), (response.config as ReliableRequestConfig)._ktcReportOwner || null);
                }
            }
            return response;
        },
        async (error: AxiosError) => {
            const config = error.config as ReliableRequestConfig | undefined;
            if (!isProductionTempCreate(config)) return Promise.reject(error);
            const payload = payloadFromConfig(config);
            if (!payload?.client_request_id) return Promise.reject(error);

            // Validation/business errors must stay with the form so the worker can
            // correct and resubmit them. They are not offline reports.
            if (isValidationFailure(error)) {
                removeJournalItem(String(payload.client_request_id), config?._ktcReportOwner || null);
                return Promise.reject(error);
            }

            // Deterministic HTTP conflicts (especially 409 duplicate confirmation)
            // are real server responses, not network failures. Keep them in the
            // normal submit flow so the UI can ask for confirmation; never enqueue.
            if (!isRetryableNetworkFailure(error)) {
                removeJournalItem(String(payload.client_request_id), config?._ktcReportOwner || null);
                return Promise.reject(error);
            }

            // Only genuine transport/transient failures enter the offline queue.
            // client_request_id makes this recovery idempotent if the backend
            // received the request before the connection died.
            await moveFailedRequestToOfflineQueue(payload, config?._ktcReportOwner || null);
            return Promise.reject(error);
        }
    );

    const recover = () => recoverReliableReportJournal();
    window.addEventListener("online", recover);
    window.addEventListener("storage", (event) => {
        if (event.key === STORAGE_KEY) recover();
    });
    window.setTimeout(recover, 0);
    window.setInterval(recover, 30_000);
}

export function clearReliableReportJournal(clientRequestId: string): void {
    removeJournalItem(String(clientRequestId || ""), currentOwner());
}
