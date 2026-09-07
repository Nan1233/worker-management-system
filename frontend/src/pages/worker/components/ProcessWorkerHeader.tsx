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
    const normalizedTrainingPercent = Math.min(100, Math.max(70, Math.round(Number(trainingPercent) || 100)));

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
                /* Compact worker header: training percentage and date are always one row on mobile. */
                @media (max-width: 680px) {
                    .worker-sticky-training-label { display: none !important; }
                    .worker-sticky-meta {
                        width: 100% !important;
                        min-width: 0 !important;
                        display: grid !important;
                        grid-template-columns: max-content minmax(0, 1fr) !important;
                        align-items: center !important;
                        gap: 6px !important;
                    }
                    .worker-sticky-training {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        width: max-content !important;
                        min-width: 42px !important;
                        max-width: max-content !important;
                        flex: none !important;
                        white-space: nowrap !important;
                        word-break: keep-all !important;
                        margin: 0 !important;
                    }
                    .worker-sticky-date {
                        display: block !important;
                        min-width: 0 !important;
                        width: 100% !important;
                        margin: 0 !important;
                    }
                    .worker-sticky-date-select {
                        display: block !important;
                        width: 100% !important;
                        min-width: 0 !important;
                        box-sizing: border-box !important;
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
                        {normalizedTrainingPercent}%
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
