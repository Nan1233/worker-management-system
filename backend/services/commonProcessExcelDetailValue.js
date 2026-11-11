'use strict';
const { normalizeLabel } = require('./excelTemplateContractService');
const alias = normalizeLabel;
function num(value) { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; }

function detailValue(items, id, name, key) {
  const target = alias(name);
  return (items || []).filter((item) => {
    const itemId = Number(item?.[key === 'hours' ? 'deduction_type_id' : 'defect_type_id'] ?? item?.id);
    const itemName = alias(item?.name || item?.deduction_name || item?.defect_name || item?.code || item?.deduction_code || item?.defect_code);
    return (id && itemId === Number(id)) || (target && itemName && (itemName === target || itemName.includes(target) || target.includes(itemName)));
  }).reduce((sum, item) => sum + num(item?.[key] ?? item?.quantity ?? item?.value), 0);
}

module.exports = { detailValue };
