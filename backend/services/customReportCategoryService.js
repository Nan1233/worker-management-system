const crypto = require("crypto");

const CUSTOM_NG_PREFIX = "CUSTOM_NG_";
const CUSTOM_DEDUCTION_PREFIX = "CUSTOM_DED_";
const MAX_NAME_LENGTH = 100;

// Worker-defined categories are process-scoped master entries. Keeping a real
// type ID lets pending, approved, machine, report detail and Excel paths keep
// using the existing relational detail tables without dropping quantities.
function customCode(prefix, processId, name) {
  const digest = crypto.createHash("sha256")
    .update(`${Number(processId)}:${String(name).normalize("NFC").toLocaleLowerCase("vi")}`)
    .digest("hex").slice(0, 20).toUpperCase();
  return prefix + digest;
}

function getEntries(items) {
  return (Array.isArray(items) ? items : []).filter((item) => item?.custom_other === true);
}

async function ensureCustomReportCategories({ processId, defects = [], deductions = [], query }) {
  if (!Number.isSafeInteger(Number(processId)) || Number(processId) <= 0) throw new Error("Công đoạn không hợp lệ");
  if (typeof query !== "function") throw new Error("Thiếu hàm truy vấn");
  for (const [items, table, codeColumn, nameColumn, prefix] of [
    [getEntries(defects), "defect_types", "defect_code", "defect_name", CUSTOM_NG_PREFIX],
    [getEntries(deductions), "deduction_types", "deduction_code", "deduction_name", CUSTOM_DEDUCTION_PREFIX],
  ]) {
    const seen = new Set();
    for (const item of items) {
      const name = String(item[nameColumn] || "").trim().normalize("NFC");
      if (!name || name.length > MAX_NAME_LENGTH || /[\\x00-\\x1F\\x7F]/.test(name)) {
        const error = new Error("Phải nhập tên NG khác / lý do trừ giờ khác hợp lệ trước khi nhập số liệu");
        error.status = 422; error.code = "CUSTOM_CATEGORY_NAME_REQUIRED"; error.isPublic = true;
        throw error;
      }
      const code = customCode(prefix, processId, name);
      if (seen.has(code)) continue;
      seen.add(code);
      // Avoid creating duplicates on retries. The generated code is stable
      // for a process/name pair; INSERT IGNORE handles concurrent submissions.
      await query(
        `INSERT IGNORE INTO ${table} (process_id, ${codeColumn}, ${nameColumn}, sort_order, status) VALUES (?, ?, ?, 9999, 'active')`,
        [Number(processId), code, name],
      );
      const rows = await query(
        `SELECT id, ${nameColumn} AS category_name FROM ${table} WHERE process_id=? AND ${codeColumn}=? AND status='active' LIMIT 1`,
        [Number(processId), code],
      );
      if (!rows.length || String(rows[0].category_name).trim().normalize("NFC") !== name) {
        const error = new Error("Không thể đăng ký loại NG/trừ giờ khác");
        error.status = 422; error.code = "CUSTOM_CATEGORY_CONFLICT"; error.isPublic = true;
        throw error;
      }
    }
  }
}

module.exports = { ensureCustomReportCategories, CUSTOM_NG_PREFIX, CUSTOM_DEDUCTION_PREFIX };
