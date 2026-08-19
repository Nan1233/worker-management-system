export const REQUEST_RETRY_EVENT="ktc:request-retry";
export function emitRequestRetry(detail:unknown):void {
 try { window.dispatchEvent(new CustomEvent(REQUEST_RETRY_EVENT,{detail})); } catch { /* non-browser */ }
}
