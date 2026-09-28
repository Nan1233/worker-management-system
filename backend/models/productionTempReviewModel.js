const db = require("../config/db");
const approvalModel = require("./productionTempApprovalModel");
const updateModel = require("./productionTempUpdateModel");
const readModel = require("./productionTempReadModel");

const EDIT_WINDOW_MS = 10 * 60 * 1000;

function parseDefectsJson(value) {
    if (!value) return [];
    try {
        const parsed = typeof value === "string" ? JSON.parse(value) : value;
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === "object") {
            if (Array.isArray(parsed.defects)) return parsed.defects;
            return Object.values(parsed).filter((item) => item && typeof item === "object");
        }
    } catch (_) {}
    return [];
}

function defectKey(item) {
    const id = Number(item?.defect_type_id || item?.id || 0);
    if (id > 0) return `id:${id}`;
    const code = String(item?.defect_code || item?.code || "").trim().toUpperCase();
    return code ? `code:${code}` : `name:${String(item?.defect_name || item?.name || "").trim()}`;
}

function aggregateDefects(lines) {
    const map = new Map();
    for (const line of lines) {
        for (const item of Array.isArray(line?.defects) ? line.defects : []) {
            const quantity = Math.max(0, Math.trunc(Number(item?.quantity ?? item?.qty ?? 0) || 0));
            if (!quantity) continue;
            const key = defectKey(item);
            const current = map.get(key);
            if (current) current.quantity += quantity;
            else map.set(key, {
                defect_type_id: Number(item?.defect_type_id || item?.id || 0) || undefined,
                defect_code: String(item?.defect_code || item?.code || ""),
                defect_name: String(item?.defect_name || item?.name || item?.label || ""),
                quantity,
            });
        }
    }
    return [...map.values()];
}

async function hydrateAndValidateMachineLines(reportId, incomingLines) {
    const lines = Array.isArray(incomingLines) ? incomingLines.map((line) => ({ ...line })) : [];
    if (!lines.length) return { lines, defects: [], totalNg: 0 };

    const [storedRows] = await db.promise().query(
        `SELECT machine_code, product_code, defects_json, ng_quantity
           FROM production_temp_machine_lines
          WHERE temp_report_id=?
          ORDER BY sort_order,id`,
        [Number(reportId)]
    );

    const stored = new Map();
    for (const row of storedRows || []) {
        const key = `${String(row.machine_code || "").trim().toUpperCase()}|${String(row.product_code || "").trim()}`;
        stored.set(key, { defects: parseDefectsJson(row.defects_json), ng: Number(row.ng_quantity || 0) });
    }

    for (const line of lines) {
        let defects = Array.isArray(line.defects) ? line.defects : [];
        const ng = Math.max(0, Math.trunc(Number(line.ng_quantity) || 0));
        const key = `${String(line.machine_code || "").trim().toUpperCase()}|${String(line.product_code || "").trim()}`;
        const old = stored.get(key);

        // Older rows can have the authoritative machine NG detail only in defects_json.
        // Restore it when the client sends the same machine/NG but omits the child array.
        if (!defects.length && ng > 0 && old?.defects?.length && Number(old.ng) === ng) {
            defects = old.defects;
            line.defects = defects;
        }

        const detailNg = defects.reduce((sum, item) => sum + Math.max(0, Math.trunc(Number(item?.quantity) || 0)), 0);
        if (detailNg !== ng) {
            const error = new Error(`Chi tiết NG của máy ${line.machine_code || ""} (${detailNg}) không khớp NG máy (${ng}). Không lưu để tránh làm sai dữ liệu.`);
            error.status = 422;
            error.code = "MACHINE_NG_DETAIL_MISMATCH";
            error.isPublic = true;
            error.details = { machine_code: line.machine_code, expected_ng: ng, detail_ng: detailNg };
            throw error;
        }
    }

    const defects = aggregateDefects(lines);
    const totalNg = lines.reduce((sum, line) => sum + Math.max(0, Math.trunc(Number(line.ng_quantity) || 0)), 0);
    const defectTotal = defects.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    if (defectTotal !== totalNg) {
        const error = new Error(`Tổng chi tiết NG (${defectTotal}) không khớp tổng NG máy (${totalNg}).`);
        error.status = 422;
        error.code = "MACHINE_NG_TOTAL_MISMATCH";
        error.isPublic = true;
        throw error;
    }
    return { lines, defects, totalNg };
}

async function getWorkerEditState(id, workerId) {
    const [rows] = await db.promise().query(
        `SELECT id,worker_id,status,created_at,updated_at
           FROM production_reports_temp
          WHERE id=? LIMIT 1`,
        [Number(id)]
    );
    const current = rows?.[0];
    if (!current) {
        const error = new Error("Không tìm thấy báo cáo.");
        error.status = 404; error.code = "TEMP_REPORT_NOT_FOUND"; error.isPublic = true;
        throw error;
    }
    if (Number(current.worker_id) !== Number(workerId)) {
        const error = new Error("Bạn không có quyền sửa báo cáo này.");
        error.status = 403; error.code = "TEMP_REPORT_FORBIDDEN"; error.isPublic = true;
        throw error;
    }
    if (!["pending", "need_fix"].includes(String(current.status || "").toLowerCase())) {
        const error = new Error("Báo cáo này không còn ở trạng thái có thể sửa.");
        error.status = 423; error.code = "TEMP_REPORT_NOT_EDITABLE"; error.isPublic = true;
        throw error;
    }
    const createdMs = new Date(current.created_at).getTime();
    if (!Number.isFinite(createdMs) || Date.now() > createdMs + EDIT_WINDOW_MS) {
        const error = new Error("Báo cáo đã hết 10 phút chỉnh sửa và chỉ còn được xem.");
        error.status = 423; error.code = "TEMP_REPORT_EDIT_WINDOW_EXPIRED"; error.isPublic = true;
        throw error;
    }
    return current;
}

module.exports = {
    ...approvalModel,
    ...updateModel,

    async getDetail(id) {
        const data = await readModel.getDetail(id);
        if (!data) return null;

        const [rows] = await db.promise().query(
            `SELECT machine_code,product_code,defects_json,ng_quantity
               FROM production_temp_machine_lines
              WHERE temp_report_id=?
              ORDER BY sort_order,id`,
            [Number(id)]
        );
        const byKey = new Map();
        for (const row of rows || []) {
            const key = `${String(row.machine_code || "").trim().toUpperCase()}|${String(row.product_code || "").trim()}`;
            byKey.set(key, parseDefectsJson(row.defects_json));
        }
        const machineLines = (Array.isArray(data.machine_lines) ? data.machine_lines : []).map((line) => {
            const key = `${String(line.machine_code || "").trim().toUpperCase()}|${String(line.product_code || "").trim()}`;
            const defects = Array.isArray(line.defects) && line.defects.length ? line.defects : (byKey.get(key) || []);
            return { ...line, defects };
        });

        const machineDefects = aggregateDefects(machineLines);
        const machineNg = machineLines.reduce((sum, line) => sum + Math.max(0, Math.trunc(Number(line.ng_quantity) || 0)), 0);
        if (machineLines.length && machineNg === machineDefects.reduce((sum, item) => sum + Number(item.quantity || 0), 0)) {
            data.defects = machineDefects;
            data.tt_ng = machineNg;
        }
        data.machine_lines = machineLines;
        return data;
    },

    async updateReport(id, data, changedBy, reason = null, options = {}) {
        const isWorkerEdit = Number(options?.workerId) > 0;
        if (isWorkerEdit) await getWorkerEditState(id, options.workerId);

        let nextData = data && typeof data === "object" ? { ...data } : {};
        if (Array.isArray(nextData.machine_lines)) {
            const normalized = await hydrateAndValidateMachineLines(id, nextData.machine_lines);
            nextData.machine_lines = normalized.lines;
            nextData.defects = normalized.defects;
            nextData.tt_ng = normalized.totalNg;
        }

        return updateModel.updateReport(id, nextData, changedBy, reason, options);
    },
};
