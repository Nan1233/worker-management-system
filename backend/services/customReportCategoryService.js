const crypto = require("crypto");

const CUSTOM_NG_PREFIX = "CUSTOM_NG_";
const CUSTOM_DEDUCTION_PREFIX = "CUSTOM_DED_";
const MAX_NAME_LENGTH = 100;

/** Deterministic process-scoped type codes let the existing detail/approval/Excel
 * paths persist custom names without changing the relational child-table schema. */
function customCode(prefix, processId, name) {
  return prefix + crypto.createHash("sha256")
    .update(`${Number(processId)}:${String(name).normalize("NFC")}`)
    .digest("hex").slice(0, 20).toUpperCase();
}

function customName(item, field) {
  const name = String(item?.[field] || "").trim().normalize("NFC");
  if (!name || name.length > MAX_NAME_LENGTH || /[\\x00-\\x1F\\x7F]/.test(name)) {
    const error = new Error("Phải nhập tên NG khác / lý do trừ giờ khác hợp lệ trước khi nhập số liệu");
    error.status = 422;
    error.code = "CUSTOM_CATEGORY_NAME_REQUIRED";
    error.isPublic = true;
    throw error;
  }
  return name;
}

async function ensureCustomReportCategories({ processId, defects = [], deductions = [], query }) {
  const pid = Number(processId);
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("Công đoạn không hợp lệ");
  if (typeof query !== "function") throw new Error("Thiếu hàm truy vấn");

  const configs = [
    { items: defects, table: "defect_types", nameCol: "defect_name", codeCol: "defect_code", idCol: "defect_type_id", prefix: CUSTOM_NG_PREFIX },
    { items: deductions, table: "deduction_types", nameCol: "deduction_name", codeCol: "deduction_code", idCol: "deduction_type_id", prefix: CUSTOM_DEDUCTION_PREFIX },
  ];

  for (const { items, table, nameCol, codeCol, idCol, prefix } of configs) {
    const custom = (Array.isArray(items) ? items : []).filter((item) => item?.custom_other === true);
    if (!custom.length) continue;
    const records = custom.map((item) => {
      const name = customName(item, nameCol);
      return { item, name, code: customCode(prefix, pid, name) };
    });
    const unique = [...new Map(records.map((record) => [record.code, record])).values()];
    await query(
      `INSERT IGNORE INTO ${table} (process_id, ${codeCol}, ${nameCol}, sort_order, status) VALUES ${unique.map(() => "(?, ?, ?, 9999, 'active')").join(", ")}`,
      unique.flatMap((record) => [pid, record.code, record.name]),
    );
    const rows = await query(
      `SELECT id, ${codeCol} AS category_code, ${nameCol} AS category_name FROM ${table} WHERE process_id=? AND status='active' AND ${codeCol} IN (${unique.map(() => "?").join(",")})`,
      [pid, ...unique.map((record) => record.code)],
    );
    const byCode = new Map(rows.map((row) => [String(row.category_code || "").toUpperCase(), row]));
    for (const record of records) {
      const row = byCode.get(record.code);
      if (!row || String(row.category_name || "").trim().normalize("NFC") !== record.name) {
        const error = new Error("Không thể đăng ký loại NG/trừ giờ khác");
        error.status = 422;
        error.code = "CUSTOM_CATEGORY_CONFLICT";
        error.isPublic = true;
        throw error;
      }
      record.item[idCol] = Number(row.id);
      record.item[codeCol] = record.code;
    }
  }
}

module.exports = { ensureCustomReportCategories, CUSTOM_NG_PREFIX, CUSTOM_DEDUCTION_PREFIX };
