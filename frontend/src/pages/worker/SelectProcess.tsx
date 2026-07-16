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
        id: "gia-cong",
        name: "Gia công",
        icon: "⚙️",
        description: "Nhập báo cáo gia công"
    },

    {
        id: "mai",
        name: "Mài",
        icon: "🛠️",
        description: "Nhập báo cáo mài"
    },

    {
        id: "kiem-1",
        name: "Kiểm 1",
        icon: "🔍",
        description: "Kiểm tra chất lượng lần 1"
    },

    {
        id: "kiem-2",
        name: "Kiểm 2",
        icon: "✅",
        description: "Kiểm tra chất lượng lần 2"
    },

    {
        id: "ep",
        name: "Ép",
        icon: "🏭",
        description: "Nhập báo cáo ép"
    },

    {
        id: "can",
        name: "Cán",
        icon: "📦",
        description: "Nhập báo cáo cán"
    },

    {
        id: "bavia",
        name: "Bavia",
        icon: "✂️",
        description: "Nhập báo cáo bavia"
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
                        JSON.parse(savedUser);


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
                            Number(user.id)
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
                        axios.isAxiosError(err)
                    ) {

                        const status =
                            err.response?.status;


                        if (
                            status === 401
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

                            err.response?.data?.message

                            ||

                            "Không thể tải thông tin nhân viên"

                        );

                    }
                    else {

                        setError(
                            "Không thể tải thông tin nhân viên"
                        );

                    }

                }
                finally {

                    setLoading(false);

                }

            };


        void loadWorker();

    }, [navigate]);


    if (loading) {

        return (

            <div className="select-process">

                <div className="page-header">

                    <h2>
                        Đang tải thông tin...
                    </h2>

                </div>

            </div>

        );

    }


    if (error) {

        return (

            <div className="select-process">

                <div className="page-header">

                    <h2>
                        Không thể mở trang chủ
                    </h2>


                    <p>
                        {error}
                    </p>

                </div>

            </div>

        );

    }


    return (

        <div className="select-process">


            <div className="page-header">

                <h2>
                    Xin chào, {
                        worker?.full_name
                        ||
                        "Công nhân"
                    }
                </h2>


                <p>
                    Chọn công đoạn bạn đang làm để bắt đầu nhập báo cáo.
                </p>

            </div>


            <div className="process-grid">

                {
                    processes.map(
                        (item) => (

                            <button
                                key={item.id}
                                type="button"
                                className="process-card"
                                onClick={() =>
                                    navigate(
                                        `/worker/process/${item.id}`
                                    )
                                }
                            >

                                <div className="process-icon">

                                    {item.icon}

                                </div>


                                <h3>
                                    {item.name}
                                </h3>


                                <p>
                                    {item.description}
                                </p>

                            </button>

                        )
                    )
                }

            </div>

        </div>

    );

}


export default SelectProcess;
