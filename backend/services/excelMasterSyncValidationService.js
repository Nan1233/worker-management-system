'use strict';

const crypto = require('node:crypto');
const { safeValidateMasterNumeric } = require('./masterNumericValidationService');

const ENTITY_CONFIGS = Object.freeze({
  product_standards: Object.freeze({
    table: 'product_standards',
    keyFields: Object.freeze(['process_id', 'product_code']),
    fields: Object.freeze(['process_id', 'product_code', 'standard_output', 'exclude_kqd_from_tt']),
    required: Object.freeze(['process_id', 'product_code', 'standard_output']),
    numericRules: Object.freeze({ process_id: 'process_id', standard_output: 'standard_output', exclude_kqd_from_tt: 'exclude_kqd_from_tt' })
  }),
  defect_types: Object.freeze({
    table: 'defect_types',
    keyFields: Object.freeze(['process_id', 'defect_code']),
    fields: Object.freeze(['process_id', 'defect_code', 'defect_name', 'sort_order', 'excel_column']),
    required: Object.freeze(['process_id', 'defect_code', 'defect_name']),
    numericRules: Object.freeze({ process_id: 'process_id', sort_order: 'sort_order' })
  }),
  deduction_types: Object.freeze({
    table: 'deduction_types',
    keyFields: Object.freeze(['process_id', 'deduction_code']),
    fields: Object.freeze(['process_id', 'deduction_code', 'deduction_name', 'sort_order', 'excel_column']),
    required: Object.freeze(['process_id', 'deduction_code', 'deduction_name']),
    numericRules: Object.freeze({ process_id: 'process_id', sort_order: 'sort_order' })
  }),
  machines: Object.freeze({
    table: 'machines',
    keyFields: Object.freeze(['process_id', 'machine_code']),
    fields: Object.freeze(['process_id', 'machine_code', 'machine_name']),
    required: Object.freeze(['process_id', 'machine_code', 'machine_name']),
    numericRules: Object.freeze({ process_id: 'process_id' })
  })
});

function normalizeText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeRow(config, raw) {
  const row = {};
  const errors = [];
  for (const field of config.fields) {
    const rawValue = raw?.[field];
    const numericRule = config.numericRules?.[field];
    if (numericRule) {
      const parsed = safeValidateMasterNumeric(numericRule, rawValue);
      if (!parsed.ok) {
        row[field] = null;
        errors.push({ code: parsed.error.code, field, message: parsed.error.message });
      } else {
        row[field] = parsed.state === 'missing' ? null : parsed.value;
      }
    } else {
      let value = normalizeText(rawValue);
      if (field.endsWith('_code') || field === 'excel_column') value = normalizeCode(value);
      row[field] = value;
    }
  }
  return { row, errors };
}

function businessKey(config, row) {
  return config.keyFields.map((field) => String(row[field] ?? '')).join('|');
}

function stableObject(config, row) {
  const result = {};
  for (const field of config.fields) result[field] = row[field] ?? null;
  return result;
}

function hashRow(config, row) {
  return crypto.createHash('sha256').update(JSON.stringify(stableObject(config, row))).digest('hex');
}

function validateRows(config, rows) {
  const valid = [];
  const invalid = [];
  const seen = new Map();

  (rows || []).forEach((raw, index) => {
    const normalized = normalizeRow(config, raw);
    const row = normalized.row;
    const rowNumber = Number(raw?.__rowNumber) || index + 2;
    if (normalized.errors.length) {
      const first = normalized.errors[0];
      invalid.push({ rowNumber, row, code:first.code, field:first.field, errors:normalized.errors, message:first.message });
      return;
    }
    const missingText = config.required.filter((field) => !config.numericRules?.[field] && (row[field] === '' || row[field] === null || row[field] === undefined));
    if (missingText.length) {
      invalid.push({ rowNumber, row, code:'MASTER_FIELD_REQUIRED', field:missingText[0], message: `Thiếu trường bắt buộc: ${missingText.join(', ')}` });
      return;
    }
    const key = businessKey(config, row);
    if (seen.has(key)) {
      invalid.push({ rowNumber, row, code:'MASTER_DUPLICATE_ROW', message: `Trùng khóa với dòng ${seen.get(key)}` });
      return;
    }
    seen.set(key, rowNumber);
    valid.push({ rowNumber, row, key, hash: hashRow(config, row) });
  });
  return { valid, invalid };
}

function collectWorkbookProcessIds(rows) {
  const ids = new Set();
  for (const raw of rows || []) {
    const parsed = safeValidateMasterNumeric('process_id', raw?.process_id);
    if (parsed.ok && parsed.state === 'valid') ids.add(Number(parsed.value));
  }
  return [...ids];
}

module.exports = {
  ENTITY_CONFIGS,
  normalizeRow,
  businessKey,
  stableObject,
  hashRow,
  validateRows,
  collectWorkbookProcessIds
};
