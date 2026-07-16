import {
    useEffect,
    useState
} from "react";

import {
    useNavigate
} from "react-router-dom";

import axios from "axios";

import {
    getWorkerByUserId
} from "../../services/workerService";

import type {
    User
} from "../../types/auth";

import type {
    WorkerProfile
} from "../../types/worker";

import "./SelectProcess.css";


const processes = [

    {
        id: "cat-long",
        name: "Cắt / Lồng",
        icon: "🛠",
        description:
            "Dành cho quy trình cắt và lồng"
    },

    {
        id: "mai",
        name: "Mài",
        icon: "◉",
        description:
            "Quy trình mài bóng và hoàn thiện bề mặt"
    },

    {
        id: "kiem-1",
        name: "Kiểm 1",
        icon: "☑",
        description:
            "Kiểm tra chất lượng công đoạn đầu"
    },

    {
        id: "kiem-2",
        name: "Kiểm 2",
        icon: "☷",
        description:
            "Kiểm tra chất lượng công đoạn cuối"
    },

    {
        id: "ep",
        name: "Ép",
        icon: "▱",
        description:
            "Quy trình ép khuôn và tạo hình"
    },

    {
        id: "can",
        name: "Cán",
        icon: "▤",
        description:
            "Quy trình cán mỏng vật liệu"
    },

    {
        id: "bavia",
        name: "BAVIA",
        icon: "✎",
        description:
            "Xử lý bavia và làm sạch sản phẩm"
    }

];


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


                    if (
                        !user.id
                        ||
                        user.role !== "worker"
                    ) {

                        setError(
                            "Thông tin tài khoản không hợp lệ"
                        );

                        return;

                    }


                    const workerData =
                        await getWorkerByUserId(
                            Number(
                                user.id
                            )
                        );


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
                        processes.map(
                            (item) => (

                                <button
                                    key={item.id}
                                    type="button"
                                    className="worker-process-card"
                                    onClick={() =>
                                        navigate(
                                            `/worker/process/${item.id}`
                                        )
                                    }
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
                        )
                    }

                </section>

            </div>

        </main>

    );

}


export default SelectProcess;