import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2, Lock, RefreshCw } from "lucide-react";

// Shared loading / empty / error / permission-denied states for every Master Control module.

export function ControlLoading({ label = "Đang tải dữ liệu..." }: { label?: string }) {
    return <div className="mcc-state" role="status" aria-live="polite"><Loader2 size={18} className="mcc-spin" aria-hidden="true" /><span>{label}</span></div>;
}

export function ControlEmpty({ title, children }: { title: string; children?: ReactNode }) {
    return <div className="mcc-state mcc-state-empty"><Inbox size={20} aria-hidden="true" /><div><strong>{title}</strong>{children ? <p>{children}</p> : null}</div></div>;
}

export function ControlError({ message, onRetry }: { message: string; onRetry?: () => void }) {
    return <div className="mcc-state mcc-state-error" role="alert"><AlertTriangle size={20} aria-hidden="true" /><div><strong>Không tải được dữ liệu</strong><p>{message}</p></div>{onRetry ? <button type="button" className="mcc-btn" onClick={onRetry}><RefreshCw size={14} aria-hidden="true" />Thử lại</button> : null}</div>;
}

export function ControlDenied({ message = "Tài khoản hiện tại không có quyền truy cập chức năng này." }: { message?: string }) {
    return <div className="mcc-state mcc-state-denied" role="alert"><Lock size={20} aria-hidden="true" /><div><strong>Không có quyền truy cập</strong><p>{message}</p></div></div>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
    return <header className="mcc-page-header"><div><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{actions ? <div className="mcc-page-actions">{actions}</div> : null}</header>;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "success" | "warning" | "danger" | "info"; children: ReactNode }) {
    return <span className={`mcc-badge mcc-badge-${tone}`}>{children}</span>;
}
