'use strict';

// An approved parent is excluded only after its complete child set is verified.
// This is export-only reconciliation, never a DB split or quantity allocation.
function splitMetadata(report) {
  const value = report?.extra_data ?? report?.extraData ?? report?.rawDetail?.extra_data;
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) { return {}; }
  }
  return {};
}

const text = value => String(value ?? '').trim();
const positiveId = value => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
const day = value => value instanceof Date && !Number.isNaN(value.getTime())
  ? value.toISOString().slice(0, 10) : text(value).slice(0, 10);
const quantity = value => {
  if (value == null || text(value) === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
};
const isParent = report => splitMetadata(report).split_status === 'SPLIT_PARENT';
const machineCodes = report => [...new Set(text(report.machine_no)
  .split(/[,;\r\n]+/).map(value => value.trim().toUpperCase()).filter(Boolean))];

function reconcileGcSplitReports(reports) {
  const byId = new Map();
  const childrenByParent = new Map();
  for (const report of reports) {
    const id = positiveId(report.id);
    if (!id || byId.has(id)) throw splitError(id, 'ID_INVALID_OR_DUPLICATE');
    byId.set(id, report);
    const parentId = positiveId(splitMetadata(report).split_from_report_id);
    if (parentId) {
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
      childrenByParent.get(parentId).push(id);
    }
  }
  const verifiedParents = new Set();
  for (const report of reports) {
    const id = positiveId(report.id);
    const meta = splitMetadata(report);
    const linkedIds = childrenByParent.get(id) || [];
    const hasDbCount = report.gc_split_child_count != null;
    const dbCount = hasDbCount ? quantity(report.gc_split_child_count) : linkedIds.length;
    if (!isParent(report) && !linkedIds.length && dbCount === 0) continue;
    if (!isParent(report) || positiveId(meta.split_from_report_id)) throw splitError(id, 'PARENT_LINEAGE_INVALID');
    const childIds = Array.isArray(meta.split_into_report_ids) ? meta.split_into_report_ids.map(positiveId) : [];
    if (!childIds.length || childIds.some(childId => !childId || childId === id)
      || new Set(childIds).size !== childIds.length
      || dbCount !== childIds.length
      || linkedIds.length !== childIds.length
      || linkedIds.some(childId => !childIds.includes(childId))) {
      throw splitError(id, 'CHILD_SET_INCOMPLETE_OR_AMBIGUOUS');
    }
    const children = childIds.map(childId => byId.get(childId));
    if (children.some(child => !child || isParent(child) || childrenByParent.has(positiveId(child.id))
      || (child.gc_split_child_count != null && quantity(child.gc_split_child_count) !== 0))) {
      throw splitError(id, 'CHILD_LINEAGE_INVALID');
    }
    const identity = item => [text(item.worker_id || item.worker_code), day(item.work_date),
      text(item.shift).toUpperCase(), text(item.process_code).toUpperCase(),
      text(item.operation_type).toUpperCase(), text(item.operation_mode).toUpperCase()];
    const expected = identity(report);
    if (expected.some(value => !value) || expected[3] !== 'GC'
      || [report, ...children].some(item => text(item.status).toLowerCase() !== 'approved'
        || identity(item).some((value, index) => value !== expected[index]))) {
      throw splitError(id, 'CHILD_IDENTITY_MISMATCH');
    }
    const parentMachines = machineCodes(report);
    const childMachines = children.map(machineCodes);
    if (childMachines.some(codes => codes.length !== 1)
      || (parentMachines.length > 1 && (new Set(childMachines.flat()).size !== parentMachines.length
        || childMachines.flat().some(code => !parentMachines.includes(code))))) {
      throw splitError(id, 'CHILD_MACHINE_MISMATCH');
    }
    for (const key of ['tt_ok', 'tt_ng']) {
      const parentValue = quantity(report[key]);
      const childValues = children.map(child => quantity(child[key]));
      if (parentValue === null || childValues.some(value => value === null)
        || childValues.reduce((sum, value) => sum + value, 0) !== parentValue) {
        throw splitError(id, 'CHILD_QUANTITY_MISMATCH');
      }
    }
    verifiedParents.add(id);
  }
  return reports.filter(report => !verifiedParents.has(positiveId(report.id)));
}

function splitError(reportId, reason) {
  return Object.assign(new Error('GC cần đối soát báo cáo ' + (reportId ?? '?') + ': ' + reason), {
    code: 'GC_EXPORT_SPLIT_REQUIRED', statusCode: 409, details: [{ reportId, reason }]
  });
}

module.exports = { splitMetadata, reconcileGcSplitReports };
