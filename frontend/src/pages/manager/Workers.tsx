import {
    useEffect,
    useMemo,
    useState
} from "react";

import axios from "axios";

import {

    getAllWorkers,

    updateWorkerTrainingPercent

} from "../../services/workerService";

import type {
    WorkerProfile
} from "../../types/worker";

import { useToast } from "../../components/feedback/toastContext";
import { usePermissions } from "../../hooks/usePermissions";

function Workers() {
    const { showToast } = useToast();
    const { can } = usePermissions();
    const canEdit = can("USER_EDIT");

    const [
        workers,
        setWorkers
    ] = useState<WorkerProfile[]>(
        []
    );


    const [
        loading,
        setLoading
    ] = useState(true);


    const [
        savingWorkerId,
        setSavingWorkerId
    ] = useState<number | null>(
        null
    );


    const [
        error,
        setError
    ] = useState("");


    const [
        searchKeyword,
        setSearchKeyword
    ] = useState("");


    const [
        editingWorkerId,
        setEditingWorkerId
    ] = useState<number | null>(
        null
    );


    const [
        trainingValue,
        setTrainingValue
    ] = useState("");


    // =================================================
    // LOAD DANH SÁCH
    // =================================================

    useEffect(() => {

        const loadWorkers =
            async () => {

                try {

                    setLoading(
                        true
                    );

                    setError(
                        ""
                    );


                    const data =
                        await getAllWorkers();


                    setWorkers(
                        data
                    );

                }
                catch (err: unknown) {

                    console.error(
                        "LOAD WORKERS ERROR:",
                        err
                    );


                    const message =

                        axios.isAxiosError(
                            err
                        )

                            ? err.response
                                ?.data
                                ?.message

                                ||

                                "Không thể tải danh sách công nhân"

                            : err instanceof Error

                                ? err.message

                                : "Không thể tải danh sách công nhân";


                    setError(
                        message
                    );

                }
                finally {

                    setLoading(
                        false
                    );

                }

            };


        void loadWorkers();

    }, []);


    // =================================================
    // TÌM KIẾM
    // =================================================

    const filteredWorkers =
        useMemo(() => {

            const keyword =
                searchKeyword
                    .trim()
                    .toLowerCase();


            if (!keyword) {

                return workers;

            }


            return workers.filter(
                (worker) => {

                    const searchText = [

                        worker.worker_code,

                        worker.full_name,

                        worker.department
                        ??
                        "",

                        worker.position
                        ??
                        "",

                        worker.phone
                        ??
                        ""

                    ]
                        .join(" ")
                        .toLowerCase();


                    return searchText.includes(
                        keyword
                    );

                }
            );

        }, [
            workers,
            searchKeyword
        ]);


    // =================================================
    // MỞ Ô SỬA
    // =================================================

    const startEditing = (
        worker: WorkerProfile
    ) => {

        setEditingWorkerId(
            worker.worker_id
        );


        setTrainingValue(
            String(
                worker.training_percent
            )
        );

    };


    // =================================================
    // HỦY SỬA
    // =================================================

    const cancelEditing = () => {

        setEditingWorkerId(
            null
        );


        setTrainingValue(
            ""
        );

    };


    // =================================================
    // LƯU % HỌC VIỆC
    // =================================================

    const saveTrainingPercent =
        async (
            worker: WorkerProfile
        ) => {

            const value =
                Number(
                    trainingValue
                );


            if (
                trainingValue.trim() === ""
                ||
                !Number.isFinite(
                    value
                )
                ||
                value < 0
                ||
                value > 100
            ) {

                showToast(
                    "% học việc phải từ 0 đến 100"
                );

                return;

            }


            try {

                setSavingWorkerId(
                    worker.worker_id
                );


                await updateWorkerTrainingPercent(

                    worker.worker_id,

                    value

                );


                setWorkers(
                    (prev) =>

                        prev.map(
                            (item) =>

                                item.worker_id
                                ===
                                worker.worker_id

                                    ? {

                                        ...item,

                                        training_percent:
                                            value

                                    }

                                    : item
                        )
                );


                setEditingWorkerId(
                    null
                );


                setTrainingValue(
                    ""
                );


                showToast("Cập nhật % học việc thành công", "success");

            }
            catch (err: unknown) {

                console.error(
                    "UPDATE TRAINING PERCENT ERROR:",
                    err
                );


                const message =

                    axios.isAxiosError(
                        err
                    )

                        ? err.response
                            ?.data
                            ?.message

                            ||

                            "Không thể cập nhật % học việc"

                        : err instanceof Error

                            ? err.message

                            : "Không thể cập nhật % học việc";


                showToast(
                    message
                );

            }
            finally {

                setSavingWorkerId(
                    null
                );

            }

        };


    return (

        <section className="management-workers-page poketto-manager-page">

            <header className="management-workers-header">

                <div>

                    <h1>
                        Danh sách công nhân
                    </h1>

                    <p>
                        Theo dõi và cập nhật phần trăm học việc
                    </p>

                </div>


                <div className="management-workers-count">

                    <strong>
                        {filteredWorkers.length}
                    </strong>

                    <span>
                        công nhân
                    </span>

                </div>

            </header>


            <div className="management-workers-toolbar">

                <input
                    type="search"
                    value={
                        searchKeyword
                    }
                    onChange={(event) =>
                        setSearchKeyword(
                            event.target.value
                        )
                    }
                    placeholder="Tìm mã, tên, bộ phận..."
                    autoComplete="off"
                />

            </div>


            {
                error
                && (

                    <div className="management-workers-error">

                        {error}

                    </div>

                )
            }


            {
                loading

                    ? (

                        <div className="management-workers-state">

                            Đang tải danh sách công nhân...

                        </div>

                    )

                    : filteredWorkers.length
                    ===
                    0

                        ? (

                            <div className="management-workers-state">

                                Không tìm thấy công nhân

                            </div>

                        )

                        : (

                            <div className="management-workers-table-wrapper">

                                <table className="management-workers-table">

                                    <thead>

                                        <tr>

                                            <th>
                                                Mã NV
                                            </th>

                                            <th>
                                                Họ và tên
                                            </th>

                                            <th>
                                                Bộ phận
                                            </th>

                                            <th>
                                                Vị trí
                                            </th>

                                            <th>
                                                % học việc
                                            </th>

                                            <th>
                                                Trạng thái
                                            </th>

                                            {canEdit && <th>
                                                Thao tác
                                            </th>}

                                        </tr>

                                    </thead>


                                    <tbody>

                                        {
                                            filteredWorkers.map(
                                                (worker) => {

                                                    const isEditing =
                                                        editingWorkerId
                                                        ===
                                                        worker.worker_id;


                                                    const isSaving =
                                                        savingWorkerId
                                                        ===
                                                        worker.worker_id;


                                                    return (

                                                        <tr
                                                            key={
                                                                worker.worker_id
                                                            }
                                                        >

                                                            <td data-label="Mã NV">

                                                                <strong>

                                                                    {
                                                                        worker.worker_code
                                                                    }

                                                                </strong>

                                                            </td>


                                                            <td data-label="Họ và tên">

                                                                {
                                                                    worker.full_name
                                                                }

                                                            </td>


                                                            <td data-label="Bộ phận">

                                                                {
                                                                    worker.department
                                                                    ||
                                                                    "---"
                                                                }

                                                            </td>


                                                            <td data-label="Vị trí">

                                                                {
                                                                    worker.position
                                                                    ||
                                                                    "---"
                                                                }

                                                            </td>


                                                            <td data-label="% học việc">

                                                                {
                                                                    isEditing

                                                                        ? (

                                                                            <div className="training-edit-box">

                                                                                <input
                                                                                    type="number"
                                                                                    min="0"
                                                                                    max="100"
                                                                                    step="1"
                                                                                    value={
                                                                                        trainingValue
                                                                                    }
                                                                                    onChange={(event) =>
                                                                                        setTrainingValue(
                                                                                            event.target.value
                                                                                        )
                                                                                    }
                                                                                    disabled={
                                                                                        isSaving
                                                                                    }
                                                                                    inputMode="decimal"
                                                                                />

                                                                                <span>
                                                                                    %
                                                                                </span>

                                                                            </div>

                                                                        )

                                                                        : (

                                                                            <span className="training-percent-badge">

                                                                                {
                                                                                    worker.training_percent
                                                                                }

                                                                                %

                                                                            </span>

                                                                        )
                                                                }

                                                            </td>


                                                            <td data-label="Trạng thái">

                                                                <span
                                                                    className={
                                                                        worker.status
                                                                        ===
                                                                        "active"

                                                                            ? "worker-status active"

                                                                            : "worker-status inactive"
                                                                    }
                                                                >

                                                                    {
                                                                        worker.status
                                                                        ===
                                                                        "active"

                                                                            ? "Đang làm"

                                                                            : "Ngừng hoạt động"
                                                                    }

                                                                </span>

                                                            </td>


                                                            {canEdit && <td data-label="Thao tác">

                                                                {
                                                                    isEditing

                                                                        ? (

                                                                            <div className="worker-action-buttons">

                                                                                <button
                                                                                    type="button"
                                                                                    className="worker-save-training"
                                                                                    onClick={() =>
                                                                                        void saveTrainingPercent(
                                                                                            worker
                                                                                        )
                                                                                    }
                                                                                    disabled={
                                                                                        isSaving
                                                                                    }
                                                                                >

                                                                                    {
                                                                                        isSaving
                                                                                            ? "Đang lưu..."
                                                                                            : "Lưu"
                                                                                    }

                                                                                </button>


                                                                                <button
                                                                                    type="button"
                                                                                    className="worker-cancel-training"
                                                                                    onClick={
                                                                                        cancelEditing
                                                                                    }
                                                                                    disabled={
                                                                                        isSaving
                                                                                    }
                                                                                >

                                                                                    Hủy

                                                                                </button>

                                                                            </div>

                                                                        )

                                                                        : (

                                                                            <button
                                                                                type="button"
                                                                                className="worker-edit-training"
                                                                                onClick={() =>
                                                                                    startEditing(
                                                                                        worker
                                                                                    )
                                                                                }
                                                                            >

                                                                                Sửa % học việc

                                                                            </button>

                                                                        )
                                                                }

                                                            </td>}

                                                        </tr>

                                                    );

                                                }
                                            )
                                        }

                                    </tbody>

                                </table>

                            </div>

                        )
            }

        </section>

    );

}


export default Workers;