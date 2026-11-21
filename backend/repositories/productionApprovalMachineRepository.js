'use strict';
const { query } = require('../models/productionTempModelShared');
const { qRows } = require('./productionApprovalReadRepository');
const { attachMachineLineDefects } = require('../modules/production/domain/machineDefectLineage');
const { storedStandardSource } = require('../utils/standardSourceCode');
const { serializeExtraData: serializeExtraDataValue } = require('../services/productionApprovalService');
const { verifyApprovedMachineLineCopy } = require('../models/productionApprovedMachineLineVerification');
const {
  buildTempMachineLineDefectsQuery, buildApprovedMachineDefectsInsert, buildApprovedMachineLinesRead,
} = require('../models/productionApprovalMachineQueries');

function serializeExtraData(value) {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? serializeExtraDataValue(value) : serialized;
}

// Sequential reads/writes are mandatory on a TiDB transaction connection.
function buildTempMachineLinesRead(tempReportId) {
  return {
    sql: `SELECT *
       FROM production_temp_machine_lines
      WHERE temp_report_id=?
      ORDER BY sort_order ASC, id ASC`,
    params: [Number(tempReportId)],
  };
}

async function getTempMachineLines(tempReportId, connection) {
  const { sql: lineSql, params: lineParams } = buildTempMachineLinesRead(tempReportId);
  const lines = await qRows(connection, lineSql, lineParams);
  if (!lines.length) return [];

  const { sql: defectSql, params: defectParams } = buildTempMachineLineDefectsQuery(lines);
  const defects = await qRows(connection, defectSql, defectParams);
  return attachMachineLineDefects(lines, defects);
}

// Build approved defect rows in machine-line order, preserving the legacy
// null/default conversions and each line's defect order.
function buildApprovedMachineDefectRows(tempLines, approvedLinesByInsertOrder) {
  const rows = [];
  tempLines.forEach((line, index) => {
    const approvedLineId = Number(approvedLinesByInsertOrder[index].id);
    for (const defect of line.defects || []) {
      rows.push([
        approvedLineId,
        defect.defect_type_id || null,
        defect.defect_code || null,
        defect.defect_name || null,
        defect.quantity || 0,
      ]);
    }
  });
  return rows;
}

// Keep the approved machine-line INSERT column order and legacy defaults stable.
function buildApprovedMachineLineValues(tempLines, approvedReportId) {
  return tempLines.flatMap((line) => [
    approvedReportId,
    line.machine_event_id || null,
    line.machine_id || null,
    line.machine_code,
    line.product_standard_id || null,
    line.standard_version_id || null,
    line.machine_standard_id || null,
    line.product_code,
    line.machine_time_hours,
    line.standard_output,
    line.standard_time_seconds || null,
    storedStandardSource(line.standard_source),
    line.ok_quantity,
    line.ng_quantity,
    line.maximum_output,
    line.deduction_time_hours || 0,
    serializeExtraData(line.deductions_json),
    line.counted_output || 0,
    line.earned_standard_hours || 0,
    serializeExtraData(line.defects_json),
    line.sort_order || 1,
  ]);
}

// Verify the bulk INSERT's assumed id ordering before associating defects.
// This check intentionally fails closed if the database returns unexpected rows.
async function copyMachineLinesToApproved(tempReportId, approvedReportId, connection, preloadedTempLines = null) {
  const tempLines = preloadedTempLines || await getTempMachineLines(tempReportId, connection);
  if (!tempLines.length) return { ids: [], rows: [] };

  const { sql: machineInsertSql, params: machineInsertParams } = buildApprovedMachineLinesInsert(tempLines, approvedReportId);
  await query(connection, machineInsertSql, machineInsertParams);

  const { sql: approvedLinesSql, params: approvedLinesParams } = buildApprovedMachineLinesRead(approvedReportId);
  const approvedRows = await qRows(connection, approvedLinesSql, approvedLinesParams);
  // AUTO_INCREMENT hands out ascending ids in row order inside one statement, so the n-th inserted row is the
  // n-th lowest id. Verify that assumption against machine_code/product_code and fail closed (rollback) if not.
  const byInsertOrder = verifyApprovedMachineLineCopy(approvedRows, tempLines, tempReportId, approvedReportId);

  const pendingDefects = buildApprovedMachineDefectRows(tempLines, byInsertOrder);

  if (pendingDefects.length) {
    const { sql: defectInsertSql, params: defectInsertParams } = buildApprovedMachineDefectsInsert(pendingDefects);
    await query(connection, defectInsertSql, defectInsertParams);
  }

  return { ids: byInsertOrder.map((row) => Number(row.id)), rows: approvedRows };
}

// Keep standard resolver warm-up input aligned with each saved machine line.
function buildApprovedMachineLinesInsert(tempLines, approvedReportId) {
  const columns = `report_id,machine_event_id,machine_id,machine_code,product_standard_id,standard_version_id,machine_standard_id,product_code,
        machine_time_hours,standard_output,standard_time_seconds,standard_source,ok_quantity,ng_quantity,
        maximum_output,deduction_time_hours,deductions_json,counted_output,earned_standard_hours,defects_json,sort_order`;
  const rowPlaceholder = `(${new Array(21).fill("?").join(",")})`;
  return {
    sql: `INSERT INTO production_report_machine_lines (${columns}) VALUES ${tempLines.map(() => rowPlaceholder).join(",")}`,
    params: buildApprovedMachineLineValues(tempLines, approvedReportId),
  };
}


module.exports = {
  buildTempMachineLinesRead, getTempMachineLines, buildApprovedMachineDefectRows,
  buildApprovedMachineLineValues, buildApprovedMachineLinesInsert, copyMachineLinesToApproved,
};
