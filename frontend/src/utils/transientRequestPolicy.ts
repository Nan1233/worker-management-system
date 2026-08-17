const TRANSIENT_CODES = new Set(["ERR_NETWORK", "ECONNABORTED", "ETIMEDOUT", "ECONNRESET"]);
const MAX_TRANSIENT_RETRIES = 2;

export function isRetryableTransientFailure(error: unknown): boolean {
    const e = error as any;
    const status = Number(e?.response?.status || 0);
    const retryCount = Number(e?.retryCount || 0);

    // Never auto-retry 429. A rate-limit response is already the backend's
    // protection mechanism; retrying it creates a feedback loop and can
    // consume the entire per-user API quota in seconds.
    if (status === 429) return false;
    if (retryCount >= MAX_TRANSIENT_RETRIES) return false;

    return (
        !e?.response ||
        TRANSIENT_CODES.has(String(e?.code || "")) ||
        [408, 502, 503, 504].includes(status)
    );
}

export function transientRetryDelayMs(attempt = 0): number {
    return Math.min(1500, 250 * Math.pow(2, Math.max(0, attempt)));
}

export function waitForTransientRetry(attempt = 0): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, transientRetryDelayMs(attempt)));
}
