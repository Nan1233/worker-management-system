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
                            "ThÃ´ng tin tÃ i khoáº£n khÃ´ng há»£p lá»‡"
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

                                "KhÃ´ng thá»ƒ táº£i thÃ´ng tin nhÃ¢n viÃªn"

                            : "KhÃ´ng thá»ƒ táº£i thÃ´ng tin nhÃ¢n viÃªn"

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

            <main className="select-process-page worker-process-page">

                <div className="process-state-box">

                    Äang táº£i thÃ´ng tin...

                </div>

            </main>

        );

    }


    if (error) {

        return (

            <main className="select-process-page worker-process-page">

                <div className="process-state-box">

                    <h2>
                        KhÃ´ng thá»ƒ má»Ÿ trang
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
                            aria-label="Quay láº¡i"
                        >
                            â†
                        </button>


                        <h1>
                            Chá»n máº«u nháº­p liá»‡u
                        </h1>

                    </div>


                    <div className="select-process-worker">

    <strong>

        {
            worker?.full_name
            ||
            "CÃ´ng nhÃ¢n"
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

        Há»c viá»‡c:
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
                    <span>Danh sÃ¡ch lá»‹ch sá»­ nháº­p</span>
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

                                        â€º

                                    </span>

                                </button>

                            )
                        ) : (
                            <div className="process-state-box">
                                <h2>ChÆ°a Ä‘Æ°á»£c phÃ¢n cÃ´ng cÃ´ng Ä‘oáº¡n</h2>
                                <p>Vui lÃ²ng liÃªn há»‡ quáº£n lÃ½ Ä‘á»ƒ Ä‘Æ°á»£c gÃ¡n Ä‘Ãºng cÃ´ng Ä‘oáº¡n trÆ°á»›c khi nháº­p bÃ¡o cÃ¡o.</p>
                            </div>
                        )
                    }

                </section>

            </div>

        </main>

    );

}


export default SelectProcess;
