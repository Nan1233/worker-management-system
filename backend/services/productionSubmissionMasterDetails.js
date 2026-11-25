'use strict';
const { query } = require('../models/productionTempModelShared');

const resolveMasterDetails = async (processId, defects, deductions, executor) => {
    // Resolve worker-defined "other" names to real process-scoped type rows.
    await require("./customReportCategoryService").ensureCustomReportCategories({
        processId, defects, deductions,
        query: (sql, params) => query(executor, sql, params)
    });
    const defectItems = (Array.isArray(defects) ? defects : []).map((item) => ({
        id: Number(item?.defect_type_id || item?.id || 0) || null,
        code: String(item?.defect_code || item?.defect_type_code || item?.code || "").trim(),
        name: String(item?.defect_name || item?.name || item?.label || "").trim(),
        quantity: Math.trunc(Number(item?.quantity ?? item?.qty ?? item?.ng_quantity ?? 0) || 0)
    })).filter((x) => x.quantity > 0);

    const deductionItems = (Array.isArray(deductions) ? deductions : []).map((item) => ({
        id: Number(item?.deduction_type_id || item?.id || 0) || null,
        code: String(item?.deduction_code || item?.code || "").trim(),
        name: String(item?.deduction_name || item?.name || item?.label || "").trim(),
        hours: Number(item?.hours ?? item?.deduction_hours ?? 0) || 0
    })).filter((x) => x.hours > 0);

    const resolve = async (table, items, label) => {
        if (!items.length) return [];
        const ids = [...new Set(items.map((x) => x.id).filter(Boolean))];
        const codes = [...new Set(items.map((x) => x.code).filter(Boolean))];
        const names = [...new Set(items.map((x) => x.name).filter(Boolean))];
        const clauses = [];
        const params = [Number(processId)];
        if (ids.length) { clauses.push(`id IN (${ids.map(() => "?").join(",")})`); params.push(...ids); }
        if (codes.length) { clauses.push(`${table === "defect_types" ? "defect_code" : "deduction_code"} IN (${codes.map(() => "?").join(",")})`); params.push(...codes); }
        if (names.length) { clauses.push(`${table === "defect_types" ? "defect_name" : "deduction_name"} IN (${names.map(() => "?").join(",")})`); params.push(...names); }
        const rows = await query(executor,
            `SELECT id, ${table === "defect_types" ? "defect_code, defect_name" : "deduction_code, deduction_name"}
             FROM ${table} WHERE process_id=? AND status='active' AND (${clauses.join(" OR ")})`, params);
        const byId = new Map(rows.map((r) => [Number(r.id), r]));
        const codeField = table === "defect_types" ? "defect_code" : "deduction_code";
        const nameField = table === "defect_types" ? "defect_name" : "deduction_name";
        const byCode = new Map(rows.map((r) => [String(r[codeField] || "").trim().toUpperCase(), r]));
        const byName = new Map(rows.map((r) => [String(r[nameField] || "").trim(), r]));
        return items.map((item) => {
            const master = (item.id && byId.get(item.id)) || (item.code && byCode.get(item.code.toUpperCase())) || (item.name && byName.get(item.name));
            if (!master) {
                const error = new Error(`Không xác định được ${label}: ${item.code || item.name || item.id}`);
                error.status = 422; error.code = label === "loại lỗi NG" ? "DEFECT_TYPE_NOT_FOUND" : "DEDUCTION_TYPE_NOT_FOUND";
                error.isPublic = true; error.details = { process_id: processId, item }; throw error;
            }
            if (table === "defect_types") return { defect_type_id: Number(master.id), defect_code: master.defect_code || "", defect_name: master.defect_name || "", quantity: item.quantity };
            return { deduction_type_id: Number(master.id), deduction_code: master.deduction_code || "", deduction_name: master.deduction_name || "", hours: item.hours };
        });
    };

    const resolvedDefects = await resolve("defect_types", defectItems, "loại lỗi NG");
    const resolvedDeductions = await resolve("deduction_types", deductionItems, "loại trừ giờ");
    const defectTotals = new Map();
    for (const item of resolvedDefects) defectTotals.set(item.defect_type_id, (defectTotals.get(item.defect_type_id) || 0) + item.quantity);
    const deductionTotals = new Map();
    for (const item of resolvedDeductions) deductionTotals.set(item.deduction_type_id, (deductionTotals.get(item.deduction_type_id) || 0) + item.hours);
    return {
        defects: [...defectTotals.entries()].map(([id, quantity]) => {
            const source = resolvedDefects.find((x) => x.defect_type_id === id);
            return { ...source, defect_type_id: id, quantity };
        }),
        deductions: [...deductionTotals.entries()].map(([id, hours]) => {
            const source = resolvedDeductions.find((x) => x.deduction_type_id === id);
            return { ...source, deduction_type_id: id, hours };
        })
    };
};

module.exports = { resolveMasterDetails };
