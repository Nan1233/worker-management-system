import {
    useEffect,
    useState
} from "react";

import {
    useNavigate
} from "react-router-dom";

import axios from "axios";

import {
    getCurrentWorker
} from "../../services/workerService";

import { prefetchProcessMasterData } from "../../services/masterDataCache";

import type {
    User
} from "../../types/auth";

import type {
    WorkerProfile
} from "../../types/worker";

import "./SelectProcess.css";


import { PROCESS_SELECTIONS } from "./processFormSchemas";
import { workerCanAccessProcess } from "../../utils/processAccess";

const allProcesses = PROCESS_SELECTIONS.map((item) => ({
    id: item.slug,
    dbId: item.processId,
    code: item.processCode,
    name: item.name,
    icon: item.icon,
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


                    const savedUser =
                        localStorage.getItem(
                            "user"
                        );


                    if (!savedUser) {

                        localStorage.removeItem(
                            "token"
                        );

                        navigate(
                            "/login",
                            {
                                replace: true
                            }
                        );

                        return;

                    }


                    const user: User =
                        JSON.parse(
                            savedUser
                        );


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

                        localStorage.removeItem(
                            "token"
                        );

                        localStorage.removeItem(
                            "user"
                        );

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


    if (loading) {

        return (

            <main className="select-process-page">

                <div className="process-state-box">

                    Đang tải thông tin...

                </div>

            </main>

        );

    }


    if (error) {

        return (

            <main className="select-process-page">

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


    const availableProcesses = allProcesses.filter((item) =>
        workerCanAccessProcess(worker, item.dbId, item.code)
    );

    return (

        <main className="select-process-page">

            <div className="select-process-shell">

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
                    Danh sách lịch sử nhập
                </button>


                <section className="process-list">

                    {
                        availableProcesses.length > 0 ? availableProcesses.map(
                            (item) => (

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
                                >

                                    <span className="worker-process-icon">

                                        {item.icon}

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