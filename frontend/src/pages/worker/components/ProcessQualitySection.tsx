import { useLayoutEffect, useState, type ChangeEvent, type Dispatch, type FocusEvent, type SetStateAction } from "react";
import type { FormState, NgKey } from "../processPageConfig";
import AppIcon from "../../../components/common/AppIcon";

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

const normalizeCode = (value: unknown) => String(value ?? "").trim().toUpperCase();

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
    const qualityLocked = usesMultiMachineLines;
    const hasCanonicalGcDefects = activeNgOptions.some((item) => /^(CAT|LONG)\d+$/.test(normalizeCode(item.code)));
    const [gcOperation, setGcOperation] = useState<"CUT" | "LONG">("CUT");

    // ProcessPage owns the Cắt/Lồng state. Keep this section synchronized with
    // the active operation button without duplicating that state in the form.
    // useLayoutEffect runs after the parent commits the newly-active button.
    useLayoutEffect(() => {
        if (!hasCanonicalGcDefects || typeof document === "undefined") return;
        const activeOperationButton = document.querySelector<HTMLElement>(
            ".worker-mode-panel .worker-mode-group:first-child .worker-choice-row button.active"
        );
        const nextOperation = activeOperationButton?.textContent?.trim() === "Lồng" ? "LONG" : "CUT";
        setGcOperation((current) => current === nextOperation ? current : nextOperation);
    });

    const visibleNgOptions = hasCanonicalGcDefects
        ? activeNgOptions.filter((item) => {
            const code = normalizeCode(item.code);
            return gcOperation === "CUT" ? code.startsWith("CAT") : code.startsWith("LONG");
        })
        : activeNgOptions;

    const getDisplayLabel = (item: NgOption) => {
        const code = normalizeCode(item.code);
        const label = String(item.label ?? "").trim();
        if (!code) return label;
        if (label.toUpperCase().startsWith(`${code} `) || label.toUpperCase().startsWith(`${code} —`)) return label;
        return `${code} — ${label}`;
    };

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
                        onChange={qualityLocked ? undefined : onTtOkChange}
                        onBlur={qualityLocked ? undefined : onNumberBlur}
                        readOnly={qualityLocked}
                        disabled={qualityLocked}
                        inputMode="numeric"
                        autoComplete="off"
                    />
                </div>

                <div className="worker-quality-card ng">
                    <label htmlFor="ttNg">{usesMultiMachineLines ? "NG của người (tổng các máy)" : "TT NG"}</label>
                    <input
                        id="ttNg"
                        name="ttNg"
                        value={formatIntegerDisplay(form.ttNg)}
                        readOnly
                        disabled={qualityLocked}
                    />
                </div>

                <div className="worker-quality-card total-output">
                    <label htmlFor="totalOutput">{usesMultiMachineLines ? "Sản lượng người" : "Tổng sản lượng"}</label>
                    <input
                        id="totalOutput"
                        value={formatIntegerDisplay(String((Number(form.ttOk) || 0) + (Number(form.ttNg) || 0)))}
                        readOnly
                        disabled={qualityLocked}
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
                            {Number(form.ttNg || 0) > 0
                                ? `${selectedNg.length} loại · ${formatIntegerDisplay(form.ttNg)} NG`
                                : "Không có NG"}
                        </small>
                    </span>
                    <span aria-hidden="true">{showNg ? "▲" : "▼"}</span>
                </button>

                {showNg && (
                    <div id="worker-ng-options" className="worker-dropdown-options">
                        {visibleNgOptions.length === 0 ? (
                            <div className="worker-dropdown-empty" role="status">
                                Chưa có loại lỗi NG được cấu hình cho công đoạn này.
                            </div>
                        ) : visibleNgOptions.map((item) => (
                            <label key={item.key} className="worker-dropdown-option">
                                <input
                                    type="checkbox"
                                    className="worker-ng-checkbox"
                                    style={{ width: 16, height: 16, minWidth: 16, maxWidth: 16, minHeight: 16, maxHeight: 16, flex: "0 0 16px", boxSizing: "border-box", margin: 0, padding: 0 }}
                                    checked={selectedNg.includes(item.key)}
                                    onChange={(event) => {
                                        if (!qualityLocked) onToggleNg(item.key, event.target.checked);
                                    }}
                                    disabled={qualityLocked}
                                />
                                <span>{getDisplayLabel(item)}</span>
                            </label>
                        ))}
                    </div>
                )}
            </div>

            {selectedNg.length > 0 && (
                <div className="worker-dynamic-grid worker-ng-grid">
                    {visibleNgOptions
                        .filter((item) => selectedNg.includes(item.key))
                        .map((item) => (
                            <div key={item.key} className="worker-field-block">
                                <label className="worker-field-label" htmlFor={String(item.key)}>{getDisplayLabel(item)}</label>
                                <input
                                    id={item.key}
                                    className="worker-text-input"
                                    name={item.key}
                                    value={form[item.key]}
                                    onChange={(event) => {
                                        if (!qualityLocked) onNgValue(item.key, event.target.value);
                                    }}
                                    readOnly={qualityLocked}
                                    disabled={qualityLocked}
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
