const TRANSIENT_CODES=new Set(["ERR_NETWORK","ECONNABORTED","ETIMEDOUT","ECONNRESET"]);
export function isRetryableTransientFailure(error: unknown): boolean {
 const e=error as any; const status=Number(e?.response?.status||0);
 return !e?.response || TRANSIENT_CODES.has(String(e?.code||"")) || [408,429,502,503,504].includes(status);
}
export function transientRetryDelayMs(attempt=0): number { return Math.min(1500,250*Math.pow(2,Math.max(0,attempt))); }
export function waitForTransientRetry(attempt=0): Promise<void> {
 return new Promise(r=>setTimeout(r,transientRetryDelayMs(attempt)));
}
