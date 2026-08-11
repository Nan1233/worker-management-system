import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import AutocompleteInput from "../../../components/common/AutocompleteInput";
import type { AutocompleteOption } from "../../../components/common/AutocompleteInput";
import type { MachineOption, ProductStandardOption } from "../../../services/masterDataService";
import AppIcon from "../../../components/common/AppIcon";
import type {
    FormState,
    MachineLineState,
    NgKey,
    OperationMode,
    OperationType,
} from "../processPageConfig";

interface NgOption {
    key: NgKey;
    code: string;
    label: string;
}

interface Props {
    form: FormState;
    setForm: Dispatch<SetStateAction<FormState>>;
    onFormChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
    isCutLongProcess: boolean;
    isInspectionProcess: boolean;
    operationType: OperationType;
    setOperationType: Dispatch<SetStateAction<OperationType>>;
    operationMode: OperationMode;
    setOperationMode: Dispatch<SetStateAction<OperationMode>>;
    usesMultiMachineLines: boolean;
    usesSingleMachine: boolean;
    productAutocompleteOptions: AutocompleteOption[];
    getMachineProductAutocompleteOptions: (machineCode: string) => AutocompleteOption[];
    productOptions: ProductStandardOption[];
    machineAutocompleteOptions: AutocompleteOption[];
    machineOptions: MachineOption[];
    loadingMasterData: boolean;
    machineCount: number;
    maxMachineCount: number;
    machineLines: MachineLineState[];
    resizeMachineLines: (count: number) => void;
    updateMachineLine: (index: number, patch: Partial<MachineLineState>) => void;
    refreshMachineLineStandard: (index: number, machineCode: string, productCode: string) => Promise<void>;
    getMachineNgTotal: (line: MachineLineState) => number;
    activeNgOptions: NgOption[];
    toggleMachineDefect: (lineIndex: number, key: string) => void;
    updateMachineDefectValue: (lineIndex: number, key: string, value: string) => void;
}

export default function ProcessBasicInfoSection({
    form,
    setForm,
    onFormChange,
    isCutLongProcess,
    isInspectionProcess,
    operationType,
    setOperationType,
    operationMode,
    setOperationMode,
    usesMultiMachineLines,
    usesSingleMachine,
    productAutocompleteOptions,
    getMachineProductAutocompleteOptions,
    productOptions,
    machineAutocompleteOptions,
    machineOptions,
    loadingMasterData,
    machineCount,
    maxMachineCount,
    machineLines,
    resizeMachineLines,
    updateMachineLine,
    refreshMachineLineStandard,
    getMachineNgTotal,
    activeNgOptions,
    toggleMachineDefect,
    updateMachineDefectValue,
}: Props) {
    const setProduct = (value: string) => {
        const selectedProduct = productOptions.find(
            (item) => item.product_code.trim().toLowerCase() === value.trim().toLowerCase(),
        );
        setForm((prev) => ({
            ...prev,
            productName: value,
            standardOutput: selectedProduct
                ? String(Math.round(Number(selectedProduct.standard_output) || 0))
                : "",
        }));
    };

    return (
        <section className="worker-form-card">
            <h2 className="worker-card-title"><span><AppIcon name="checklist" size={15} /></span> Thông tin cơ bản</h2>
            <div className="worker-basic-grid">
                <div className="worker-field-block worker-field-full">
                    <label className="worker-field-label">Ca làm việc <em>*</em></label>
                    <div className="worker-shift-list">
                        {["A", "B", "C", "D"].map((shift) => (
                            <label key={shift} className="worker-shift-item">
                                <input
                                    type="radio"
                                    name="shift"
                                    value={shift}
                                    checked={form.shift === shift}
                                    onChange={onFormChange}
                                />
                                <span>{shift}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {isCutLongProcess && (
                    <div className="worker-field-block worker-field-full multi-machine-controls cut-long-controls">
                        <label>Loại gia công</label>
                        <div className="worker-choice-row">
                            <button type="button" className={operationType === "CUT" ? "active" : ""} onClick={() => setOperationType("CUT")}>Cắt</button>
                            <button type="button" className={operationType === "LONG" ? "active" : ""} onClick={() => setOperationType("LONG")}>Lồng</button>
                        </div>
                        <label>Hình thức thực hiện</label>
                        <div className="worker-choice-row">
                            <button type="button" className={operationMode === "MANUAL" ? "active" : ""} onClick={() => setOperationMode("MANUAL")}>Tay</button>
                            <button type="button" className={operationMode === "MACHINE" ? "active" : ""} onClick={() => setOperationMode("MACHINE")}>Máy</button>
                        </div>
                    </div>
                )}

                {isInspectionProcess && (
                    <div className="worker-field-block worker-field-full multi-machine-controls">
                        <label>Hình thức kiểm tra</label>
                        <div className="worker-choice-row">
                            <button type="button" className={operationMode === "MANUAL" ? "active" : ""} onClick={() => setOperationMode("MANUAL")}>Làm tay</button>
                            <button type="button" className={operationMode === "MACHINE" ? "active" : ""} onClick={() => setOperationMode("MACHINE")}>Làm bằng máy</button>
                        </div>
                        <small>Công đoạn Kiểm chỉ được chọn tối đa 1 máy.</small>
                    </div>
                )}

                {!usesMultiMachineLines && (
                    <div className="worker-field-block worker-field-full">
                        <AutocompleteInput
                            id="productName"
                            label="Sản phẩm"
                            value={form.productName}
                            options={productAutocompleteOptions}
                            placeholder="Nhập mã sản phẩm"
                            required
                            disabled={loadingMasterData}
                            emptyMessage="Không tìm thấy sản phẩm"
                            onChange={setProduct}
                            onSelect={(option) => setProduct(option.value)}
                        />
                    </div>
                )}

                {usesMultiMachineLines ? (
                    <div className="worker-field-block worker-field-full multi-machine-panel">
                        <label>Số lượng máy (tối đa {maxMachineCount})</label>
                        <select value={machineCount} onChange={(event) => resizeMachineLines(Number(event.target.value))}>
                            {Array.from({ length: maxMachineCount }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} máy</option>)}
                        </select>
                        {isCutLongProcess && (
                            <small>Máy tự động được chạy tối đa 4 máy/người. Nếu chọn máy thường, hệ thống giới hạn 1 máy/người.</small>
                        )}

                        {machineLines.map((line, index) => (
                            <div className="machine-line" key={index}>
                                <AutocompleteInput
                                    id={`machineNo-${index}`}
                                    label={`Máy ${index + 1}`}
                                    value={line.machineCode}
                                    options={machineAutocompleteOptions}
                                    placeholder="Chọn mã máy"
                                    required
                                    disabled={loadingMasterData}
                                    emptyMessage="Không tìm thấy máy"
                                    onChange={(value) => {
                                        updateMachineLine(index, { machineCode: value });
                                    }}
                                    onSelect={(option) => {
                                        updateMachineLine(index, { machineCode: option.value });
                                        void refreshMachineLineStandard(index, option.value, line.productCode);
                                    }}
                                />
                                <AutocompleteInput
                                    id={`machineProduct-${index}`}
                                    label={`Sản phẩm máy ${index + 1}`}
                                    value={line.productCode}
                                    options={getMachineProductAutocompleteOptions(line.machineCode)}
                                    placeholder="Chọn mã sản phẩm"
                                    required
                                    disabled={loadingMasterData}
                                    emptyMessage="Không tìm thấy sản phẩm"
                                    onChange={(value) => {
                                        updateMachineLine(index, { productCode: value });
                                    }}
                                    onSelect={(option) => {
                                        updateMachineLine(index, { productCode: option.value });
                                        void refreshMachineLineStandard(index, line.machineCode, option.value);
                                    }}
                                />

                                <div className="machine-card-header">
                                    <div><strong>Máy {index + 1}</strong><span>{line.machineCode || "Chưa chọn máy"}</span></div>
                                    <span className="machine-card-badge">{line.productCode || "Chưa chọn SP"}</span>
                                </div>
                                <div className="machine-section-title">Thời gian chạy máy</div>
                                <div className="machine-time-row">
                                    <input type="number" min="0" max="24" inputMode="numeric" placeholder="Giờ" value={line.hours} onChange={(event) => updateMachineLine(index, { hours: event.target.value.replace(/\D/g, "") })} />
                                    <span>giờ</span>
                                    <input type="number" min="0" max="59" inputMode="numeric" placeholder="Phút" value={line.minutes} onChange={(event) => {
                                        const value = event.target.value.replace(/\D/g, "");
                                        if (value === "" || Number(value) <= 59) updateMachineLine(index, { minutes: value });
                                    }} />
                                    <span>phút</span>
                                </div>
                                <div className="machine-section-title">{(() => {
                                    const selected = machineOptions.find((machine) => machine.machine_code.trim().toUpperCase() === line.machineCode.trim().toUpperCase());
                                    return selected?.output_basis === "MACHINE" ? "Sản lượng theo máy" : "Sản lượng sản phẩm";
                                })()}</div>
                                <div className="machine-quantity-row">
                                    <label>OK<input type="number" min="0" inputMode="numeric" value={line.okQuantity} onChange={(event) => updateMachineLine(index, { okQuantity: event.target.value.replace(/\D/g, "") })} /></label>
                                    <label>NG<input type="number" min="0" inputMode="numeric" value={line.ngQuantity} readOnly aria-readonly="true" title="Tự động cộng từ chi tiết lỗi NG" /></label>
                                    <div className="machine-line-total"><span>Tổng</span><strong>{(Number(line.okQuantity) || 0) + (Number(line.ngQuantity) || 0)}</strong></div>
                                </div>
                                {(() => {
                                    const runtimeHours = (Number(line.hours) || 0) + ((Number(line.minutes) || 0) / 60);
                                    const target = Math.max(0, Number(line.standardOutputPerHour || 0) * runtimeHours);
                                    const actual = (Number(line.okQuantity) || 0) + (Number(line.ngQuantity) || 0);
                                    const efficiency = target > 0 ? (actual / target) * 100 : 0;
                                    return (
                                        <div className="machine-performance-strip" aria-label={`Năng suất máy ${index + 1}`}>
                                            <div className="machine-performance-metric"><span>Định mức máy/SP</span><strong>{line.standardLoading ? "Đang tải..." : line.standardOutputPerHour > 0 ? `${line.standardOutputPerHour.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} SP/giờ` : "Chưa có"}</strong></div>
                                            <div className="machine-performance-metric"><span>Thời gian chuẩn</span><strong>{line.standardTimeSeconds ? `${Number(line.standardTimeSeconds).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} giây/SP` : "Theo định mức SP"}</strong></div>
                                            <div className="machine-performance-metric machine-target"><span>SL theo TG chạy</span><strong>{target > 0 ? Math.floor(target).toLocaleString("vi-VN") : "—"}</strong></div>
                                            <div className="machine-performance-metric machine-actual"><span>SL thực tế / Hiệu suất</span><strong>{actual.toLocaleString("vi-VN")} / {target > 0 ? `${efficiency.toFixed(1)}%` : "—"}</strong></div>
                                        </div>
                                    );
                                })()}
                                {line.standardError && <small className="worker-machine-total-note">{line.standardError}</small>}
                                <details className="machine-deduction-box">
                                    <summary>Chi tiết lỗi NG <strong>{getMachineNgTotal(line)} sản phẩm</strong></summary>
                                    <div className="machine-deduction-options">
                                        {activeNgOptions.map((item) => (
                                            <label key={item.key} className="machine-deduction-option">
                                                <input type="checkbox" checked={line.selectedDefects.includes(item.key)} onChange={() => toggleMachineDefect(index, item.key)} />
                                                <span>{item.label}</span>
                                                {line.selectedDefects.includes(item.key) && (
                                                    <input className="machine-deduction-minute" inputMode="numeric" placeholder="SL" value={line.defects[item.key] || ""} onChange={(event) => updateMachineDefectValue(index, item.key, event.target.value)} />
                                                )}
                                            </label>
                                        ))}
                                    </div>
                                </details>
                            </div>
                        ))}
                    </div>
                ) : usesSingleMachine ? (
                    <div className="worker-field-block worker-field-full">
                        <AutocompleteInput
                            id="machineNo"
                            label="Số máy"
                            value={form.machineNo}
                            options={machineAutocompleteOptions}
                            placeholder="Nhập mã máy"
                            required
                            disabled={loadingMasterData}
                            emptyMessage="Không tìm thấy máy"
                            onChange={(value) => setForm((prev) => ({ ...prev, machineNo: value }))}
                            onSelect={(option) => setForm((prev) => ({ ...prev, machineNo: option.value }))}
                        />
                    </div>
                ) : null}
            </div>
        </section>
    );
}
