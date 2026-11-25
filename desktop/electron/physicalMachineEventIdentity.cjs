'use strict';

// Duplicate joins must not count a physical machine event twice. Reject
// conflicting snapshots rather than silently picking a value.
function distinctPhysicalMachineEvents(rows = []) {
  const events = new Map();
  const fields = ['work_date','shift','machine_id','machine_code','product_code',
    'physical_ok_quantity','physical_ng_quantity','physical_counted_output',
    'physical_total_output','machine_time_hours','maximum_output','standard_output','status'];
  const numeric = new Set(['machine_id','physical_ok_quantity','physical_ng_quantity',
    'physical_counted_output','physical_total_output','machine_time_hours','maximum_output','standard_output']);
  const present = value => value != null && String(value).trim() !== '';
  const compare = (key, value) => numeric.has(key) ? Number(value)
    : key === 'work_date' ? (value instanceof Date ? value.toISOString() : String(value)).slice(0,10)
    : String(value).trim().toUpperCase();
  for (const row of rows) {
    const id = Number(row?.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw Object.assign(new Error('ID sự kiện máy không hợp lệ: '+id),{code:'EXCEL_MACHINE_EVENT_INVALID'});
    const current = events.get(id);
    if (!current) { events.set(id, {...row,id}); continue; }
    for (const key of fields) {
      if (!present(row[key])) continue;
      if (present(current[key]) && compare(key,current[key]) !== compare(key,row[key])) {
        throw Object.assign(new Error('Snapshot sự kiện máy xung đột: '+id+' ('+key+')'),{code:'EXCEL_MACHINE_EVENT_INVALID'});
      }
      if (!present(current[key])) current[key] = row[key];
    }
  }
  return [...events.values()];
}
module.exports = { distinctPhysicalMachineEvents };
