const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'models', 'productionTempApprovalModel.js');
let source = fs.readFileSync(file, 'utf8');

if (!source.includes('async function assertApprovalDetailsCopied(')) {
  const anchor = '\nasync function createLegacyApprovedSnapshot(item, approvedReportId, reviewerId, connection) {';
  const helper = `
async function assertApprovalDetailsCopied(tempReportId, approvedReportId, connection) {
  const [tempDeductions, approvedDeductions, tempDefects, approvedDefects, tempLines, approvedLines, tempMachineDefects, approvedMachineDefects] = await Promise.all([
    qRows(connection, 'SELECT COUNT(*) AS c, COALESCE(SUM(hours),0) AS total_hours FROM production_temp_deductions WHERE temp_report_id=?', [tempReportId]),
    qRows(connection, 'SELECT COUNT(*) AS c, COALESCE(SUM(hours),0) AS total_hours FROM production_report_deductions WHERE report_id=?', [approvedReportId]),
    qRows(connection, 'SELECT COUNT(*) AS c, COALESCE(SUM(quantity),0) AS total_qty FROM production_temp_defects WHERE temp_report_id=?', [tempReportId]),
    qRows(connection, 'SELECT COUNT(*) AS c, COALESCE(SUM(quantity),0) AS total_qty FROM production_report_defects WHERE report_id=?', [approvedReportId]),
    qRows(connection, 'SELECT COUNT(*) AS c FROM production_temp_machine_lines WHERE temp_report_id=?', [tempReportId]),
    qRows(connection, 'SELECT COUNT(*) AS c FROM production_report_machine_lines WHERE report_id=?', [approvedReportId]),
    qRows(connection, 'SELECT COUNT(*) AS c, COALESCE(SUM(quantity),0) AS total_qty FROM production_temp_machine_defects d JOIN production_temp_machine_lines l ON l.id=d.machine_line_id WHERE l.temp_report_id=?', [tempReportId]),
    qRows(connection, 'SELECT COUNT(*) AS c, COALESCE(SUM(quantity),0) AS total_qty FROM production_report_machine_defects d JOIN production_report_machine_lines l ON l.id=d.machine_line_id WHERE l.report_id=?', [approvedReportId]),
  ]);

  const pairs = [
    ['deductions', tempDeductions[0], approvedDeductions[0], 'total_hours'],
    ['defects', tempDefects[0], approvedDefects[0], 'total_qty'],
    ['machine_lines', tempLines[0], approvedLines[0], null],
    ['machine_defects', tempMachineDefects[0], approvedMachineDefects[0], 'total_qty'],
  ];

  for (const [type, expected, actual, totalField] of pairs) {
    const expectedCount = Number(expected?.c || 0);
    const actualCount = Number(actual?.c || 0);
    const expectedTotal = totalField ? Number(expected?.[totalField] || 0) : null;
    const actualTotal = totalField ? Number(actual?.[totalField] || 0) : null;
    const totalMismatch = totalField && Math.abs(expectedTotal - actualTotal) > 0.000001;
    if (expectedCount !== actualCount || totalMismatch) {
      const error = new Error(
        \\`Chi tiết báo cáo #\${tempReportId} không được copy đầy đủ sang báo cáo đã duyệt #\${approvedReportId}: \${type} TEMP=\${expectedCount}/\${expectedTotal ?? '-'}, APPROVED=\${actualCount}/\${actualTotal ?? '-'}\\`,
      );
      error.status = 500;
      error.code = 'APPROVED_REPORT_DETAIL_COPY_MISMATCH';
      error.isPublic = false;
      error.details = { temp_report_id: Number(tempReportId), approved_report_id: Number(approvedReportId), type, expected_count: expectedCount, actual_count: actualCount, expected_total: expectedTotal, actual_total: actualTotal };
      throw error;
    }
  }
}
`;
  if (!source.includes(anchor)) throw new Error('Không tìm thấy anchor createLegacyApprovedSnapshot');
  source = source.replace(anchor, `${helper}${anchor}`);
}

const target = '        await copyMachineLinesToApproved(item.id, approvedReportId, connection);\n        await createLegacyApprovedSnapshot(item, approvedReportId, reviewerId, connection);';
const replacement = '        await copyMachineLinesToApproved(item.id, approvedReportId, connection);\n        await assertApprovalDetailsCopied(item.id, approvedReportId, connection);\n        await createLegacyApprovedSnapshot(item, approvedReportId, reviewerId, connection);';

if (!source.includes(target)) {
  if (!source.includes('await assertApprovalDetailsCopied(item.id, approvedReportId, connection);')) {
    throw new Error('Không tìm thấy điểm chèn kiểm tra detail trong approveSelected');
  }
} else {
  source = source.replace(target, replacement);
}

fs.writeFileSync(file, source, 'utf8');
console.log('[KTC] Patched productionTempApprovalModel.js with approved-detail integrity validation.');
