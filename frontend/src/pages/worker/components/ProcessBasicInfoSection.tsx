import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import AutocompleteInput from "../../../components/common/AutocompleteInput";
import type { AutocompleteOption } from "../../../components/common/AutocompleteInput";
import type { ProductStandardOption } from "../../../services/masterDataService";
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
    machineOptions?: unknown;
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
            standardOutput: selectedProduct ? String(Number(selectedProduct.standard_output)) : "",
        }));
    };

    return (
        <section className="worker-form-card worker-form-card-basic">
            <div className="worker-card-heading">
                <div className="worker-card-step">02</div>
                <div>
                    <h2 className="worker-card-title"><span><AppIcon name="checklist" size={15} /></span> Sản phẩm &amp; máy</h2>
                    <p className="worker-card-subtitle">Chọn đúng dữ liệu trong danh mục. Không nhập mã tự do ngoài danh sách.</p>
                </div>
            </div>

            <div className="worker-basic-grid">
                <div className="worker-field-block worker-field-full worker-shift-block">
                    <label className="worker-field-label">Ca làm việc <em>*</em></label>
                    <div className="worker-shift-list">
                        {["A", "B", "C", "D"].map((shift) => (
                            <label key={shift} className="worker-shift-item">
                                <input type="radio" name="shift" value={shift} checked={form.shift === shift} onChange={onFormChange} />
                                <span>{shift}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {isCutLongProcess && (
                    <div className="worker-mode-panel worker-field-full">
                        <div className="worker-mode-group">
                            <div className="worker-mode-label">Loại gia công</div>
                            <div className="worker-choice-row">
                                <button type="button" className={operationType === "CUT" ? "active" : ""} onClick={() => setOperationType("CUT")}>Cắt</button>
                                <button type="button" className={operationType === "LONG" ? "active" : ""} onClick={() => setOperationType("LONG")}>Lồng</button>
                            </div>
                        </div>
                        <div className="worker-mode-group">
                            <div className="worker-mode-label">Hình thức thực hiện</div>
                            <div className="worker-choice-row">
                                <button type="button" className={operationMode === "MANUAL" ? "active" : ""} onClick={() => setOperationMode("MANUAL")}>Tay</button>
                                <button type="button" className={operationMode === "MACHINE" ? "active" : ""} onClick={() => setOperationMode("MACHINE")}>Máy</button>
                            </div>
                        </div>
                    </div>
                )}

                {isInspectionProcess && (
                    <div className="worker-mode-panel worker-field-full">
                        <div className="worker-mode-group">
                            <div className="worker-mode-label">Hình thức kiểm tra</div>
                            <div className="worker-choice-row">
                                <button type="button" className={operationMode === "MANUAL" ? "active" : ""} onClick={() => setOperationMode("MANUAL")}>Tay</button>
                                <button type="button" className={operationMode === "MACHINE" ? "active" : ""} onClick={() => setOperationMode("MACHINE")}>Máy</button>
                            </div>
                        </div>
                        <div className="worker-mode-hint">Làm tay: chỉ chọn mã sản phẩm. Làm máy: chọn máy trước, sau đó chọn mã sản phẩm thuộc máy.</div>
                    </div>
                )}

                {!usesMultiMachineLines && !usesSingleMachine && (
                    <div className="worker-selection-card worker-field-full">
                        <div className="worker-selection-heading">
                            <div>
                                <strong>Mã sản phẩm</strong><span className="worker-required">*</span>
                                <small>Danh sách theo đúng công đoạn đang nhập</small>
                            </div>
                            <span className="worker-selection-count">{productAutocompleteOptions.length} mã</span>
                        </div>
                        <AutocompleteInput
                            id="productName"
                            label="Mã sản phẩm"
                            value={form.productName}
                            options={productAutocompleteOptions}
                            placeholder={loadingMasterData ? "Đang tải danh mục sản phẩm…" : "Nhập hoặc chọn mã sản phẩm"}
                            required
                            disabled={loadingMasterData}
                            emptyMessage="Danh mục sản phẩm đang trống. Hệ thống sẽ tự tải lại dữ liệu danh mục."
                            onChange={setProduct}
                            onSelect={(option) => setProduct(option.value)}
                        />
                    </div>
                )}

                {usesMultiMachineLines ? (
                    <div className="worker-machine-workspace worker-field-full">
                        <div className="worker-selection-heading">
                            <div>
                                <strong>{isCutLongProcess ? "Danh sách máy & sản phẩm" : "Danh sách máy mài & sản phẩm"}</strong>
                                <small>Mỗi dòng = 1 máy + 1 mã sản phẩm + thời gian + sản lượng</small>
                                {isCutLongProcess && <small>Shared machine: sản lượng được credit theo báo cáo; physical truth nằm ở production event riêng.</small>}
                            </div>
                            <label className="worker-machine-count">
                                <span>Số máy</span>
                                <select value={machineCount} onChange={(event) => resizeMachineLines(Number(event.target.value))}>
                                    {Array.from({ length: maxMachineCount }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}</option>)}
                                </select>
                            </label>
                        </div>

                        {isCutLongProcess && <div className="worker-machine-policy-note">Máy tự động có thể chạy tối đa 4 máy/người. Máy thường áp dụng giới hạn theo dữ liệu máy.</div>}

                        <div className="machine-lines-list">
                            {machineLines.map((line, index) => (
                                <article className="machine-line" key={index}>
                                    <div className="machine-card-header">
                                        <div className="machine-card-title-wrap">
                                            <span className="machine-card-number">{index + 1}</span>
                                            <div><strong>Máy {index + 1}</strong><span>{line.machineCode || "Chưa chọn máy"}</span></div>
                                        </div>
                                        <span className="machine-card-badge">{line.productCode || "Chưa chọn SP"}</span>
                                    </div>

                                    <div className="machine-selection-grid">
                                        <AutocompleteInput
                                            id={`machineNo-${index}`}
                                            label="Mã máy"
                                            value={line.machineCode}
                                            options={machineAutocompleteOptions}
                                            placeholder="Chọn mã máy"
                                            required
                                            disabled={loadingMasterData}
                                            emptyMessage="Không tìm thấy máy trong công đoạn"
                                            onChange={(value) => updateMachineLine(index, { machineCode: value, productCode: "", standardOutputPerHour: 0, standardTimeSeconds: null, standardSource: null, standardError: "" })}
                                            onSelect={(option) => updateMachineLine(index, { machineCode: option.value, productCode: "", standardOutputPerHour: 0, standardTimeSeconds: null, standardSource: null, standardError: "" })}
                                        />
                                        <AutocompleteInput
                                            id={`machineProduct-${index}`}
                                            label="Mã sản phẩm"
                                            value={line.productCode}
                                            options={getMachineProductAutocompleteOptions(line.machineCode)}
                                            placeholder={line.machineCode.trim() ? "Chọn mã sản phẩm theo máy" : "Chọn máy trước"}
                                            required
                                            disabled={loadingMasterData || !line.machineCode.trim()}
                                            emptyMessage={line.machineCode.trim() ? "Không có mã sản phẩm phù hợp với máy này" : "Chọn máy trước để xem mã sản phẩm"}
                                            onChange={(value) => { updateMachineLine(index, { productCode: value }); void refreshMachineLineStandard(index, line.machineCode, value); }}
                                            onSelect={(option) => { updateMachineLine(index, { productCode: option.value }); void refreshMachineLineStandard(index, line.machineCode, option.value); }}
                                        />
                                    </div>

                                    <div className="machine-data-grid">
                                        <div>
                                            <div className="machine-section-title">Thời gian chạy máy</div>
                                            <div className="machine-time-row">
                                                <label><span>Giờ</span><input type="number" min="0" max="24" inputMode="numeric" placeholder="0" value={line.hours} onChange={(event) => updateMachineLine(index, { hours: event.target.value.replace(/\D/g, "") })} /></label>
                                                <label><span>Phút</span><input type="number" min="0" max="59" inputMode="numeric" placeholder="0" value={line.minutes} onChange={(event) => { const value = event.target.value.replace(/\D/g, ""); if (value === "" || Number(value) <= 59) updateMachineLine(index, { minutes: value }); }} /></label>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="machine-section-title">Sản lượng</div>
                                            <div className="machine-quantity-row">
                                                <label><span>OK</span><input type="number" min="0" inputMode="numeric" value={line.okQuantity} onChange={(event) => updateMachineLine(index, { okQuantity: event.target.value.replace(/\D/g, "") })} /></label>
                                                <label><span>NG</span><input type="number" min="0" inputMode="numeric" value={line.ngQuantity} readOnly aria-readonly="true" title="Tự động tính từ chi tiết lỗi NG" /></label>
                                            </div>
                                        </div>
                                    </div>

                                    {line.standardError && <div className="worker-inline-error">{line.standardError}</div>}

                                    <details className="machine-deduction-box">
                                        <summary>Chi tiết lỗi NG <strong>{getMachineNgTotal(line)} sản phẩm</strong></summary>
                                        <div className="machine-deduction-options">
                                            {activeNgOptions.map((item) => (
                                                <label key={item.key} className="machine-deduction-option">
                                                    <input
                                                        type="checkbox"
                                                        className="machine-ng-checkbox"
                                                        style={{ width: 16, height: 16, minWidth: 16, maxWidth: 16, minHeight: 16, maxHeight: 16, flex: "0 0 16px", boxSizing: "border-box", margin: 0, padding: 0 }}
                                                        checked={line.selectedDefects.includes(item.key)}
                                                        onChange={() => toggleMachineDefect(index, item.key)}
                                                    />
                                                    <span>{item.label}</span>
                                                </label>
                                            ))}
                                        </div>

                                        {line.selectedDefects.length > 0 && (
                                            <div className="machine-ng-quantities">
                                                {activeNgOptions
                                                    .filter((item) => line.selectedDefects.includes(item.key))
                                                    .map((item) => (
                                                        <label key={`qty-${item.key}`} className="machine-ng-quantity-row">
                                                            <span>{item.label}</span>
                                                            <input
                                                                className="machine-deduction-minute"
                                                                type="number"
                                                                min="0"
                                                                inputMode="numeric"
                                                                placeholder="0"
                                                                aria-label={`Số lượng ${item.label}`}
                                                                value={line.defects[item.key] || ""}
                                                                onChange={(event) => updateMachineDefectValue(index, item.key, event.target.value.replace(/\D/g, ""))}
                                                            />
                                                        </label>
                                                    ))}
                                            </div>
                                        )}
                                    </details>
                                </article>
                            ))}
                        </div>
                    </div>
                ) : usesSingleMachine ? (
                    <div className="worker-machine-single worker-field-full">
                        <div className="worker-selection-heading">
                            <div>
                                <strong>Máy &amp; sản phẩm</strong>
                                <small>Chọn máy trước → hệ thống chỉ hiển thị mã sản phẩm hợp lệ của máy</small>
                            </div>
                        </div>
                        <div className="worker-single-machine-grid">
                            <AutocompleteInput
                                id="machineNo"
                                label="Mã máy"
                                value={form.machineNo}
                                options={machineAutocompleteOptions}
                                placeholder="Chọn mã máy"
                                required
                                disabled={loadingMasterData}
                                emptyMessage="Không tìm thấy máy trong công đoạn"
                                onChange={(value) => setForm((prev) => ({ ...prev, machineNo: value, productName: "", standardOutput: "" }))}
                                onSelect={(option) => setForm((prev) => ({ ...prev, machineNo: option.value, productName: "", standardOutput: "" }))}
                            />
                            <AutocompleteInput
                                id="productName"
                                label="Mã sản phẩm"
                                value={form.productName}
                                options={productAutocompleteOptions}
                                placeholder={form.machineNo.trim() ? "Nhập hoặc chọn mã sản phẩm" : "Chọn máy trước"}
                                required
                                disabled={loadingMasterData || !form.machineNo.trim()}
                                emptyMessage={form.machineNo.trim() ? "Không có mã sản phẩm phù hợp với máy này" : "Chọn máy trước để xem mã sản phẩm"}
                                onChange={setProduct}
                                onSelect={(option) => setProduct(option.value)}
                            />
                        </div>
                    </div>
                ) : null}
            </div>
        </section>
    );
}
