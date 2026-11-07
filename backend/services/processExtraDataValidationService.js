// Open a DB connection only when the runtime validator actually queries data.
// Injected query functions in unit tests must not bootstrap the TiDB pool.
const defaultQuery = (sql, params = []) => new Promise((resolve, reject) => {
    const db = require("../config/db");
    db.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows || []));
});

const normalizeExtraData = (value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) return { ...value };
    if (typeof value === "string" && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        } catch (_) {
            return {};
        }
    }
    return {};
};

const createProcessExtraDataValidator = ({ query = defaultQuery } = {}) => async ({ processCode, extraData }) => {
    const normalizedCode = String(processCode || "").trim().toUpperCase();
    const normalizedExtraData = normalizeExtraData(extraData);
    if (normalizedCode !== "DO") return { valid: true, extraData: normalizedExtraData, errors: {} };

    const requestedMachine = String(normalizedExtraData.grinding_machine_no || "").trim();
    if (!requestedMachine) return { valid: true, extraData: normalizedExtraData, errors: {} };

    const rows = await query(
        `SELECT m.machine_code
           FROM machines m
           JOIN processes p ON p.id = m.process_id
          WHERE UPPER(TRIM(p.process_code)) = 'MAI'
            AND m.status = 'active'
            AND UPPER(TRIM(m.machine_code)) = UPPER(TRIM(?))
          LIMIT 2`,
        [requestedMachine]
    );
    if (rows.length !== 1) {
        return {
            valid: false,
            extraData: normalizedExtraData,
            errors: { grinding_machine_no: "Máy Mài liên quan không tồn tại hoặc đã ngừng hoạt động" }
        };
    }

    return {
        valid: true,
        extraData: { ...normalizedExtraData, grinding_machine_no: String(rows[0].machine_code).trim() },
        errors: {}
    };
};

const validateProcessExtraData = createProcessExtraDataValidator();
module.exports = { createProcessExtraDataValidator, validateProcessExtraData };
