import { createContext, useContext } from "react";

export type ToastType = "success" | "error" | "warning" | "info";
export type ToastContextValue = { showToast: (message: string, type?: ToastType) => void };
export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) throw new Error("useToast phải được dùng bên trong ToastProvider");
    return context;
}
