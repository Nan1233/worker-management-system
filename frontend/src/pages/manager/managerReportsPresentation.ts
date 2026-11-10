import type { CSSProperties } from "react";
import type { ProductionReport } from "../../types/production";

// Pure presentation and KPI fallback logic for the pending reports screen.
// Keep persisted snapshots authoritative and avoid side effects in formatting.
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const text = (v: unknown, fallback = "—") => v === null || v === undefined || v === "" ? fallback : String(v);
const getStoredExtraData = (value: unknown): Record<string, unknown> => {
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    if (typeof value === "string") { try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {}; } catch { /* malformed saved filter: use defaults */ } }
    return {};
};
const processLabel = (report: ProductionReport) => {
    const x = report as ProductionReport & Record<string, unknown>;
    const extra = getStoredExtraData(x.extra_data);
    const workType = String(extra.work_type || x.work_type || "").trim();
    return extra.non_product_work === true && workType
        ? `${text(x.process_name || x.process_code)} · Công việc khác (${workType})`
        : text(x.process_name || x.process_code);
};
const fmt = (v: unknown) => num(v).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const pct = (v: unknown) => `${fmt(v)}%`;
const dateText = (v: unknown) => { const s = String(v || "").slice(0, 10); const [y, m, d] = s.split("-"); return y && m && d ? `${d}/${m}/${y}` : s || "—"; };
const dateValue = (v: Date) => `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
const rangeFor = (value: string, type: "day" | "week" | "month" | "year") => {
    const start = new Date(`${value}T00:00:00`); const end = new Date(start);
    if (type === "year") { start.setMonth(0, 1); end.setMonth(11, 31); }
    else if (type === "month") { start.setDate(1); end.setMonth(end.getMonth() + 1, 0); }
    else if (type === "week") { const offset = (start.getDay() + 6) % 7; start.setDate(start.getDate() - offset); end.setTime(start.getTime()); end.setDate(start.getDate() + 6); }
    return { dateFrom: dateValue(start), dateTo: dateValue(end) };
};

const kpi = (r: ProductionReport) => {
    const x = r as ProductionReport & Record<string, unknown>;
    const ok = num(x.tt_ok); const ng = num(x.tt_ng);
    const actual = num(x.actual_output) || ok + ng;
    const extra = getStoredExtraData(x.extra_data);
    const standard = num(x.standard_output)
        || num(x.target_output)
        || num(x.standard_output_per_hour)
        || num(x.standardOutput)
        || num(extra.standard_output)
        || num(extra.target_output);
    const machineLines = Array.isArray(x.machine_lines) ? x.machine_lines as Array<Record<string, unknown>> : [];
    const machineNetHours = machineLines.reduce((sum, line) => {
        const gross = Math.max(0, num(line.machine_time_hours));
        const deduction = Math.max(0, num(line.deduction_time_hours));
        return sum + Math.max(0, gross - deduction);
    }, 0);
    const machineStandardTime = machineLines.reduce((sum, line) => {
        const netHours = Math.max(0, num(line.machine_time_hours) - num(line.deduction_time_hours));
        const lineStandard = Math.max(0, num(line.standard_output));
        return sum + (netHours > 0 && lineStandard > 0 ? netHours * lineStandard : 0);
    }, 0);
    const actualTime = num(x.actual_time)
        || num(x.actual_hours)
        || num(x.working_hours)
        || num(x.total_working_hours)
        || num(x.tt_gio)
        || num(extra.actual_time)
        || num(extra.actual_hours)
        || num(extra.working_hours)
        || machineNetHours;
    // Prefer the persisted KPI snapshot when present; otherwise calculate only
    // when both inputs are available. Do not silently turn missing fields into
    // a fabricated zero when the pending detail uses legacy field names.
    const storedTtDinhMuc = x.tt_dinh_muc ?? x.tt_dinh_muc_snapshot ?? x.standard_time_total ?? x.standardTimeTotal;
    const storedTtDinhMucValue = storedTtDinhMuc !== null && storedTtDinhMuc !== undefined && storedTtDinhMuc !== "" ? num(storedTtDinhMuc) : 0;
    const ttDinhMuc = storedTtDinhMucValue > 0
        ? storedTtDinhMucValue
        : (machineStandardTime > 0 ? machineStandardTime : (standard > 0 && actualTime > 0 ? standard * actualTime : 0));
    const storedNangSuat = x.nang_suat_percent ?? x.nang_suat_percent_snapshot ?? x.productivity_percent;
    const storedNangSuatValue = storedNangSuat !== null && storedNangSuat !== undefined && storedNangSuat !== "" ? num(storedNangSuat) : 0;
    const nangSuat = storedNangSuatValue > 0
        ? storedNangSuatValue
        : (ttDinhMuc > 0 ? actual / ttDinhMuc * 100 : 0);
    const dat = actual > 0 ? ok / actual * 100 : 0;
    const pp = num(x.pp_percent) || (actual > 0 ? ng / actual * 100 : 0);
    // Pending API returns the snapshot as training_percent_snapshot (the
    // detail page already reads this field). Keep the list consistent with it.
    const hv = x.training_percent ?? x.training_percent_snapshot ?? x.worker_training_percent ?? x.hv_percent ?? x.learning_percent ?? x.hoc_viec_percent ?? 100;
    const ngTypeCount = Math.max(num(x.ng_defect_type_count), num(x.worker_ng_type_count), num(x.machine_ng_type_count));
    // Machine lines that ran without a usable standard: there is nothing to compare against, so the screen must say
    // so ("Thiếu định mức") instead of showing a 0 that looks like a real zero productivity.
    const standardMissing = ttDinhMuc <= 0 && num(x.standard_missing_lines) > 0;
    return { ok, ng, actual, ttDinhMuc, nangSuat, dat, pp, hv, ngTypeCount, standardMissing };
};

const metricStyle = (type: "productivity" | "pp", value: number, ngTypeCount = 0): CSSProperties => {
    if (type === "productivity" && (value <= 75 || value > 100)) return { backgroundColor: "#ffd6e7", color: "#9b123f", fontWeight: 800, border: "1px solid #ff9fbe" };
    if (type === "pp" && (value === 0 || ngTypeCount === 1)) return { backgroundColor: "#fff0b8", color: "#795600", fontWeight: 800, border: "1px solid #e3ad20" };
    return {};
};

export {
    num,
    text,
    getStoredExtraData,
    processLabel,
    fmt,
    pct,
    dateText,
    dateValue,
    rangeFor,
    kpi,
    metricStyle,
};
