import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import AppIcon, { type IconName } from "../../components/common/AppIcon";
import { prefetchProcessMasterData } from "../../services/masterDataCache";
import { getCurrentWorker } from "../../services/workerService";
import type { WorkerProfile } from "../../types/worker";
import { clearAuthSession, getStoredUser } from "../../utils/authStorage";
import { workerCanAccessProcess } from "../../utils/processAccess";
import { PROCESS_SELECTIONS } from "./processFormSchemas";

import "./SelectProcess.css";

const processIconMap: Record<string, IconName> = {
    GC: "cut",
    MAI: "grind",
    DO: "caliper",
    K1: "inspect",
    K2: "verify",
    CAN: "roller",
    EP: "press",
    XLBV: "deburr",
    SX3: "assembly",
};

const allProcesses = PROCESS_SELECTIONS.map((item) => ({
    id: item.slug,
    dbId: item.processId,
    code: item.processCode,
    name: item.name,
    visualIcon: processIconMap[item.processCode] ?? "process",
    description: item.description,
}));

function SelectProcess() {
    const navigate = useNavigate();
    const [worker, setWorker] = useState<WorkerProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const loadWorker = async () => {
            try {
                setLoading(true);
                setError("");

                const user = getStoredUser();

                if (!user) {
                    clearAuthSession({ bumpEpoch: false });
                    navigate("/login", { replace: true });
                    return;
                }

                if (user.role !== "worker") {
                    setError("Thông tin tài khoản không hợp lệ");
                    return;
                }

                const workerData = await getCurrentWorker(true);
                setWorker(workerData);
            }
            catch (err: unknown) {
                console.error("LOAD WORKER ERROR:", err);

                if (
                    axios.isAxiosError(err)
                    && err.response?.status === 401
                ) {
                    clearAuthSession({ bumpEpoch: false });
                    navigate("/login", { replace: true });
                    return;
                }

                setError(
                    axios.isAxiosError(err)
                        ? err.response?.data?.message || "Không thể tải thông tin nhân viên"
                        : "Không thể tải thông tin nhân viên"
                );
            }
            finally {
                setLoading(false);
            }
        };

        void loadWorker();
    }, [navigate]);

    if (loading) {
        return (
            <main className="select-process-page">
                <div className="process-state-box" role="status" aria-live="polite">
                    <span className="process-state-box__spinner" aria-hidden="true" />
                    <h1>Đang tải công đoạn</h1>
                    <p>Vui lòng chờ trong giây lát.</p>
                </div>
            </main>
        );
    }

    if (error) {
        return (
            <main className="select-process-page">
                <div className="process-state-box process-state-box--error" role="alert">
                    <span className="process-state-box__icon" aria-hidden="true">
                        <AppIcon name="warning" size={22} />
                    </span>
                    <h1>Không thể mở trang</h1>
                    <p>{error}</p>
                </div>
            </main>
        );
    }

    const availableProcesses = allProcesses.filter((item) =>
        workerCanAccessProcess(worker, item.dbId, item.code)
    );

    return (
        <main className="select-process-page">
            <div className="select-process-shell">
                <header className="select-process-header">
                    <div className="select-process-heading">
                        <div className="select-process-title-row">
                            <button
                                type="button"
                                className="select-process-back"
                                onClick={() => navigate(-1)}
                                aria-label="Quay lại"
                                title="Quay lại"
                            >
                                <span aria-hidden="true">←</span>
                            </button>

                            <div>
                                <p className="select-process-eyebrow">Báo cáo sản xuất</p>
                                <h1>Chọn công đoạn</h1>
                            </div>
                        </div>

                        <p className="select-process-instruction">
                            Chọn công đoạn bạn đang thực hiện để bắt đầu nhập báo cáo.
                        </p>
                    </div>

                    <div className="select-process-worker" aria-label="Thông tin công nhân">
                        <span className="select-process-worker__avatar" aria-hidden="true">
                            <AppIcon name="user" size={18} />
                        </span>
                        <span className="select-process-worker__identity">
                            <strong title={worker?.full_name || "Công nhân"}>
                                {worker?.full_name || "Công nhân"}
                            </strong>
                            <span>MNV: {worker?.worker_code || "---"}</span>
                        </span>
                        <span className="select-process-training">
                            Học việc {worker?.training_percent ?? 100}%
                        </span>
                    </div>
                </header>

                <div className="select-process-toolbar">
                    <p className="select-process-count" aria-live="polite">
                        {availableProcesses.length > 0
                            ? `${availableProcesses.length} công đoạn được phân công`
                            : "Chưa có công đoạn được phân công"}
                    </p>

                    <button
                        type="button"
                        className="history-entry-button"
                        onClick={() => navigate("/worker/history")}
                    >
                        <span className="history-entry-button__icon" aria-hidden="true">
                            <AppIcon name="history" size={17} />
                        </span>
                        <span>Xem lịch sử nhập</span>
                    </button>
                </div>

                <section className="process-list" aria-label="Danh sách công đoạn">
                    {availableProcesses.length > 0 ? availableProcesses.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className="worker-process-card"
                            onPointerEnter={() => item.dbId && prefetchProcessMasterData(item.dbId)}
                            onFocus={() => item.dbId && prefetchProcessMasterData(item.dbId)}
                            onTouchStart={() => item.dbId && prefetchProcessMasterData(item.dbId)}
                            onClick={() => {
                                if (item.dbId) prefetchProcessMasterData(item.dbId);
                                navigate(`/worker/process/${item.id}`);
                            }}
                            aria-label={`Chọn công đoạn ${item.name}`}
                        >
                            <span className="worker-process-icon" aria-hidden="true">
                                <AppIcon name={item.visualIcon} size={24} />
                            </span>

                            <span className="worker-process-content">
                                <strong>{item.name}</strong>
                                <small>{item.description}</small>
                            </span>

                            <span className="worker-process-arrow" aria-hidden="true">→</span>
                        </button>
                    )) : (
                        <div className="process-state-box process-state-box--empty">
                            <span className="process-state-box__icon" aria-hidden="true">
                                <AppIcon name="process" size={22} />
                            </span>
                            <h2>Chưa được phân công công đoạn</h2>
                            <p>Vui lòng liên hệ quản lý để được gán đúng công đoạn trước khi nhập báo cáo.</p>
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}

export default SelectProcess;
