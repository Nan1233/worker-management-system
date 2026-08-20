import {
    useEffect,
    useState
} from "react";

import {
    useNavigate
} from "react-router-dom";

import axios from "axios";

import { clearAuthSession, getStoredUser } from "../../utils/authStorage";

import {
    getCurrentWorker
} from "../../services/workerService";

import { prefetchProcessMasterData } from "../../services/masterDataCache";

import type {
    WorkerProfile
} from "../../types/worker";

import { PROCESS_SELECTIONS } from "./processFormSchemas";
import { workerCanAccessProcess } from "../../utils/processAccess";
import AppIcon, { type IconName } from "../../components/common/AppIcon";
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
    icon: item.icon,
    visualIcon: processIconMap[item.processCode] ?? "process",
    description: item.description,
}));


function SelectProcess() {

    const navigate =
        useNavigate();


    const [
        worker,
        setWorker
    ] = useState<WorkerProfile | null>(
        null
    );


    const [
        loading,
        setLoading
    ] = useState(true);


    const [
        error,
        setError
    ] = useState("");


    useEffect(() => {

        const loadWorker =
            async () => {

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

                        setError(
                            "Thông tin tài khoản không hợp lệ"
                        );

                        return;

                    }


                    const workerData =
                        await getCurrentWorker(true);


                    setWorker(
                        workerData
                    );

                }
                catch (err: unknown) {

                    console.error(
                        "LOAD WORKER ERROR:",
                        err
                    );


                    if (
                        axios.isAxiosError(
                            err
                        )
                        &&
                        err.response?.status
                        ===
                        401
                    ) {

                        clearAuthSession({ bumpEpoch: false });

                        navigate(
                            "/login",
                            {
                                replace: true
                            }
                        );

                        return;

                    }


                    setError(

                        axios.isAxiosError(
                            err
                        )

                            ? err.response
                                ?.data
                                ?.message

                                ||

                                "Không thể tải thông tin nhân viên"

                            : "Không thể tải thông tin nhân viên"

                    );

                }
                finally {

                    setLoading(false);

                }

            };


        void loadWorker();

    }, [navigate]);


    const availableProcesses = allProcesses.filter((item) =>
        workerCanAccessProcess(worker, item.dbId, item.code)
    );

    // A worker with one assigned process should go directly from the
    // production CTA to the real production form. Keep the selector only
    // when multiple processes are actually available.
    useEffect(() => {
        if (loading || error || availableProcesses.length !== 1) return;

        const item = availableProcesses[0];
        if (!item) return;

        if (item.dbId) prefetchProcessMasterData(item.dbId);
        navigate(`/worker/process/${item.id}`, { replace: true });
    }, [availableProcesses.length, availableProcesses[0]?.id, availableProcesses[0]?.dbId, error, loading, navigate]);


    if (loading) {

        return (

            <main className="select-process-page worker-process-page">

                <div className="process-state-box">

                    Đang tải thông tin...

                </div>

            </main>

        );

    }


    if (error) {

        return (

            <main className="select-process-page worker-process-page">

                <div className="process-state-box">

                    <h2>
                        Không thể mở trang
                    </h2>

                    <p>
                        {error}
                    </p>

                </div>

            </main>

        );

    }


    return (

        <main className="select-process-page worker-process-page">

            <div className="select-process-shell worker-surface">

                <header className="select-process-header">

                    <div className="select-process-title-row">

                        <button
                            type="button"
                            className="select-process-back"
                            onClick={() =>
                                navigate(-1)
                            }
                            aria-label="Quay lại"
                        >
                            ←
                        </button>


                        <h1>
                            Chọn mẫu nhập liệu
                        </h1>

                    </div>


                    <div className="select-process-worker">

                        <strong>

                            {
                                worker?.full_name
                                ||
                                "Công nhân"
                            }

                        </strong>


                        <span>

                            MNV:
                            {" "}

                            {
                                worker?.worker_code
                                ||
                                "---"
                            }

                        </span>


                        <span className="select-process-training">

                            Học việc:
                            {" "}

                            {
                                worker?.training_percent
                                ??
                                100
                            }

                            %

                        </span>

                    </div>

                </header>


                <button
                    type="button"
                    className="history-entry-button"
                    onClick={() =>
                        navigate(
                            "/worker/history"
                        )
                    }
                >
                    <span className="history-entry-button__icon" aria-hidden="true">
                        <AppIcon name="history" size={16} />
                    </span>
                    <span>Danh sách lịch sử nhập</span>
                </button>


                <section className="process-list">

                    {
                        availableProcesses.length > 0 ? availableProcesses.map(
                            (item) => (

                                <button
                                    key={item.id}
                                    type="button"
                                    className="worker-process-card worker-card"
                                    onPointerEnter={() => item.dbId && prefetchProcessMasterData(item.dbId)}
                                    onFocus={() => item.dbId && prefetchProcessMasterData(item.dbId)}
                                    onTouchStart={() => item.dbId && prefetchProcessMasterData(item.dbId)}
                                    onClick={() => {
                                        if (item.dbId) prefetchProcessMasterData(item.dbId);
                                        navigate(`/worker/process/${item.id}`);
                                    }}
                                >

                                    <span className="worker-process-icon">

                                        <AppIcon name={item.visualIcon} size={22} />

                                    </span>


                                    <span className="worker-process-content">

                                        <strong>
                                            {item.name}
                                        </strong>

                                        <small>
                                            {item.description}
                                        </small>

                                    </span>


                                    <span className="worker-process-arrow">

                                        ›

                                    </span>

                                </button>

                            )
                        ) : (
                            <div className="process-state-box">
                                <h2>Chưa được phân công công đoạn</h2>
                                <p>Vui lòng liên hệ quản lý để được gán đúng công đoạn trước khi nhập báo cáo.</p>
                            </div>
                        )
                    }

                </section>

            </div>

        </main>

    );

}


export default SelectProcess;
