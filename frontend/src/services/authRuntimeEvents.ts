export const AUTH_EPOCH_CHANGED_EVENT="ktc:auth-epoch-changed";
export const CONNECTION_LOST_EVENT="ktc:connection-lost";
export const CONNECTION_RESTORED_EVENT="ktc:connection-restored";
export function emitAuthRuntimeEvent(name:string,detail?:unknown):void {
 try { window.dispatchEvent(new CustomEvent(name,{detail})); } catch { /* noop */ }
}
