import type { Dispatch, SetStateAction } from "react";
import type { DeductionKey, DeductionState, FormState } from "../processPageConfig";
import { decimalHoursToText } from "../processPageConfig";
import AppIcon from "../../../components/common/AppIcon";
import {
    MAX_TOTAL_WORK_MINUTES,
    getDeductionMinutes,
    parseFlexibleTime,
} from "../processFormUtils";

interface DeductionOption {
    key: DeductionKey;
    label: string;
}

interface Props {
    form: FormState;
    setForm: Dispatch<SetStateAction<FormState>>;
    deductions: DeductionState;
    activeDeductionOptions: DeductionOption[];
    selectedDeduction: DeductionKey[];
    showDeduction: boolean;
    setShowDeduction: Dispatch<SetStateAction<boolean>>;
    onToggleDeduction: (key: DeductionKey, checked: boolean) => void;
    onUpdateDeduction: (key: DeductionKey, value: string) => void;
    onNormalizeDeduction: (key: DeductionKey) => void;
    onWarning: (message: string) => void;
}

export default function ProcessTimeDeductionSection({
    form,
    setForm,
    deductions,
    activeDeductionOptions,
    selectedDeduction,
    showDeduction,
    setShowDeduction,
    onToggleDeduction,
    onUpdateDeduction,
    onNormalizeDeduction,
    onWarning,
}: Props) {
    const handleHoursChange = (rawValue: string) => {
        const value = rawValue.replace(/\D/g, "");
        if (value !== "" && Number(value) > 12) {
            onWarning("Thời gian tối đa là 12 giờ");
            return;
        }

        const hours = Number(value) || 0;
        const deductionMinutes = getDeductionMinutes(deductions);
        const currentMinutes = hours === 12 ? 0 : Math.min(59, Number(form.actualMinutes) || 0);
        const prospectiveTotalMinutes = hours * 60 + currentMinutes + deductionMinutes;

        if (prospectiveTotalMinutes > MAX_TOTAL_WORK_MINUTES) {
            onWarning("Không thể chọn số giờ này vì tổng thời gian sẽ vượt quá 12 giờ");
            return;
        }

        setForm((prev) => {
            const minutes = hours === 12 ? 0 : Math.min(59, Number(prev.actualMinutes) || 0);
            const actualTime = hours + minutes / 60;
            const deductionTime = parseFlexibleTime(prev.deductionTime);
            return {
                ...prev,
                actualHours: value,
                actualMinutes: hours === 12 ? "0" : prev.actualMinutes,
                actualTime: String(actualTime),
                totalTime: String(actualTime + deductionTime),
            };
        });
    };

    const handleMinutesChange = (rawValue: string) => {
        const value = rawValue.replace(/\D/g, "");
        if (value !== "" && Number(value) > 59) return;

        const hours = Number(form.actualHours) || 0;
        const minutes = Number(value) || 0;
        const deductionMinutes = getDeductionMinutes(deductions);

        if (hours === 12 && minutes > 0) {
            onWarning("Đã đủ 12 giờ nên số phút phải bằng 0");
            return;
        }

        if (hours * 60 + minutes + deductionMinutes > MAX_TOTAL_WORK_MINUTES) {
            onWarning("Không thể tăng số phút vì tổng thời gian sẽ vượt quá 12 giờ");
            return;
        }

        setForm((prev) => {
            const actualTime = hours + minutes / 60;
            const deductionTime = parseFlexibleTime(prev.deductionTime);
            return {
                ...prev,
                actualMinutes: value,
                actualTime: String(actualTime),
                totalTime: String(actualTime + deductionTime),
            };
        });
    };

    return (
        <section className="worker-form-card">
            <h2 className="worker-card-title"><span><AppIcon name="clock" size={15} /></span> Hiệu suất &amp; Thời gian</h2>

            <div className="worker-time-grid">
                <div className="worker-time-item">
                    <label>Thời gian làm thực tế</label>
                    <div className="worker-time-split worker-time-parts">
                        <div className="worker-time-part">
                            <span>Giờ</span>
                            <input
                                type="number"
                                min="0"
                                max="12"
                                step="1"
                                inputMode="numeric"
                                value={form.actualHours}
                                onChange={(event) => handleHoursChange(event.target.value)}
                                placeholder="0"
                            />
                        </div>
                        <div className="worker-time-part">
                            <span>Phút</span>
                            <input
                                type="number"
                                min="0"
                                max="59"
                                step="1"
                                inputMode="numeric"
                                value={form.actualMinutes}
                                disabled={
                                    Number(form.actualHours) >= 12
                                    || (Number(form.actualHours) || 0) * 60 + getDeductionMinutes(deductions)
                                        >= MAX_TOTAL_WORK_MINUTES
                                }
                                onChange={(event) => handleMinutesChange(event.target.value)}
                                placeholder="0"
                            />
                        </div>
                    </div>
                    <small>{Number(form.actualHours || 0)} giờ {Number(form.actualMinutes || 0)} phút</small>
                </div>

                <div className="worker-time-item">
                    <label>Tổng thời gian</label>
                    <input value={form.totalTime} readOnly />
                    <small>{decimalHoursToText(form.totalTime)}</small>
                </div>

                <div className="worker-time-item">
                    <label>Thời gian trừ</label>
                    <input value={form.deductionTime} readOnly />
                    <small>{decimalHoursToText(form.deductionTime)}</small>
                </div>
            </div>

            <div className="worker-dropdown-box">
                <button
                    type="button"
                    className="worker-dropdown-title"
                    onClick={() => setShowDeduction((prev) => !prev)}
                    aria-expanded={showDeduction}
                    aria-controls="worker-deduction-options"
                >
                    <span className="worker-dropdown-title-main">
                        <span>⏱ Thời gian trừ</span>
                        <small>
                            {selectedDeduction.length > 0
                                ? `${selectedDeduction.length} loại · ${getDeductionMinutes(deductions)} phút`
                                : "Không có thời gian trừ"}
                        </small>
                    </span>
                    <span aria-hidden="true">{showDeduction ? "▲" : "▼"}</span>
                </button>

                {showDeduction && (
                    <div id="worker-deduction-options" className="worker-dropdown-options">
                        {activeDeductionOptions.length === 0 ? (
                            <div className="worker-dropdown-empty" role="status">
                                Chưa có loại thời gian trừ được cấu hình cho công đoạn này.
                            </div>
                        ) : activeDeductionOptions.map((item) => (
                            <label key={item.key} className="worker-dropdown-option">
                                <input
                                    type="checkbox"
                                    checked={selectedDeduction.includes(item.key)}
                                    onChange={(event) => onToggleDeduction(item.key, event.target.checked)}
                                />
                                <span>{item.label}</span>
                            </label>
                        ))}
                    </div>
                )}
            </div>

            {selectedDeduction.length > 0 && (
                <div className="worker-dynamic-grid worker-deduction-detail-grid">
                    {activeDeductionOptions
                        .filter((item) => selectedDeduction.includes(item.key))
                        .map((item) => (
                            <div key={item.key} className="worker-field-block">
                                <label className="worker-field-label" htmlFor={String(item.key)}>{item.label}</label>
                                <div className="worker-deduction-input-row">
                                    <input
                                        id={String(item.key)}
                                        className="worker-text-input worker-deduction-input"
                                        name={String(item.key)}
                                        value={deductions[item.key]}
                                        onChange={(event) => onUpdateDeduction(item.key, event.target.value)}
                                        onBlur={() => onNormalizeDeduction(item.key)}
                                        inputMode="numeric"
                                        placeholder="Phút"
                                        autoComplete="off"
                                    />
                                    <span className="worker-time-unit" aria-hidden="true">phút</span>
                                </div>
                            </div>
                        ))}
                </div>
            )}
        </section>
    );
}
