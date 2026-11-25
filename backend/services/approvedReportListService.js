'use strict';
const db = require('../config/db');
const { getActorProcessScope, scopeSql } = require('./processAuthorizationService');
const { normalizeApprovedReportFilters } = require('./approvedReportListFilters');
const { readApprovedReportPage } = require('../repositories/approvedReportListRepository');
const { projectApprovedReportKpi } = require('../domain/approvedReportKpi.cjs');
const { paginationMeta } = require('./managerReportPaginationService');

async function listApprovedReports({ actor, query }) {
  const filters = normalizeApprovedReportFilters(query);
  const scope = await getActorProcessScope(actor);
  const scoped = scopeSql(scope, 'pr.process_id');
  const { rows, linesByReport, processes, total } = await readApprovedReportPage(db.promise(), filters, scoped);
  const data = rows.map(row => {
    const machine_lines = linesByReport.get(String(row.id)) || [];
    const kpi = projectApprovedReportKpi({ ...row, machine_lines });
    return { ...row, machine_lines, training_percent: kpi.trainingPercent, kpi };
  });
  return { success:true, data, ...(processes !== undefined ? { processes } : {}), pagination:paginationMeta({page:filters.page,pageSize:filters.pageSize,total}) };
}
module.exports = { listApprovedReports };
