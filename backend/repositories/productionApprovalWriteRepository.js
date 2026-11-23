'use strict';
const { query } = require('../models/productionTempModelShared');
const { qRows } = require('./productionApprovalReadRepository');
const { buildApprovedDetailCopyQuery, buildApprovedDetailReadQuery, buildApprovedTempTransitionQuery } = require('../models/productionTempApprovalQueries');
const { buildApprovedMachineLinesRead } = require('../models/productionApprovalMachineQueries');
const { serializeExtraData: serializeExtraDataValue } = require('../utils/reportExtraDataSerialization');
const {
  buildLegacySnapshotDefects, buildLegacySnapshotDeductions, buildLegacyApprovedSnapshotPayload,
  buildLegacySnapshotDefectsRead, buildLegacySnapshotDeductionsRead, buildLegacySnapshotInsert,
} = require('../models/productionTempApprovedSnapshotBuilders');

function serializeExtraData(value) {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? serializeExtraDataValue(value) : serialized;
}

// Keep sequential reads/writes on the same TiDB transaction connection.
async function readLegacySnapshotRows(connection, { sql, params }) {
  return qRows(connection, sql, params);
}

async function createLegacyApprovedSnapshot(item, approvedReportId, reviewerId, connection, preloaded = {}) {
  const preloadedMachineLines = preloaded.machineLines || null;
  // TiDB Serverless transaction connections must not run concurrent queries.
  // Keep these snapshot reads sequential on the same transaction connection.
  const snapshotDefects = preloaded.defects
    ? buildLegacySnapshotDefects(preloaded.defects)
    : await readLegacySnapshotRows(connection, buildLegacySnapshotDefectsRead(approvedReportId));
  const snapshotDeductions = preloaded.deductions
    ? buildLegacySnapshotDeductions(preloaded.deductions)
    : await readLegacySnapshotRows(connection, buildLegacySnapshotDeductionsRead(approvedReportId));
  const machineLines = Array.isArray(preloadedMachineLines)
    ? preloadedMachineLines
    : await readLegacySnapshotRows(connection, buildApprovedMachineLinesRead(approvedReportId));
  const snapshotData = JSON.stringify(buildLegacyApprovedSnapshotPayload(item, approvedReportId, snapshotDefects, snapshotDeductions, machineLines));
  const { sql: snapshotSql, params: snapshotParams } = buildLegacySnapshotInsert(item, approvedReportId, reviewerId, snapshotData);
  await query(connection, snapshotSql, snapshotParams);
}

// Preserve the positional values of the approved-report INSERT (approved_at remains NOW()).
function buildApprovedReportInsertValues(item, reviewerId) {
  return [
            item.id,item.worker_id,item.process_id,item.work_date,item.entry_date || item.work_date,item.shift,
            item.operation_type ?? null,item.operation_mode ?? null,item.machine_no,item.product_name,
            item.total_time,item.actual_time,item.deduction_time,item.standard_output,item.standard_version_id || null,
            item.machine_standard_id || null,item.training_percent_snapshot ?? null,item.exclude_kqd_from_tt_snapshot ?? null,
            item.actual_output,item.tt_ok,item.tt_ng,item.kqd_dap_lai,item.kqd_tuot,item.vo_do_long,item.xuoc_do_long,
            item.cong_gay,item.xoay,item.khong_dut,item.bavia_hut,item.ppcm,item.loi_cao_su,item.ng_kich_thuoc,
            item.cat_lem,item.note,serializeExtraData(item.extra_data),"approved",item.review_note,reviewerId,
  ];
}

function buildApprovedParentInsertQuery(item, reviewerId) {
  return {
    sql: `INSERT INTO production_reports
           (source_temp_id,worker_id,process_id,work_date,entry_date,shift,operation_type,operation_mode,machine_no,
            product_name,total_time,actual_time,deduction_time,standard_output,standard_version_id,machine_standard_id,
            training_percent_snapshot,exclude_kqd_from_tt_snapshot,actual_output,tt_ok,tt_ng,kqd_dap_lai,kqd_tuot,
            vo_do_long,xuoc_do_long,cong_gay,xoay,khong_dut,bavia_hut,ppcm,loi_cao_su,ng_kich_thuoc,cat_lem,note,
            extra_data,status,review_note,reviewed_by,approved_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
    params: buildApprovedReportInsertValues(item, reviewerId),
  };
}



async function copyApprovedReportDetails(connection, approvedReportId, tempReportId) {
  const { sql: defectsCopySql, params: defectsCopyParams } = buildApprovedDetailCopyQuery("defects", approvedReportId, tempReportId);
  await query(connection, defectsCopySql, defectsCopyParams);
  const { sql: deductionsCopySql, params: deductionsCopyParams } = buildApprovedDetailCopyQuery("deductions", approvedReportId, tempReportId);
  await query(connection, deductionsCopySql, deductionsCopyParams);
  // Sequential reads share the same TiDB transaction connection and serve both snapshot formats.
  const { sql: defectsReadSql, params: defectsReadParams } = buildApprovedDetailReadQuery("defects", approvedReportId);
  const approvedDefects = await qRows(connection, defectsReadSql, defectsReadParams);
  const { sql: deductionsReadSql, params: deductionsReadParams } = buildApprovedDetailReadQuery("deductions", approvedReportId);
  const approvedDeductions = await qRows(connection, deductionsReadSql, deductionsReadParams);
  return { approvedDefects, approvedDeductions };
}


async function insertApprovedParent(connection, report, reviewerId) {
  const { sql, params } = buildApprovedParentInsertQuery(report, reviewerId);
  return query(connection, sql, params);
}

async function transitionApprovedTemp(connection, report, reviewerId) {
  const { sql, params } = buildApprovedTempTransitionQuery(report, reviewerId);
  return query(connection, sql, params);
}

module.exports = {
  createLegacyApprovedSnapshot, buildApprovedReportInsertValues,
  buildApprovedParentInsertQuery, copyApprovedReportDetails,
  insertApprovedParent, transitionApprovedTemp,
};
