import type { Dispatch, SetStateAction } from "react";
import type { ExtraFieldDefinition } from "../processExtraFields";

interface Props {
    fields: ExtraFieldDefinition[];
    extraData: Record<string, string>;
    setExtraData: Dispatch<SetStateAction<Record<string, string>>>;
}

export default function ProcessExtraFieldsSection({ fields, extraData, setExtraData }: Props) {
    if (fields.length === 0) return null;

    return (
        <section className="worker-form-card">
            <h2 className="worker-card-title"><span>▦</span> Thông tin riêng công đoạn</h2>
            <div className="worker-basic-grid">
                {fields.map((field) => (
                    <div className="worker-field-block" key={field.key}>
                        <label className="worker-field-label" htmlFor={`extra-${field.key}`}>
                            {field.label}{field.required ? <em>*</em> : null}
                        </label>
                        <div className="worker-input-with-unit">
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
                            {field.unit ? <span>{field.unit}</span> : null}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
