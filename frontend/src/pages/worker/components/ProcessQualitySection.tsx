import type { ChangeEvent, FocusEvent, Dispatch, SetStateAction } from "react";
import type { FormState, NgKey } from "../processPageConfig";
import AppIcon from "../../../components/common/AppIcon";
import { calculateNgTotal } from "../processQualityLogic";

interface NgOption {
    key: NgKey;
    code: string;
    label: string;
}

interface Props {
    form: FormState;
    activeNgOptions: NgOption[];
    selectedNg: NgKey[];
    showNg: boolean;
    setShowNg: Dispatch<SetStateAction<boolean>>;
    usesMultiMachineLines: boolean;
    formatIntegerDisplay: (value: string) => string;
    onTtOkChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onNumberBlur: (event: FocusEvent<HTMLInputElement>) => void;
    onToggleNg: (key: NgKey, checked: boolean) => void;
    onNgValue: (key: NgKey, value: string) => void;
}

export default function ProcessQualitySection({
    form,
    activeNgOptions,
    selectedNg,
    showNg,
    setShowNg,
    usesMultiMachineLines,
    formatIntegerDisplay,
    onTtOkChange,
    onNumberBlur,
    onToggleNg,
    onNgValue,
}: Props) {
    const derivedNgTotal = usesMultiMachineLines
        ? Number(form.ttNg || 0)
        : calculateNgTotal(form, activeNgOptions);
    const okTotal = Number(form.ttOk || 0);
    const displayedTotal = Math.max(0, okTotal + derivedNgTotal);

    return (
        <section className="worker-form-card worker-quality-section">
            <h2 className="worker-card-title"><span><AppIcon name="sheet" size={20} /></span> Báo cáo Chất lượng</h2>

            <div className="worker-quality-summary">
                <div className="worker-quality-card ok">
                    <label htmlFor="ttOk">{usesMultiMachineLines ? "OK của người (tổng các máy)" : "TT OK"}</label>
                    <input
                        id="ttOk"
                        name="ttOk"
                        value={formatIntegerDisplay(form.ttOk)}
                        onChange={usesMultiMachineLines ? undefined : onTtOkChange}
                        onBlur={usesMultiMachineLines ? undefined : onNumberBlur}
                        readOnly={usesMultiMachineLines}
                        disabled={usesMultiMachineLines}
                        inputMode="numeric"
                        autoComplete="off"
                    />
                </div>

                <div className="worker-quality-card ng">
                    <label htmlFor="ttNg">{usesMultiMachineLines ? "NG của người (tổng các máy)" : "TT NG"}</label>
                    <input
                        id="ttNg"
                        name="ttNg"
                        value={formatIntegerDisplay(String(derivedNgTotal))}
                        readOnly
                        disabled={usesMultiMachineLines}
                    />
                </div>

                <div className="worker-quality-card total-output">
                    <label htmlFor="totalOutput">{usesMultiMachineLines ? "Sản lượng người" : "Tổng sản lượng"}</label>
                    <input
                        id="totalOutput"
                        value={formatIntegerDisplay(String(displayedTotal))}
                        readOnly
                        disabled={usesMultiMachineLines}
                        aria-label="Tổng sản lượng bằng TT OK cộng TT NG"
                    />
                    <small>{usesMultiMachineLines ? "Tổng sản lượng thực tế của tất cả máy người này chạy" : "OK + NG"}</small>
                </div>
            </div>

            <div className="worker-dropdown-box">
                <button
                    type="button"
                    className="worker-dropdown-title"
                    onClick={() => setShowNg((prev) => !prev)}
                    aria-expanded={showNg}
                    aria-controls="worker-ng-options"
                >
                    <span className="worker-dropdown-title-main">
                        <span>{usesMultiMachineLines ? "Tổng lỗi NG từ các máy" : "Lỗi NG"}</span>
                        <small>
                            {derivedNgTotal > 0
                                ? `${selectedNg.length} loại · ${formatIntegerDisplay(String(derivedNgTotal))} NG`
                                : "Không có NG"}
                        </small>
                    </span>
                    <span aria-hidden="true">{showNg ? "▲" : "▼"}</span>
                </button>

                {showNg && (
                    <div id="worker-ng-options" className="worker-dropdown-options">
                        {activeNgOptions.length === 0 ? (
                            <div className="worker-dropdown-empty" role="status">
                                Chưa có loại lỗi NG được cấu hình cho công đoạn này.
                            </div>
                        ) : activeNgOptions.map((item) => (
                            <label key={item.key} className="worker-dropdown-option">
                                <input
                                    type="checkbox"
                                    checked={selectedNg.includes(item.key)}
                                    onChange={(event) => {
                                        if (!usesMultiMachineLines) onToggleNg(item.key, event.target.checked);
                                    }}
                                    disabled={usesMultiMachineLines}
                                />
                                <span>{item.label}</span>
                            </label>
                        ))}
                    </div>
                )}
            </div>

            {selectedNg.length > 0 && (
                <div className="worker-dynamic-grid worker-ng-grid">
                    {activeNgOptions
                        .filter((item) => selectedNg.includes(item.key))
                        .map((item) => (
                            <div key={item.key} className="worker-field-block">
                                <label className="worker-field-label" htmlFor={String(item.key)}>{item.label}</label>
                                <input
                                    id={item.key}
                                    className="worker-text-input"
                                    name={item.key}
                                    value={form[item.key]}
                                    onChange={(event) => {
                                        if (!usesMultiMachineLines) onNgValue(item.key, event.target.value);
                                    }}
                                    readOnly={usesMultiMachineLines}
                                    disabled={usesMultiMachineLines}
                                    inputMode="numeric"
                                    autoComplete="off"
                                />
                            </div>
                        ))}
                </div>
            )}
        </section>
    );
}
