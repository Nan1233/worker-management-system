'use strict';
const { validateMasterNumeric } = require('./masterNumericValidation');

const TABLES = {
  processes: { table:'processes', fields:['process_code','process_name','description','status'], required:['process_code','process_name'], order:'process_name' },
  defects: { table:'defect_types', fields:['process_id','defect_code','defect_name','sort_order','status'], required:['process_id','defect_code','defect_name'], order:'process_id, sort_order, defect_name' },
  deductions: { table:'deduction_types', fields:['process_id','deduction_code','deduction_name','sort_order','status'], required:['process_id','deduction_code','deduction_name'], order:'process_id, sort_order, deduction_name' },
  machines: { table:'machines', fields:['process_id','machine_code','machine_name','status'], required:['process_id','machine_code','machine_name'], order:'process_id, machine_code' },
  standards: { table:'product_standards', fields:['process_id','work_type','product_code','standard_output','status'], required:['process_id','product_code','standard_output'], order:'process_id, product_code' }
};

// Serverless TiDB cannot expand object bindings in SQL SET ? statements.
function masterWriteFields(cfg, payload) {
  const fields = cfg.fields.filter(field => Object.prototype.hasOwnProperty.call(payload, field));
  return {fields, values: fields.map(field => payload[field])};
}
const PROCESS_BOUND_RESOURCES = new Set(['defects','deductions','machines','standards']);
const LEAD_MANAGER_MASTER_RESOURCES = new Set(['machines','standards','deductions']);

function cleanPayload(body, cfg, partial=false) {
  const payload = {};
  for (const field of cfg.fields) {
    if (Object.prototype.hasOwnProperty.call(body || {}, field)) payload[field] = body[field];
  }
  if (!partial) {
    for (const field of cfg.required) {
      if (payload[field] === undefined || payload[field] === null || String(payload[field]).trim() === '') {
        const error = new Error(`Thiếu trường bắt buộc: ${field}`); error.status = 400; throw error;
      }
    }
  }
  if ('status' in payload && !['active','inactive'].includes(payload.status)) {
    const error = new Error('Trạng thái không hợp lệ'); error.status = 400; throw error;
  }
  if ('process_id' in payload) payload.process_id = validateMasterNumeric('process_id', payload.process_id).value;
  if ('sort_order' in payload) payload.sort_order = validateMasterNumeric('sort_order', payload.sort_order).value;
  if ('standard_output' in payload) {
    try {
      payload.standard_output = validateMasterNumeric('standard_output', payload.standard_output).value;
    } catch (error) {
      if (/^MASTER_NUMERIC_/.test(String(error?.code || ''))) error.message = 'Định mức phải là số dương hợp lệ';
      throw error;
    }
  }
  return payload;
}

module.exports = { TABLES, masterWriteFields, PROCESS_BOUND_RESOURCES, LEAD_MANAGER_MASTER_RESOURCES, cleanPayload };
