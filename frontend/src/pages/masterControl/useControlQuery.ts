import { useCallback, useEffect, useRef, useState } from "react";
import { getApiError } from "../../utils/apiError";
import { isForbidden } from "./controlFormat";

export interface ControlQueryState<T> {
    data: T | null;
    loading: boolean;
    error: string;
    forbidden: boolean;
    reload: () => void;
}

/**
 * Loads one Master Control resource. `key` identifies the request (e.g. serialized filters); a new key
 * refetches and responses from older requests are ignored.
 */
export function useControlQuery<T>(fetcher: () => Promise<T>, key: string): ControlQueryState<T> {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [forbidden, setForbidden] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const sequence = useRef(0);
    const fetcherRef = useRef(fetcher);
    useEffect(() => { fetcherRef.current = fetcher; });

    useEffect(() => {
        const current = ++sequence.current;
        setLoading(true);
        setError("");
        setForbidden(false);
        fetcherRef.current().then((result) => {
            if (current !== sequence.current) return;
            setData(result);
        }).catch((err: unknown) => {
            if (current !== sequence.current) return;
            setForbidden(isForbidden(err));
            setError(getApiError(err, "Không tải được dữ liệu").message);
        }).finally(() => {
            if (current === sequence.current) setLoading(false);
        });
    }, [key, attempt]);

    const reload = useCallback(() => setAttempt((value) => value + 1), []);
    return { data, loading, error, forbidden, reload };
}
