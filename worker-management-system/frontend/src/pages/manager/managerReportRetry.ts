export function isRetryableManagerReportLoadError(error: unknown): boolean {
  const e = error as { response?: { status?: number }; code?: string } | null;
  const status = Number(e?.response?.status || 0);
  return !e?.response || [408,429,502,503,504].includes(status) || ["ERR_NETWORK","ECONNABORTED","ETIMEDOUT"].includes(String(e?.code || ""));
}
export const waitForManagerReportRetry = (ms = 350): Promise<void> =>
  new Promise(resolve => window.setTimeout(resolve, ms));
