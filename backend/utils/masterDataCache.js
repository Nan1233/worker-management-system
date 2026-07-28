const { TtlCache } = require("./cache");

// Danh mục thay đổi ít nhưng được đọc rất thường xuyên từ form công nhân.
// Cache chỉ tồn tại trong RAM của tiến trình, tự hết hạn và không làm thay đổi DB.
const masterDataCache = new TtlCache({ maxEntries: 300 });

const TTL = Object.freeze({
  machines: 10 * 60 * 1000,
  productStandards: 10 * 60 * 1000,
  defects: 30 * 60 * 1000,
  deductions: 30 * 60 * 1000,
});

module.exports = { masterDataCache, TTL };
