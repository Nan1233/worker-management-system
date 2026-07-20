import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import "./toast.css";

type ToastType = "success" | "error" | "warning" | "info";
type Toast = { id: string; type: ToastType; message: string };
type ToastContextValue = { showToast: (message: string, type?: ToastType) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

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
            <div className="toast-container" aria-live="polite" aria-atomic="true">
                {toasts.map((toast) => (
                    <button
                        type="button"
                        key={toast.id}
                        className={`toast toast-${toast.type}`}
                        onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
                    >
                        {toast.message}
                    </button>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) throw new Error("useToast phải được dùng bên trong ToastProvider");
    return context;
}
