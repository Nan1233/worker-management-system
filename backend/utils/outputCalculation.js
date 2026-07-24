const KQD_CODES = new Set(['KQD', 'KQD_DL', 'KQD_DAP_LAI', 'KQD_TUOT']);

const normalizeCode = (value) => String(value || '').trim().toUpperCase();

const isKqdDefect = (item = {}) => {
  const code = normalizeCode(item.defect_code || item.code);
  const name = normalizeCode(item.defect_name || item.name).replace(/\s+/g, '_');
  return KQD_CODES.has(code) || code.startsWith('KQD') || name.startsWith('KQD');
};

const calculateCountedNg = (defects = [], excludeKqdFromTt = false) =>
  (defects || []).reduce((sum, item) => {
    if (excludeKqdFromTt && isKqdDefect(item)) return sum;
    const quantity = Number(item.quantity || 0);
    return sum + (Number.isFinite(quantity) ? quantity : 0);
  }, 0);

const calculateActualOutput = ({ ttOk, defects, excludeKqdFromTt = false }) =>
  Number(ttOk || 0) + calculateCountedNg(defects, excludeKqdFromTt);

module.exports = {
  KQD_CODES,
  isKqdDefect,
  calculateCountedNg,
  calculateActualOutput
};
