import type { Dispatch, SetStateAction } from "react";
import type { ExtraFieldDefinition } from "../processExtraFields";

type FieldOption = { value: string; label: string };

interface Props {
    fields: ExtraFieldDefinition[];
    inline?: boolean;
    fieldOptions?: Record<string, FieldOption[]>;
    loadingFieldOptions?: boolean;
    extraData: Record<string, string>;
    setExtraData: Dispatch<SetStateAction<Record<string, string>>>;
}

export default function ProcessExtraFieldsSection({ fields, inline = false, extraData, setExtraData, fieldOptions = {}, loadingFieldOptions = false }: Props) {
    if (fields.length === 0) return null;

    return (
        <div className={inline ? "worker-field-full worker-inline-extra-fields" : "worker-form-card"}>
            {!inline && <h2 className="worker-card-title"><span>▦</span> Thông tin riêng công đoạn</h2>}
            <div className="worker-basic-grid">
                {fields.map((field) => (
                    <div className="worker-field-block" key={field.key}>
                        <label className="worker-field-label" htmlFor={`extra-${field.key}`}>
                            {field.label}{field.required ? <em>*</em> : null}
                        </label>
                        <div className="worker-input-with-unit">
                            {field.type === "select" ? (
                                <select
                                    id={`extra-${field.key}`}
                                    className="worker-text-input"
                                    value={extraData[field.key] || ""}
                                    required={field.required}
                                    disabled={loadingFieldOptions || (fieldOptions[field.key] || []).length === 0}
                                    onChange={(event) => setExtraData((current) => ({
                                        ...current,
                                        [field.key]: event.target.value,
                                    }))}
                                >
                                    <option value="">{loadingFieldOptions ? "Đang tải danh mục…" : ((fieldOptions[field.key] || []).length ? (field.placeholder || "Chọn giá trị") : "Chưa có dữ liệu danh mục")}</option>
                                    {(fieldOptions[field.key] || []).map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    id={`extra-${field.key}`}
                                    className="worker-text-input"
                                    type={field.type}
                                    min={field.type === "number" ? "0" : undefined}
                                    step={field.type === "number" ? "any" : undefined}
                                    value={extraData[field.key] || ""}
                                    placeholder={field.placeholder}
                                    required={field.required}
                                    onChange={(event) => setExtraData((current) => ({
                                        ...current,
                                        [field.key]: event.target.value,
                                    }))}
                                />
                            )}
                            {field.unit ? <span>{field.unit}</span> : null}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
