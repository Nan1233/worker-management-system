const db = require("../config/db");
const { mergeDefects, normalizeDeductions, workerDeclaredDefects } = require("../utils/reportDetailNormalizer");
const { query } = require("./productionTempModelShared");
const { paginationMeta } = require("../services/managerReportPaginationService");

function buildListFilters(managerId, filters, isAdmin, statusSql) {
    const conditions = [statusSql];
    const params = [];
    if (!isAdmin && managerId) {
        conditions.push("EXISTS (SELECT 1 FROM manager_processes mp_scope WHERE mp_scope.process_id = pr.process_id AND mp_scope.manager_id = ?)");
        params.push(managerId);
    }
    const dateFrom = filters.date_from || filters.dateFrom;
    const dateTo = filters.date_to || filters.dateTo;
    if (dateFrom) { conditions.push("pr.work_date >= ?"); params.push(dateFrom); }
    if (dateTo) { conditions.push("pr.work_date < DATE_ADD(?, INTERVAL 1 DAY)"); params.push(dateTo); }
    if (filters.work_date) { conditions.push("DATE(pr.work_date) = ?"); params.push(filters.work_date); }
    if (filters.process_id) { conditions.push("pr.process_id = ?"); params.push(Number(filters.process_id)); }
    if (filters.process_name) { conditions.push("p.process_name = ?"); params.push(String(filters.process_name).trim()); }
    if (filters.shift) { conditions.push("pr.shift = ?"); params.push(String(filters.shift).trim()); }
    if (filters.worker_id) { conditions.push("pr.worker_id = ?"); params.push(Number(filters.worker_id)); }
    if (filters.search) {
        const search = String(filters.search).trim();
        if (search) {
            const q = `%${search}%`;
            conditions.push("(w.worker_code LIKE ? OR u.full_name LIKE ? OR pr.machine_no LIKE ? OR pr.product_name LIKE ? OR p.process_name LIKE ?)");
            params.push(q, q, q, q, q);
        }
    }
    return { conditions, params };
}

function normalizeUtcTimestamp(value) {
    if (!value) return value;
    const text = String(value).trim();
    if (!text) return value;
    if (/[zZ]|[+-]\\d{2}:?\\d{2}$/.test(text)) return text;
    if (!/^\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?$/.test(text)) return value;
    return `${text.replace(" ", "T")}Z`;
}

function normalizeReportTimestamps(report) {
    if (!report) return report;
    return { ...report, created_at: normalizeUtcTimestamp(report.created_at), updated_at: normalizeUtcTimestamp(report.updated_at) };
}

async function getProcessOptions(managerId, isAdmin) {
    if (isAdmin || !managerId) return query(db, `SELECT p.id, p.process_code, p.process_name FROM processes p WHERE p.status = 'active' ORDER BY p.process_name`);
    return query(db, `SELECT DISTINCT p.id, p.process_code, p.process_name FROM processes p INNER JOIN manager_processes mp ON mp.process_id = p.id WHERE p.status = 'active' AND mp.manager_id = ? ORDER BY p.process_name`, [managerId]);
}

async function getPreviousPendingCount(managerId, isAdmin) {
    if (isAdmin || !managerId) return 0;
    const rows = await query(db, `SELECT COUNT(*) AS total FROM production_reports_temp pr WHERE pr.status IN ('pending','need_fix') AND EXISTS (SELECT 1 FROM manager_processes mp WHERE mp.process_id = pr.process_id AND mp.manager_id = ?)`, [managerId]);
    return Number(rows?.[0]?.total || 0);
}

async function getTempMachineLines(id) {
    return query(db, `SELECT ml.* FROM production_temp_machine_lines ml WHERE ml.temp_report_id = ? ORDER BY ml.id`, [id]);
}

function parseDefectsJson(value) {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined || value === "") return [];
    try {
        const parsed = typeof value === "string" ? JSON.parse(value) : value;
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function normalizeMachineDefect(item) {
    return {
        id: item?.id ?? null,
        defect_type_id: Number(item?.defect_type_id ?? item?.defect_id ?? 0) || null,
        defect_code: String(item?.defect_code ?? "").trim(),
        defect_name: String(item?.defect_name ?? "").trim(),
        quantity: Math.max(0, Math.trunc(Number(item?.quantity ?? item?.qty ?? 0) || 0)),
    };
}

function getJsonMachineDefects(line) {
    return parseDefectsJson(line?.defects_json)
        .map(normalizeMachineDefect)
        .filter((item) => item.quantity > 0);
}

function mergeMachineDefects(lines, defects, eventDefects) {
    const byLine = new Map();
    for (const defect of defects || []) {
        const key = Number(defect.machine_line_id);
        if (!byLine.has(key)) byLine.set(key, []);
        byLine.get(key).push(defect);
    }
    const byEvent = new Map();
    for (const defect of eventDefects || []) {
        const key = Number(defect.machine_event_id);
        if (!byEvent.has(key)) byEvent.set(key, []);
        byEvent.get(key).push(defect);
    }
    return (lines || []).map((line) => {
        const childDefects = byLine.get(Number(line.id)) || [];
        const eventChildDefects = byEvent.get(Number(line.machine_event_id)) || [];
        const defectsFromJson = getJsonMachineDefects(line);
        return {
            ...line,
            defects: childDefects.length ? childDefects : (eventChildDefects.length ? eventChildDefects : defectsFromJson),
        };
    });
}

function enrichMachineLines(lines) {
    return (lines || []).map((line) => ({
        ...line,
        defects: getJsonMachineDefects(line),
    }));
}


// KPI inputs of a machine-line report. GC machine reports intentionally store actual_time/total_time = 0 on the
// parent row and keep the real time and the per-line standard on production_temp_machine_lines, so every consumer
// (pending list and detail) must derive them from the lines the same way, otherwise the list shows TT định mức = 0
// and năng suất = 0% while the detail shows real figures.
function deriveMachineKpiFields(row, machineLines) {
    const lines = Array.isArray(machineLines) ? machineLines : [];
    const hoursOf = (line) => Math.max(0, Number(line.machine_time_hours) || 0);
    const outputOf = (line) => Math.max(0, Number(line.standard_output) || 0);
    const machineLineTime = lines.reduce((sum, line) => sum + hoursOf(line), 0);
    const machineLineStandardTime = lines.reduce((sum, line) => sum + (hoursOf(line) > 0 && outputOf(line) > 0 ? hoursOf(line) * outputOf(line) : 0), 0);
    const parentActualTime = Math.max(0, Number(row.actual_time) || 0);
    const parentStandardOutput = Math.max(0, Number(row.standard_output) || 0);
    const actualTime = parentActualTime > 0 ? parentActualTime : (machineLineTime > 0 ? machineLineTime : parentActualTime);
    const ttDinhMuc = Number(row.tt_dinh_muc) > 0
        ? Number(row.tt_dinh_muc)
        : (machineLineStandardTime > 0 ? machineLineStandardTime : (parentStandardOutput > 0 && actualTime > 0 ? parentStandardOutput * actualTime : 0));
    const standardOutput = parentStandardOutput > 0 ? parentStandardOutput : (machineLineTime > 0 ? machineLineStandardTime / machineLineTime : 0);
    // Lines that ran but have no usable standard: the UI must say "thiếu định mức" instead of a misleading 0%.
    const linesMissingStandard = lines.filter((line) => hoursOf(line) > 0 && outputOf(line) <= 0).length;
    return { actual_time: actualTime, tt_dinh_muc: ttDinhMuc, standard_output: standardOutput, standard_missing_lines: linesMissingStandard };
}

async function attachPendingChildren(items) {
    if (!items?.length) return items || [];
    const ids = items.map((item) => Number(item.id)).filter((id) => Number.isInteger(id) && id > 0);
    if (!ids.length) return items;
    const placeholders = ids.map(() => "?").join(",");
    const [defects, deductions, machineLines] = await Promise.all([
        query(db, `SELECT d.id,d.temp_report_id,d.defect_type_id,dt.defect_code,dt.defect_name,d.quantity FROM production_temp_defects d LEFT JOIN defect_types dt ON dt.id=d.defect_type_id WHERE d.temp_report_id IN (${placeholders}) ORDER BY d.temp_report_id,COALESCE(dt.sort_order,999999),d.id`, ids),
        query(db, `SELECT d.id,d.temp_report_id,d.deduction_type_id,dt.deduction_code,dt.deduction_name,d.hours FROM production_temp_deductions d LEFT JOIN deduction_types dt ON dt.id=d.deduction_type_id WHERE d.temp_report_id IN (${placeholders}) ORDER BY d.temp_report_id,COALESCE(dt.sort_order,999999),d.id`, ids),
        query(db, `SELECT ml.* FROM production_temp_machine_lines ml WHERE ml.temp_report_id IN (${placeholders}) ORDER BY ml.temp_report_id,ml.id`, ids)
    ]);
    const byDefect = new Map();
    const byDeduction = new Map();
    const byMachine = new Map();
    for (const row of defects || []) { const id = Number(row.temp_report_id); if (!byDefect.has(id)) byDefect.set(id, []); byDefect.get(id).push(row); }
    for (const row of deductions || []) { const id = Number(row.temp_report_id); if (!byDeduction.has(id)) byDeduction.set(id, []); byDeduction.get(id).push(row); }
    for (const row of machineLines || []) { const id = Number(row.temp_report_id); if (!byMachine.has(id)) byMachine.set(id, []); byMachine.get(id).push(row); }
    return items.map((item) => {
        const defectsForReport = byDefect.get(Number(item.id)) || [];
        const deductionsForReport = byDeduction.get(Number(item.id)) || [];
        const machinesForReport = enrichMachineLines(byMachine.get(Number(item.id)) || []);
        const detailNg = defectsForReport.reduce((sum, row) => sum + Math.max(0, Math.trunc(Number(row.quantity) || 0)), 0);
        const ttNg = Math.max(0, Math.trunc(Number(item.tt_ng) || 0));
        return normalizeReportTimestamps({
            ...item,
            ...(machinesForReport.length ? deriveMachineKpiFields(item, machinesForReport) : {}),
            defects: defectsForReport,
            deductions: normalizeDeductions(deductionsForReport),
            machine_lines: machinesForReport,
            ng_detail_total: detailNg,
            ng_unclassified: Math.max(0, ttNg - detailNg),
            ng_detail_complete: detailNg === ttNg
        });
    });
}

module.exports = {
    deriveMachineKpiFields,
    async getPending(managerId, filters = {}, isAdmin = false) {
        const { page = 1, page_size: pageSize = 20, offset = 0 } = filters.pagination || {};
        const { conditions, params } = buildListFilters(managerId, filters, isAdmin, "pr.status IN ('pending','need_fix')");
        const where = conditions.join(" AND ");
        const includeMeta = filters.include_meta !== false && filters.include_meta !== 0;
        const [countRows, items, processes, previousCount] = await Promise.all([
            query(db, `SELECT COUNT(*) AS total FROM production_reports_temp pr JOIN workers w ON pr.worker_id=w.id JOIN users u ON w.user_id=u.id JOIN processes p ON pr.process_id=p.id WHERE ${where}`, params),
            query(db, `SELECT pr.*,w.user_id,w.worker_code,u.full_name,p.process_name,p.process_code FROM production_reports_temp pr JOIN workers w ON pr.worker_id=w.id JOIN users u ON w.user_id=u.id JOIN processes p ON pr.process_id=p.id WHERE ${where} ORDER BY pr.work_date DESC, pr.created_at ASC, pr.id ASC LIMIT ? OFFSET ?`, [...params, pageSize, offset]),
            includeMeta ? getProcessOptions(managerId, isAdmin) : Promise.resolve([]),
            includeMeta ? getPreviousPendingCount(managerId, isAdmin) : Promise.resolve(0)
        ]);
        const enrichedItems = await attachPendingChildren(items);
        return { items: enrichedItems, pagination: paginationMeta({page,pageSize,total:Number(countRows?.[0]?.total||0)}), processes, previous_count: previousCount };
    },
    async getApproved(managerId, filters = {}, isAdmin = false) {
        const { page = 1, page_size: pageSize = 20, offset = 0 } = filters.pagination || {};
        const { conditions, params } = buildListFilters(managerId, filters, isAdmin, "pr.status = 'approved'");
        const where = conditions.join(" AND ");
        const countRows = await query(db, `SELECT COUNT(*) AS total FROM production_reports pr JOIN workers w ON pr.worker_id=w.id JOIN users u ON w.user_id=u.id JOIN processes p ON pr.process_id=p.id WHERE ${where}`, params);
        const items = await query(db, `SELECT pr.*,w.worker_code,u.full_name,p.process_name,p.process_code FROM production_reports pr JOIN workers w ON pr.worker_id=w.id JOIN users u ON w.user_id=u.id JOIN processes p ON pr.process_id=p.id WHERE ${where} ORDER BY pr.approved_at DESC, pr.id DESC LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
        const ids = items.map((item) => Number(item.id)).filter((id) => Number.isInteger(id) && id > 0);
        let enrichedItems = items;
        if (ids.length) {
            const placeholders = ids.map(() => "?").join(",");
            const machineLines = await query(db, `SELECT ml.* FROM production_report_machine_lines ml WHERE ml.report_id IN (${placeholders}) ORDER BY ml.report_id,ml.id`, ids);
            const byReport = new Map();
            for (const line of machineLines || []) {
                const id = Number(line.report_id);
                if (!byReport.has(id)) byReport.set(id, []);
                byReport.get(id).push(line);
            }
            enrichedItems = items.map((item) => {
                const lines = enrichMachineLines(byReport.get(Number(item.id)) || []);
                return normalizeReportTimestamps({
                    ...item,
                    ...(lines.length ? deriveMachineKpiFields(item, lines) : {}),
                    machine_lines: lines,
                    training_percent: item.training_percent_snapshot ?? item.training_percent
                });
            });
        }
        const processes = await getProcessOptions(managerId, isAdmin);
        return { items: enrichedItems, pagination: paginationMeta({page,pageSize,total:Number(countRows?.[0]?.total||0)}), processes };
    },
    async getDates(managerId = null) {
        if (managerId) return query(db, `SELECT DISTINCT DATE(pr.work_date) AS date FROM production_reports_temp pr WHERE pr.status IN ('pending','need_fix') AND EXISTS (SELECT 1 FROM manager_processes mp WHERE mp.process_id=pr.process_id AND mp.manager_id=?) ORDER BY date DESC`, [managerId]);
        return query(db, `SELECT DISTINCT DATE(work_date) AS date FROM production_reports_temp WHERE status IN ('pending','need_fix') ORDER BY date DESC`);
    },
    async getByDate(date, managerId = null) {
        const params=[date]; let scope="";
        if (managerId) { scope=" AND mp.manager_id=?"; params.push(managerId); }
        return query(db, `SELECT pr.*,w.worker_code,u.full_name,p.process_name,CASE WHEN dup.duplicate_count>1 THEN 1 ELSE 0 END AS is_duplicate,COALESCE(dup.duplicate_count,1) AS duplicate_count FROM production_reports_temp pr JOIN workers w ON pr.worker_id=w.id JOIN users u ON w.user_id=u.id JOIN processes p ON pr.process_id=p.id LEFT JOIN manager_processes mp ON mp.process_id=pr.process_id LEFT JOIN (SELECT worker_id,work_date,shift,machine_no,product_name,COUNT(*) AS duplicate_count FROM production_reports_temp WHERE status IN ('pending','need_fix') GROUP BY worker_id,work_date,shift,machine_no,product_name) dup ON dup.worker_id=pr.worker_id AND dup.work_date=pr.work_date AND dup.shift=pr.shift AND COALESCE(dup.machine_no,'')=COALESCE(pr.machine_no,'') AND COALESCE(dup.product_name,'')=COALESCE(pr.product_name,'') WHERE pr.work_date=? AND pr.status IN ('pending','need_fix') ${scope} ORDER BY pr.created_at ASC`, params);
    },
    // options.skipChildRows: the caller supplies its own defects/deductions (edit payload) and does not read these two
    // child lists, so they are not fetched (two fewer TiDB subrequests on Cloudflare Workers).
    async getDetail(id, options = {}) {
        const rows=await query(db,`SELECT pr.*,w.worker_code,u.full_name,p.process_name,p.process_code,reviewer.full_name AS reviewer_name FROM production_reports_temp pr LEFT JOIN workers w ON pr.worker_id=w.id LEFT JOIN users u ON w.user_id=u.id LEFT JOIN processes p ON pr.process_id=p.id LEFT JOIN users reviewer ON reviewer.id=pr.reviewed_by WHERE pr.id=? LIMIT 1`,[id]);
        if(rows[0]){
            const [defects,deductions,machineLines]=await Promise.all([
                options.skipChildRows===true?Promise.resolve([]):query(db,`SELECT d.id,d.defect_type_id,dt.defect_code,dt.defect_name,d.quantity FROM production_temp_defects d LEFT JOIN defect_types dt ON dt.id=d.defect_type_id WHERE d.temp_report_id=? ORDER BY COALESCE(dt.sort_order,999999),d.id`,[id]),
                options.skipChildRows===true?Promise.resolve([]):query(db,`SELECT d.id,d.deduction_type_id,dt.deduction_code,dt.deduction_name,d.hours FROM production_temp_deductions d LEFT JOIN deduction_types dt ON dt.id=d.deduction_type_id WHERE d.temp_report_id=? ORDER BY COALESCE(dt.sort_order,999999),d.id`,[id]),
                getTempMachineLines(id)
            ]);
            const detailNg = (defects || []).reduce((sum, row) => sum + Math.max(0, Math.trunc(Number(row.quantity) || 0)), 0);
            const ttNg = Math.max(0, Math.trunc(Number(rows[0].tt_ng) || 0));
            // Machine-based pending reports keep their authoritative time and
            // standard snapshots on production_temp_machine_lines. The parent
            // row can have standard_output=0 for multi-machine reports, so
            // enrich the detail response from those saved line snapshots.
            const enrichedMachineLines = mergeMachineDefects(machineLines,[],[]);
            const kpiFields=deriveMachineKpiFields(rows[0],enrichedMachineLines);
            const enriched={...rows[0],...kpiFields,machine_lines:enrichedMachineLines};
            return normalizeReportTimestamps({...enriched,defects:mergeDefects(rows[0],defects,machineLines),worker_defects:workerDeclaredDefects(defects),deductions:normalizeDeductions(deductions),ng_detail_total:detailNg,ng_unclassified:Math.max(0,ttNg-detailNg),ng_detail_complete:detailNg===ttNg});
        }

        const approvedRows=await query(db,`SELECT pr.*,w.worker_code,u.full_name,p.process_name,p.process_code,reviewer.full_name AS reviewer_name FROM production_reports pr LEFT JOIN workers w ON pr.worker_id=w.id LEFT JOIN users u ON w.user_id=u.id LEFT JOIN processes p ON pr.process_id=p.id LEFT JOIN users reviewer ON reviewer.id=pr.reviewed_by WHERE pr.id=? AND pr.status='approved' LIMIT 1`,[id]);
        if(!approvedRows[0]) return null;
        const approved=approvedRows[0];
        let defects=[]; let deductions=[]; let machineLines=[];
        try { defects=await query(db,`SELECT d.id,d.defect_type_id,dt.defect_code,dt.defect_name,d.quantity FROM production_report_defects d LEFT JOIN defect_types dt ON dt.id=d.defect_type_id WHERE d.report_id=? ORDER BY COALESCE(dt.sort_order,999999),d.id`,[id]); } catch(e) { console.warn('APPROVED DETAIL DEFECT FALLBACK:',e?.message||e); }
        try { deductions=await query(db,`SELECT d.id,d.deduction_type_id,dt.deduction_code,dt.deduction_name,d.hours FROM production_report_deductions d LEFT JOIN deduction_types dt ON dt.id=d.deduction_type_id WHERE d.report_id=? ORDER BY COALESCE(dt.sort_order,999999),d.id`,[id]); } catch(e) { console.warn('APPROVED DETAIL DEDUCTION FALLBACK:',e?.message||e); }
        try { machineLines=await query(db,`SELECT ml.* FROM production_report_machine_lines ml WHERE ml.report_id=? ORDER BY ml.id`,[id]); } catch(e) { console.warn('APPROVED DETAIL MACHINE FALLBACK:',e?.message||e); }
        const detailNg = (defects || []).reduce((sum, row) => sum + Math.max(0, Math.trunc(Number(row.quantity) || 0)), 0);
        const ttNg = Math.max(0, Math.trunc(Number(approved.tt_ng) || 0));
        const enrichedMachineLines = mergeMachineDefects(machineLines,[],[]);
        const kpiFields = deriveMachineKpiFields(approved, enrichedMachineLines);
        return normalizeReportTimestamps({...approved,...(enrichedMachineLines.length ? kpiFields : {}),defects:mergeDefects(approved,defects,machineLines),worker_defects:workerDeclaredDefects(defects),deductions:normalizeDeductions(deductions),machine_lines:enrichedMachineLines,ng_detail_total:detailNg,ng_unclassified:Math.max(0,ttNg-detailNg),ng_detail_complete:detailNg===ttNg,report_type:'approved'});
    },
    async canManageReport(reportId, managerId, isAdmin=false) {
        if(isAdmin) return true;
        const rows=await query(db,`SELECT 1 FROM production_reports_temp pr WHERE pr.id=? AND EXISTS (SELECT 1 FROM manager_processes mp WHERE mp.process_id=pr.process_id AND mp.manager_id=?) LIMIT 1`,[reportId,managerId]);
        if(rows.length) return true;
        const approvedRows=await query(db,`SELECT 1 FROM production_reports pr WHERE pr.id=? AND pr.status='approved' AND EXISTS (SELECT 1 FROM manager_processes mp WHERE mp.process_id=pr.process_id AND mp.manager_id=?) LIMIT 1`,[reportId,managerId]);
        return approvedRows.length>0;
    }
};