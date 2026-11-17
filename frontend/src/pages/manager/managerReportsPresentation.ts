import type { CSSProperties } from "react";
import type { ProductionReport } from "../../types/production";

// Pure presentation and KPI fallback logic for the pending reports screen.
// Keep persisted snapshots authoritative and avoid side effects in formatting.
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const text = (v: unknown, fallback = "—") => v === null || v === undefined || v === "" ? fallback : String(v);
const getStoredExtraData = (value: unknown): Record<string, unknown> => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    if (typeof value !== "string") return {};

    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object"
            ? parsed as Record<string, unknown>
            : {};
    } catch {
        // Malformed historical extra_data is treated as absent.
        return {};
    }
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
    const start = new Date(`${value}T00:00:00`);
    const end = new Date(start);

    if (type === "year") {
        start.setMonth(0, 1);
        end.setMonth(11, 31);
    } else if (type === "month") {
        start.setDate(1);
        end.setMonth(end.getMonth() + 1, 0);
    } else if (type === "week") {
        const offsetFromMonday = (start.getDay() + 6) % 7;
        start.setDate(start.getDate() - offsetFromMonday);
        end.setTime(start.getTime());
        end.setDate(start.getDate() + 6);
    }

    return { dateFrom: dateValue(start), dateTo: dateValue(end) };
};

type ReportFields = ProductionReport & Record<string, unknown>;

function machinePerformanceTotals(lines: Array<Record<string, unknown>>) {
    const machineNetHours = lines.reduce((sum, line) => {
        const gross = Math.max(0, num(line.machine_time_hours));
        const deduction = Math.max(0, num(line.deduction_time_hours));
        return sum + Math.max(0, gross - deduction);
    }, 0);

    const machineStandardTime = lines.reduce((sum, line) => {
        const netHours = Math.max(0, num(line.machine_time_hours) - num(line.deduction_time_hours));
        const lineStandard = Math.max(0, num(line.standard_output));
        return sum + (netHours > 0 && lineStandard > 0 ? netHours * lineStandard : 0);
    }, 0);

    return { machineNetHours, machineStandardTime };
}

function resolveReportStandard(report: ReportFields, extra: Record<string, unknown>) {
    return num(report.standard_output)
        || num(report.target_output)
        || num(report.standard_output_per_hour)
        || num(report.standardOutput)
        || num(extra.standard_output)
        || num(extra.target_output);
}

function resolveReportHours(
    report: ReportFields,
    extra: Record<string, unknown>,
    machineNetHours: number,
) {
    return num(report.actual_time)
        || num(report.actual_hours)
        || num(report.working_hours)
        || num(report.total_working_hours)
        || num(report.tt_gio)
        || num(extra.actual_time)
        || num(extra.actual_hours)
        || num(extra.working_hours)
        || machineNetHours;
}

function positiveSnapshot(value: unknown) {
    return value !== null && value !== undefined && value !== "" ? num(value) : 0;
}

const kpi = (report: ProductionReport) => {
    const fields = report as ReportFields;
    const ok = num(fields.tt_ok);
    const ng = num(fields.tt_ng);
    const actual = num(fields.actual_output) || ok + ng;
    const extra = getStoredExtraData(fields.extra_data);
    const standard = resolveReportStandard(fields, extra);
    const machineLines = Array.isArray(fields.machine_lines)
        ? fields.machine_lines as Array<Record<string, unknown>>
        : [];
    const { machineNetHours, machineStandardTime } = machinePerformanceTotals(machineLines);
    const actualTime = resolveReportHours(fields, extra, machineNetHours);

    // Persisted KPI snapshots take priority. Missing or nonpositive snapshots
    // fall back to machine-level standards, then the worker-level calculation.
    const storedStandard = fields.tt_dinh_muc
        ?? fields.tt_dinh_muc_snapshot
        ?? fields.standard_time_total
        ?? fields.standardTimeTotal;
    const standardSnapshot = positiveSnapshot(storedStandard);
    const ttDinhMuc = standardSnapshot > 0
        ? standardSnapshot
        : (machineStandardTime > 0
            ? machineStandardTime
            : (standard > 0 && actualTime > 0 ? standard * actualTime : 0));

    const storedProductivity = fields.nang_suat_percent
        ?? fields.nang_suat_percent_snapshot
        ?? fields.productivity_percent;
    const productivitySnapshot = positiveSnapshot(storedProductivity);
    const nangSuat = productivitySnapshot > 0
        ? productivitySnapshot
        : (ttDinhMuc > 0 ? actual / ttDinhMuc * 100 : 0);

    const dat = actual > 0 ? ok / actual * 100 : 0;
    const pp = num(fields.pp_percent) || (actual > 0 ? ng / actual * 100 : 0);
    const hv = fields.training_percent
        ?? fields.training_percent_snapshot
        ?? fields.worker_training_percent
        ?? fields.hv_percent
        ?? fields.learning_percent
        ?? fields.hoc_viec_percent
        ?? 100;
    const ngTypeCount = Math.max(
        num(fields.ng_defect_type_count),
        num(fields.worker_ng_type_count),
        num(fields.machine_ng_type_count),
    );
    const standardMissing = ttDinhMuc <= 0 && num(fields.standard_missing_lines) > 0;

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
