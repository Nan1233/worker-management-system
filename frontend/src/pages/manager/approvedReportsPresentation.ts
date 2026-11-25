import type { CSSProperties } from "react";
import type { ProductionReport } from "../../types/production";

// Presentation-only helpers extracted from ApprovedReports. No behavior or
// stored snapshot precedence is changed here; keep display fallbacks explicit.
export const reportCodes = (r: ProductionReport, kind: "machine" | "product"): string => {
    const lines = Array.isArray(r.machine_lines) ? r.machine_lines : [];
    const values = lines.map(line => kind === "machine" ? line.machine_code : line.product_code)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (kind === "machine" && r.machine_no?.trim()) values.push(r.machine_no.trim());
    if (kind === "product" && r.product_name?.trim()) values.push(r.product_name.trim());
    return [...new Set(values)].join(", ") || "—";
};

export const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const text = (v: unknown, fallback = "—") => v === null || v === undefined || v === "" ? fallback : String(v);
const nullableNumber = (v: unknown): number | null => v == null || String(v).trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v);
export const fmt = (v: unknown) => nullableNumber(v)?.toLocaleString("vi-VN", { maximumFractionDigits: 2 }) ?? "—";
export const pct = (v: unknown) => v == null ? "—" : `${fmt(v)}%`;
export const dateText = (v: unknown) => { const s = String(v || "").slice(0, 10); const [y, m, d] = s.split("-"); return y && m && d ? `${d}/${m}/${y}` : s || "—"; };
export const dateValue = (v: Date) => `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
export const rangeFor = (value: string, type: "day" | "week" | "month" | "year") => {
    const start = new Date(`${value}T00:00:00`); const end = new Date(start);
    if (type === "year") { start.setMonth(0, 1); end.setMonth(11, 31); }
    else if (type === "month") { start.setDate(1); end.setMonth(end.getMonth() + 1, 0); }
    else if (type === "week") { const offset = (start.getDay() + 6) % 7; start.setDate(start.getDate() - offset); end.setTime(start.getTime()); end.setDate(start.getDate() + 6); }
    return { dateFrom: dateValue(start), dateTo: dateValue(end) };
};

export const kpi = (r: ProductionReport) => {
    const x = r as ProductionReport & Record<string, unknown>;
    const canonical = x.kpi as Record<string, unknown> | undefined;
    if (canonical) {
        const percent = (v: unknown) => { const value = nullableNumber(v); return value === null ? null : value * 100; };
        return {
            ok: nullableNumber(canonical.ok), ng: nullableNumber(canonical.allNg), actual: nullableNumber(canonical.adjustedOutput),
            actualTime: nullableNumber(canonical.actualTime), totalTime: nullableNumber(canonical.workingTime),
            ttDinhMuc: nullableNumber(canonical.plannedOutput), nangSuat: percent(canonical.achievement),
            dat: percent(canonical.okRate), pp: percent(canonical.ngRate),
            hv: canonical.trainingPercent == null ? null : nullableNumber(canonical.trainingPercent),
            ngTypeCount: Math.max(num(x.ng_defect_type_count), num(x.worker_ng_type_count), num(x.machine_ng_type_count))
        };
    }
    // Older API responses may expose stored fields, but never derive new KPIs here.
    return {
        ok: nullableNumber(x.tt_ok), ng: nullableNumber(x.tt_ng), actual: nullableNumber(x.actual_output),
        actualTime: nullableNumber(x.actual_time), totalTime: nullableNumber(x.total_time),
        ttDinhMuc: nullableNumber(x.tt_dinh_muc), nangSuat: nullableNumber(x.nang_suat_percent),
        dat: nullableNumber(x.ok_rate_percent), pp: nullableNumber(x.pp_percent),
        hv: x.training_percent_snapshot == null ? null : nullableNumber(x.training_percent_snapshot),
        ngTypeCount: Math.max(num(x.ng_defect_type_count), num(x.worker_ng_type_count), num(x.machine_ng_type_count))
    };
};

export const metricStyle = (type: "productivity" | "pp", value: number | null, ngTypeCount = 0): CSSProperties => {
    if (value === null) return {};
    if (type === "productivity" && (value <= 75 || value > 100)) return { backgroundColor: "#ffd6e7", color: "#9b123f", fontWeight: 800, border: "1px solid #ff9fbe" };
    if (type === "pp" && (value === 0 || ngTypeCount === 1)) return { backgroundColor: "#fff0b8", color: "#795600", fontWeight: 800, border: "1px solid #e3ad20" };
    return {};
};

export const parseMachineDefects = (detail: Record<string, unknown> | null) => {
    const lines = Array.isArray(detail?.machine_lines) ? detail!.machine_lines as Record<string, unknown>[] : [];
    const result: Array<{ name: string; quantity: number; machine: string }> = [];
    for (const line of lines) {
        let raw: unknown = line.defects;
        if (!Array.isArray(raw)) raw = line.defects_json;
        if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { raw = null; } }
        if (raw && !Array.isArray(raw) && typeof raw === "object" && Array.isArray((raw as any).defects)) raw = (raw as any).defects;
        if (Array.isArray(raw)) {
            for (const item of raw as any[]) {
                const quantity = num(item?.quantity ?? item?.qty ?? item?.ng_quantity);
                if (quantity > 0) result.push({ name: text(item?.defect_name || item?.name || item?.defect_code, "NG chưa phân loại"), quantity, machine: text(line.machine_code) });
            }
        } else if (raw && typeof raw === "object") {
            for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
                if (["selectedDefects", "selectedNg", "total", "ngQuantity"].includes(key)) continue;
                const quantity = num(typeof value === "object" && value ? (value as any).quantity ?? (value as any).qty ?? (value as any).ng_quantity : value);
                if (quantity > 0) result.push({ name: text(typeof value === "object" && value ? (value as any).defect_name || (value as any).name || key : key), quantity, machine: text(line.machine_code) });
            }
        }
    }
    return result;
};

