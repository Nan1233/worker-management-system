import axios, { AxiosHeaders, type AxiosError, type InternalAxiosRequestConfig } from "axios";
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

function readAll(): JournalItem[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        return Array.isArray(parsed) ? parsed.filter((item) => item?.clientRequestId && item?.payload) : [];
    } catch {
        return [];
    }
}

function writeAll(items: JournalItem[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function removeJournalItem(clientRequestId: string): void {
    const next = readAll().filter((item) => item.clientRequestId !== clientRequestId);
    if (next.length) writeAll(next);
    else localStorage.removeItem(STORAGE_KEY);
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

function saveBeforeSend(payload: ProductionReport): void {
    const owner = currentOwner();
    const clientRequestId = String(payload.client_request_id || "").trim();
    if (!owner || !clientRequestId) return;

    const all = readAll();
    if (all.some((item) => item.clientRequestId === clientRequestId)) return;
    if (all.length >= MAX_ITEMS) {
        throw new Error("Thiết bị đang giữ quá nhiều báo cáo chưa xác nhận gửi thành công. Hãy đồng bộ các báo cáo đang chờ trước khi gửi thêm.");
    }

    writeAll([...all, {
        clientRequestId,
        createdAt: Date.now(),
        owner,
        payload,
    }]);
}

async function moveFailedRequestToOfflineQueue(payload: ProductionReport): Promise<void> {
    try {
        const queue = await import("./offlineReportQueue");
        queue.enqueueOfflineReport(payload);
        removeJournalItem(String(payload.client_request_id || ""));
    } catch {
        // Keep the journal when queue storage/import fails. The journal is the
        // last-resort crash/network recovery layer and will be retried on startup.
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
    const items = readAll();
    if (!items.length) return;
    for (const item of items) {
        void moveFailedRequestToOfflineQueue(item.payload);
    }
}

export function initializeReliableReportRecovery(): void {
    void navigator.storage?.persist?.().catch(() => false);

    api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
        if (!isProductionTempCreate(config) || isReplayRequest(config)) return config;

        const payload = payloadFromConfig(config);
        if (!payload) return config;

        saveBeforeSend(payload);
        (config as ReliableRequestConfig)._ktcReportJournaled = true;
        return config;
    });

    api.interceptors.response.use(
        (response) => {
            if (isProductionTempCreate(response.config)) {
                const payload = payloadFromConfig(response.config);
                if (payload?.client_request_id) {
                    removeJournalItem(String(payload.client_request_id));
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
                removeJournalItem(String(payload.client_request_id));
                return Promise.reject(error);
            }

            // Deterministic HTTP conflicts (especially 409 duplicate confirmation)
            // are real server responses, not network failures. Keep them in the
            // normal submit flow so the UI can ask for confirmation; never enqueue.
            if (!isRetryableNetworkFailure(error)) {
                removeJournalItem(String(payload.client_request_id));
                return Promise.reject(error);
            }

            // Only genuine transport/transient failures enter the offline queue.
            // client_request_id makes this recovery idempotent if the backend
            // received the request before the connection died.
            await moveFailedRequestToOfflineQueue(payload);
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
    removeJournalItem(String(clientRequestId || ""));
}
