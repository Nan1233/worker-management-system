'use strict';

const { normalizeLabel } = require('./excelTemplateContractService');

function finiteNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function normalizedDetailName(item) {
  return normalizeLabel(
    item?.name
      || item?.deduction_name
      || item?.defect_name
      || item?.code
      || item?.deduction_code
      || item?.defect_code
  );
}

function matchesDetail(item, id, normalizedTarget, typeIdKey) {
  const itemId = Number(item?.[typeIdKey] ?? item?.id);
  const itemName = normalizedDetailName(item);
  const matchesId = Boolean(id) && itemId === Number(id);
  const matchesName = Boolean(normalizedTarget && itemName)
    && (itemName === normalizedTarget
      || itemName.includes(normalizedTarget)
      || normalizedTarget.includes(itemName));

  return matchesId || matchesName;
}

function detailValue(items, id, name, key) {
  const normalizedTarget = normalizeLabel(name);
  const typeIdKey = key === 'hours' ? 'deduction_type_id' : 'defect_type_id';

  return (items || []).reduce((total, item) => {
    if (!matchesDetail(item, id, normalizedTarget, typeIdKey)) return total;
    return total + finiteNumber(item?.[key] ?? item?.quantity ?? item?.value);
  }, 0);
}

module.exports = { detailValue };
