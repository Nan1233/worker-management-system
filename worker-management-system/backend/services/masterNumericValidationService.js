'use strict';

const MASTER_NUMERIC_RULES = Object.freeze({
  process_id: Object.freeze({ required: true, integer: true, minExclusive: 0, code: 'PROCESS_ID' }),
  standard_output: Object.freeze({ required: true, integer: false, minExclusive: 0, code: 'STANDARD_OUTPUT' }),
  exclude_kqd_from_tt: Object.freeze({ required: false, integer: true, allowed: Object.freeze([0, 1]), defaultWhenMissing: 0, code: 'EXCLUDE_KQD_FROM_TT' }),
  sort_order: Object.freeze({ required: false, integer: true, minInclusive: 0, defaultWhenMissing: 0, code: 'SORT_ORDER' })
});

function unwrapCellValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, 'result')) {
    return value.result;
  }
  return value;
}

function isMissingNumeric(value) {
  const unwrapped = unwrapCellValue(value);
  return unwrapped === null || unwrapped === undefined || (typeof unwrapped === 'string' && unwrapped.trim() === '');
}

function parseNumeric(value) {
  const raw = unwrapCellValue(value);
  if (isMissingNumeric(raw)) return { state: 'missing', value: null, raw };

  // Keep locale parsing strict. Decimal comma strings are not silently guessed.
  if (typeof raw === 'string') {
    const text = raw.trim();
    // Number('0x10') and Number('1,2') have surprising/coercive semantics for master input.
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
      return { state: 'invalid', value: null, raw };
    }
  }

  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return { state: 'invalid', value: null, raw };
  return { state: 'valid', value: numeric, raw };
}

function makeNumericError(field, kind, message, parsed) {
  const error = new Error(message);
  error.statusCode = 422;
  error.status = 422;
  error.code = kind === 'required' ? 'MASTER_NUMERIC_REQUIRED'
    : kind === 'invalid' ? 'MASTER_NUMERIC_INVALID'
      : 'MASTER_NUMERIC_OUT_OF_RANGE';
  error.field = field;
  error.numericState = parsed?.state || null;
  return error;
}

function validateMasterNumeric(field, input, overrideRule = null) {
  const rule = overrideRule || MASTER_NUMERIC_RULES[field];
  if (!rule) throw new Error(`Missing master numeric rule for ${field}`);
  const parsed = parseNumeric(input);

  if (parsed.state === 'missing') {
    if (rule.required) {
      throw makeNumericError(field, 'required', `${field} là trường số bắt buộc`, parsed);
    }
    if (Object.prototype.hasOwnProperty.call(rule, 'defaultWhenMissing')) {
      return { state: 'valid', value: rule.defaultWhenMissing, sourceState: 'missing' };
    }
    return { state: 'missing', value: null, sourceState: 'missing' };
  }

  if (parsed.state === 'invalid') {
    throw makeNumericError(field, 'invalid', `${field} phải là số hữu hạn hợp lệ`, parsed);
  }

  const value = parsed.value;
  if (rule.integer && !Number.isInteger(value)) {
    throw makeNumericError(field, 'range', `${field} phải là số nguyên hợp lệ`, parsed);
  }
  if (Array.isArray(rule.allowed) && !rule.allowed.includes(value)) {
    throw makeNumericError(field, 'range', `${field} nằm ngoài miền giá trị cho phép`, parsed);
  }
  if (rule.minExclusive !== undefined && !(value > rule.minExclusive)) {
    throw makeNumericError(field, 'range', `${field} phải lớn hơn ${rule.minExclusive}`, parsed);
  }
  if (rule.minInclusive !== undefined && !(value >= rule.minInclusive)) {
    throw makeNumericError(field, 'range', `${field} phải lớn hơn hoặc bằng ${rule.minInclusive}`, parsed);
  }
  if (rule.maxInclusive !== undefined && !(value <= rule.maxInclusive)) {
    throw makeNumericError(field, 'range', `${field} phải nhỏ hơn hoặc bằng ${rule.maxInclusive}`, parsed);
  }
  return { state: 'valid', value, sourceState: 'valid' };
}

function safeValidateMasterNumeric(field, input, overrideRule = null) {
  try {
    return { ok: true, ...validateMasterNumeric(field, input, overrideRule) };
  } catch (error) {
    if (!/^MASTER_NUMERIC_/.test(String(error?.code || ''))) throw error;
    return { ok: false, error };
  }
}

module.exports = {
  MASTER_NUMERIC_RULES,
  unwrapCellValue,
  isMissingNumeric,
  parseNumeric,
  validateMasterNumeric,
  safeValidateMasterNumeric
};
