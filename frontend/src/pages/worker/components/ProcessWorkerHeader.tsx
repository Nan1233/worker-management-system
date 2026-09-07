import type { ChangeEvent } from "react";

interface DateOption {
    value: string;
    label: string;
}

interface Props {
    processTitle: string;
    workerName: string;
    workerCode: string;
    trainingPercent: string;
    workDate: string;
    dateOptions: DateOption[];
    onBack: () => void;
    onDateChange: (event: ChangeEvent<HTMLSelectElement>) => void;
}

export default function ProcessWorkerHeader({
    processTitle,
    workerName,
    workerCode,
    trainingPercent,
    workDate,
    dateOptions,
    onBack,
    onDateChange,
}: Props) {
    return (
        <div
            className="worker-sticky-context"
            style={{
                position: "sticky",
                top: "58px",
                zIndex: 35,
                background: "#f3f7fc",
            }}
        >
            <style>{`
                /* Compact worker header: never let the training badge wrap on phones. */
                @media (max-width: 680px) {
                    .worker-sticky-training-label { display: none !important; }
                    .worker-sticky-training {
                        display: inline-flex !important;
                        align-items: center;
                        justify-content: center;
                        width: max-content !important;
                        min-width: 42px !important;
                        flex: 0 0 auto !important;
                        white-space: nowrap !important;
                        word-break: keep-all !important;
                    }
                    .worker-sticky-meta {
                        min-width: 0;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    }
                    .worker-sticky-date { min-width: 0; flex: 1 1 auto; }
                    .worker-sticky-date-select {
                        width: 100% !important;
                        min-width: 0 !important;
                    }
                }
            `}</style>
            <header className="worker-form-header">
                <div
                    className="worker-form-title-row"
                    style={{ minWidth: 0, width: "100%", overflow: "hidden" }}
                >
                    <button type="button" className="worker-form-back" onClick={onBack} aria-label="Quay lại">←</button>
                    <h1
                        style={{
                            minWidth: 0,
                            flex: "1 1 auto",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {processTitle}
                    </h1>
                </div>
            </header>

            <div className="worker-sticky-info">
                <div className="worker-sticky-person">
                    <strong>{workerName || "Đang tải..."}</strong>
                    <span>{workerCode || "---"}</span>
                </div>
                <div className="worker-sticky-meta">
                    <span className="worker-sticky-training">
                        <span className="worker-sticky-training-label">Học việc: </span>
                        {trainingPercent || 0}%
                    </span>
                    <label className="worker-sticky-date" htmlFor="workerWorkDate">
                        <select
                            id="workerWorkDate"
                            className="worker-sticky-date-select"
                            name="workDate"
                            value={workDate}
                            onChange={onDateChange}
                            aria-label="Chọn ngày báo cáo trong 15 ngày gần nhất"
                        >
                            {dateOptions.map((dateOption) => (
                                <option key={dateOption.value} value={dateOption.value}>{dateOption.label}</option>
                            ))}
                        </select>
                    </label>
                </div>
            </div>
        </div>
    );
}
