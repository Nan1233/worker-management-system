import { getExtraFields } from "./processFormSchemas";

export type ExtraFieldDefinition = {
  key: string;
  label: string;
  type: "text" | "number" | "date";
  required?: boolean;
  placeholder?: string;
  unit?: string;
};

const slugs = ["cat-long", "mai", "do", "kiem-1", "kiem-2", "can", "ep", "bavia", "sx3"];

/**
 * Tương thích với ProcessPage hiện tại. Nguồn tiêu đề duy nhất là
 * PROCESS_FORM_SCHEMAS; không đọc workbook khi ứng dụng chạy.
 */
export const processExtraFields: Record<string, ExtraFieldDefinition[]> = Object.fromEntries(
  slugs.map((slug) => [
    slug,
    getExtraFields(slug).map((field) => ({
      key: field.key,
      label: field.label,
      type: field.kind === "text" ? "text" : field.kind === "date" ? "date" : "number",
      required: field.required,
      placeholder: field.placeholder,
      unit: field.unit,
    })),
  ])
);
