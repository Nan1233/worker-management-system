import { useEffect, useState } from "react";

/**
 * Presentation adapter for browser connectivity hints.
 * The submit use case still checks navigator.onLine at the time of sending:
 * this hook only keeps the worker UI indicator in sync.
 */
export function useProcessOnlineStatus(): boolean {
    const [isOnline, setIsOnline] = useState(() => navigator.onLine);

    useEffect(() => {
        const online = () => setIsOnline(true);
        const offline = () => setIsOnline(false);
        window.addEventListener("online", online);
        window.addEventListener("offline", offline);
        return () => {
            window.removeEventListener("online", online);
            window.removeEventListener("offline", offline);
        };
    }, []);

    return isOnline;
}
