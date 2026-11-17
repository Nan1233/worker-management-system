import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

import { useToast } from "../../components/feedback/toastContext";
import { getCurrentWorker } from "../../services/workerService";
import type { WorkerProfile } from "../../types/worker";
import { clearAuthSession, getStoredUser } from "../../utils/authStorage";
import { workerCanAccessProcess } from "../../utils/processAccess";
import { getProcessFormSchema } from "./processFormSchemas";
import type { FormState } from "./processPageConfig";

/**
 * Owns the worker profile request and its authentication/process-access guard.
 * The page keeps ownership of the production form: only identity fields are
 * synchronized here. A request-sequence guard ignores stale responses.
 */
export function useProcessWorkerProfile(
    process: string,
    setForm: Dispatch<SetStateAction<FormState>>,
) {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const requestSequence = useRef(0);
    const [worker, setWorker] = useState<WorkerProfile | null>(null);
    const [loadingWorker, setLoadingWorker] = useState(true);

    useEffect(() => {
        const sequence = ++requestSequence.current;
        const isCurrent = () => requestSequence.current === sequence;

        const loadWorker = async () => {
            try {
                setLoadingWorker(true);
                if (!getStoredUser()) {
                    clearAuthSession({ bumpEpoch: false });
                    navigate("/login", { replace: true });
                    return;
                }

                const profile = await getCurrentWorker();
                const schema = getProcessFormSchema(process);
                if (!workerCanAccessProcess(profile, schema.processId, schema.processCode)) {
                    showToast("Bạn chưa được phân công công đoạn này.", "error");
                    navigate("/worker/process", { replace: true });
                    return;
                }

                if (!isCurrent()) return;
                setWorker(profile);
                setForm(previous => ({
                    ...previous,
                    workerCode: profile.worker_code || "",
                    workerName: profile.full_name || "",
                    trainingPercent: profile.training_percent !== null && profile.training_percent !== undefined
                        ? String(profile.training_percent)
                        : "",
                }));
            } catch (error: unknown) {
                if (!isCurrent()) return;
                console.error("LOAD WORKER ERROR:", error);
                if (axios.isAxiosError(error) && error.response?.status === 401) {
                    clearAuthSession({ bumpEpoch: false });
                    navigate("/login", { replace: true });
                    return;
                }

                const message = axios.isAxiosError(error)
                    ? error.response?.data?.message || "Không lấy được thông tin nhân viên"
                    : error instanceof Error
                        ? error.message
                        : "Không lấy được thông tin nhân viên";
                showToast(message);
            } finally {
                if (isCurrent()) setLoadingWorker(false);
            }
        };

        void loadWorker();
        return () => {
            // Invalidate in-flight requests when switching process or unmounting.
            requestSequence.current += 1;
        };
    }, [navigate, process, setForm, showToast]);

    return { worker, loadingWorker };
}
