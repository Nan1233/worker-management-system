import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ToastContext, type ToastType } from "./toastContext";

type Toast = { id: string; type: ToastType; message: string };

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType = "info") => {
        const id = crypto.randomUUID();
        setToasts((current) => [...current, { id, type, message }]);
        window.setTimeout(() => {
            setToasts((current) => current.filter((toast) => toast.id !== id));
        }, 4500);
    }, []);

    const value = useMemo(() => ({ showToast }), [showToast]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className="ktc-toast-container" data-ktc-toast-layer="true" aria-live="polite" aria-atomic="true">
                {toasts.map((toast) => (
                    <button
                        type="button"
                        key={toast.id}
                        className={`ktc-toast ktc-toast-${toast.type}`}
                        onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
                    >
                        {toast.message}
                    </button>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
