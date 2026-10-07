const db = require('../config/db');
const { getActorProcessScope } = require('./processAuthorizationService');
const { assertReportVolume, chunkArray } = require('./excelExportGuards');
const { hasColumn } = require('./schemaCompatibilityService');
const { assertTrainingSnapshotAvailable } = require('./trainingSnapshotService');

const PROCESS_CODES = ['CAN','EP','XLBV','GC','MAI','DO','K1','K2','SX3'];
const query = (sql, params = []) => db.promise().query(sql, params).then(([rows]) => rows);

function monthRange(yearMonth) {
  const [year, month] = String(yearMonth).split('-').map(Number);
  const start = `${yearMonth}-01`;
  const nextDate = new Date(year, month, 1);
  const next = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-01`;
  return { start, next };
}

function mapDetails(rows, reportIds, mapper) {
  const result = new Map(reportIds.map((id) => [Number(id), []]));
  for (const row of rows) {
    const id = Number(row.report_id);
    if (!result.has(id)) result.set(id, []);
    result.get(id).push(mapper(row));
  }
  return result;
}

function sumPositive(rows, field) {
  return (Array.isArray(rows) ? rows : []).reduce((sum, row) => {
    const value = Number(row?.[field]);
    return sum + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);
}

function sameNumber(a, b, tolerance = 0.01) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= tolerance;
}

function groupMachineDefects(rows, keyField) {
  const result = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = Number(row?.[keyField]);
    if (!Number.isInteger(key) || key <= 0) continue;
    if (!result.has(key)) result.set(key, []);
    result.get(key).push({
      id: Number(row.id) || undefined,
      defect_type_id: Number(row.defect_type_id) || undefined,
      defect_code: row.defect_code || '',
      defect_name: row.defect_name || '',
      quantity: Number(row.quantity) || 0
    });
  }
  return result;
}

function hydrateMachineLineDefects(machineLines, machineDefectsByLine, eventDefectsByEvent) {
  return (Array.isArray(machineLines) ? machineLines : []).map((line) => {
    const persisted = machineDefectsByLine.get(Number(line.id)) || [];
    if (persisted.length) return { ...line, defects: persisted, defects_json: JSON.stringify(persisted) };
    if (line?.defects_json) return line;
    const eventDetails = eventDefectsByEvent.get(Number(line.machine_event_id)) || [];
    if (eventDetails.length) return { ...line, defects: eventDetails, defects_json: JSON.stringify(eventDetails) };
    return { ...line, defects: [] };
  });
}

async function loadBulkCompanyReports(yearMonth, actor) {
  const { start, next } = monthRange(yearMonth);
  const placeholders = PROCESS_CODES.map(() => '?').join(',');
  const allProcesses = await query(
    `SELECT id, process_code, process_name
       FROM processes
      WHERE UPPER(process_code) IN (${placeholders})
      ORDER BY id`,
    PROCESS_CODES
  );

  const scope = actor ? await getActorProcessScope(actor) : { type: 'ALL', processIds: null };
  const processes = scope.type === 'ALL'
    ? allProcesses
    : allProcesses.filter((row) => scope.processIds.has(Number(row.id)));
  const processIds = processes.map((row) => Number(row.id));

  if (processIds.length) await assertReportVolume({ yearMonth, processIds });

  const processData = Object.fromEntries(PROCESS_CODES.map((code) => [code, {
    processId: null,
    processCode: code,
    processName: code,
    reports: [],
    physicalMachineEvents: [],
    deductionTypes: [],
    defectTypes: [],
    formulaSettingsByDate: {}
  }]));
  if (!processIds.length) return { processData, processIds, scope };

  const processPlaceholders = processIds.map(() => '?').join(',');
  const [supportsEntryDate, supportsExtraData] = await Promise.all([
    hasColumn('production_reports', 'entry_date'),
    hasColumn('production_reports', 'extra_data')
  ]);
  const entryDateSelect = supportsEntryDate
    ? 'COALESCE(pr.entry_date, DATE(pr.created_at), pr.work_date) AS entry_date'
    : 'COALESCE(DATE(pr.created_at), pr.work_date) AS entry_date';
  const extraDataSelect = supportsExtraData
    ? 'pr.extra_data AS extra_data'
    : 'NULL AS extra_data';

  const reports = await query(
    `SELECT
        pr.id, pr.source_temp_id, pr.worker_id, pr.process_id,
        pr.work_date, ${entryDateSelect},
        temp.created_at AS submitted_at,
        pr.shift, pr.operation_type,
        pr.operation_mode, pr.machine_no, pr.product_name,
        pr.total_time, pr.actual_time, pr.deduction_time,
        pr.standard_output, pr.actual_output, pr.tt_ok, pr.tt_ng,
        pr.kqd_dap_lai, pr.kqd_tuot, pr.vo_do_long, pr.xuoc_do_long,
        pr.cong_gay, pr.xoay, pr.khong_dut, pr.bavia_hut, pr.ppcm,
        pr.loi_cao_su, pr.ng_kich_thuoc, pr.cat_lem,
        pr.note, ${extraDataSelect}, pr.status, pr.review_note,
        pr.reviewed_by, pr.approved_at, pr.created_at, pr.updated_at,
        w.worker_code, w.training_percent AS worker_training_percent,
        pr.training_percent_snapshot,
        COALESCE(pr.training_percent_snapshot, w.training_percent, 100) AS training_percent,
        w.position, w.department,
        u.full_name, p.process_name, p.process_code,
        pr.exclude_kqd_from_tt_snapshot,
        COALESCE(pr.exclude_kqd_from_tt_snapshot, 0) AS exclude_kqd_from_tt
       FROM production_reports pr
       INNER JOIN workers w ON w.id = pr.worker_id
       INNER JOIN users u ON u.id = w.user_id
       INNER JOIN processes p ON p.id = pr.process_id
       LEFT JOIN production_reports_temp temp ON temp.id = pr.source_temp_id
      WHERE LOWER(TRIM(COALESCE(pr.status, ''))) = 'approved'
        AND pr.work_date >= ? AND pr.work_date < ?
        AND pr.process_id IN (${processPlaceholders})
      ORDER BY pr.work_date, w.worker_code, pr.machine_no, pr.created_at, pr.id`,
    [start, next, ...processIds]
  );

  for (const report of reports) {
    const hasTrainingSnapshot = report.training_percent_snapshot !== null
      && report.training_percent_snapshot !== undefined
      && String(report.training_percent_snapshot).trim() !== '';
    if (!hasTrainingSnapshot) {
      report.training_percent = Number.isFinite(Number(report.worker_training_percent))
        ? Number(report.worker_training_percent)
        : 100;
      report.trainingSnapshotSource = report.worker_training_percent !== null
        && report.worker_training_percent !== undefined
        ? 'LEGACY_WORKER_MASTER'
        : 'LEGACY_DEFAULT_100';
      delete report.training_percent_snapshot;
    } else {
      assertTrainingSnapshotAvailable(report);
      report.trainingSnapshotSource = 'IMMUTABLE_SNAPSHOT';
    }

    const isMachineReport = String(report.operation_mode || '').toUpperCase() === 'MACHINE';
    if (!isMachineReport && (report.exclude_kqd_from_tt === null || report.exclude_kqd_from_tt === undefined)) {
      report.exclude_kqd_from_tt = 0;
      report.excludeKqdSnapshotSource = 'LEGACY_DEFAULT_0';
    }
  }

  const reportIds = reports.map((report) => Number(report.id));
  const [physicalMachineEvents, deductionTypes, defectTypes] = await Promise.all([
    query(
      `SELECT e.id,e.process_id,e.machine_id,e.machine_code,e.product_code,e.work_date,e.shift,
              e.physical_ok_quantity,e.physical_ng_quantity,e.physical_counted_output,e.physical_total_output,
              e.machine_time_hours,e.maximum_output,e.standard_output,e.standard_version_id,e.machine_standard_id,
              e.exclude_kqd_from_tt_snapshot,e.status
         FROM machine_production_events e
        WHERE e.status='approved' AND e.process_id IN (${processPlaceholders})
          AND e.work_date>=? AND e.work_date<?
        ORDER BY e.work_date,e.shift,e.machine_code,e.id`,
      [...processIds, start, next]
    ),
    query(`SELECT id, process_id, deduction_code AS code, deduction_name AS name, deduction_code, deduction_name, sort_order FROM deduction_types WHERE process_id IN (${processPlaceholders}) AND status='active' ORDER BY process_id,sort_order,id`, processIds),
    query(`SELECT id, process_id, defect_code AS code, defect_name AS name, defect_code, defect_name, sort_order FROM defect_types WHERE process_id IN (${processPlaceholders}) AND status='active' ORDER BY process_id,sort_order,id`, processIds)
  ]);

  let deductionRows = [];
  let defectRows = [];
  let machineLineRows = [];
  let machineDefectRows = [];
  let eventDefectRows = [];
  for (const ids of chunkArray(reportIds, Number(process.env.EXCEL_DETAIL_BATCH_SIZE || 1000))) {
    const p = ids.map(() => '?').join(',');
    const [d, f, m, md, ed] = await Promise.all([
      query(`SELECT prd.report_id, prd.deduction_type_id, dt.deduction_code, dt.deduction_name, prd.hours FROM production_report_deductions prd LEFT JOIN deduction_types dt ON dt.id=prd.deduction_type_id WHERE prd.report_id IN (${p}) ORDER BY prd.report_id,COALESCE(dt.sort_order,999999),prd.deduction_type_id`, ids),
      query(`SELECT prd.report_id, prd.defect_type_id, dt.defect_code, dt.defect_name, prd.quantity FROM production_report_defects prd LEFT JOIN defect_types dt ON dt.id=prd.defect_type_id WHERE prd.report_id IN (${p}) ORDER BY prd.report_id,COALESCE(dt.sort_order,999999),prd.defect_type_id`, ids),
      query(`SELECT * FROM production_report_machine_lines WHERE report_id IN (${p}) ORDER BY report_id,sort_order,id`, ids),
      query(`SELECT ml.report_id, md.id, md.machine_line_id, md.defect_type_id, md.defect_code, md.defect_name, md.quantity
               FROM production_report_machine_defects md
               INNER JOIN production_report_machine_lines ml ON ml.id=md.machine_line_id
              WHERE ml.report_id IN (${p}) AND md.quantity > 0
              ORDER BY ml.report_id,md.machine_line_id,md.id`, ids),
      query(`SELECT ml.report_id, ed.id, ed.machine_event_id, ed.defect_type_id, ed.defect_code, ed.defect_name, ed.quantity
               FROM machine_production_event_defects ed
               INNER JOIN production_report_machine_lines ml ON ml.machine_event_id=ed.machine_event_id
              WHERE ml.report_id IN (${p}) AND ed.quantity > 0
              ORDER BY ml.report_id,ed.machine_event_id,ed.id`, ids)
    ]);
    deductionRows.push(...d); defectRows.push(...f); machineLineRows.push(...m); machineDefectRows.push(...md); eventDefectRows.push(...ed);
  }

  let tempDeductionRows = [];
  let tempDefectRows = [];
  const sourceTempIds = [...new Set(
    reports.map((report) => Number(report.source_temp_id)).filter((id) => Number.isInteger(id) && id > 0)
  )];
  if (sourceTempIds.length) {
    const p = sourceTempIds.map(() => '?').join(',');
    [tempDeductionRows, tempDefectRows] = await Promise.all([
      query(
        `SELECT ptd.temp_report_id, ptd.deduction_type_id, dt.deduction_code, dt.deduction_name, ptd.hours
           FROM production_temp_deductions ptd
           LEFT JOIN deduction_types dt ON dt.id=ptd.deduction_type_id
          WHERE ptd.temp_report_id IN (${p})
          ORDER BY ptd.temp_report_id,COALESCE(dt.sort_order,999999),ptd.deduction_type_id`,
        sourceTempIds
      ),
      query(
        `SELECT ptd.temp_report_id, ptd.defect_type_id, dt.defect_code, dt.defect_name, ptd.quantity
           FROM production_temp_defects ptd
           LEFT JOIN defect_types dt ON dt.id=ptd.defect_type_id
          WHERE ptd.temp_report_id IN (${p})
          ORDER BY ptd.temp_report_id,COALESCE(dt.sort_order,999999),ptd.defect_type_id`,
        sourceTempIds
      )
    ]);
  }

  const deductionByReport = mapDetails(deductionRows, reportIds, (row) => ({
    deduction_type_id: Number(row.deduction_type_id),
    deduction_type_code: row.deduction_code,
    deduction_name: row.deduction_name,
    hours: Number(row.hours) || 0
  }));
  const defectByReport = mapDetails(defectRows, reportIds, (row) => ({
    defect_type_id: Number(row.defect_type_id),
    defect_type_code: row.defect_code,
    defect_name: row.defect_name,
    quantity: Number(row.quantity) || 0
  }));
  const tempDeductionByReport = new Map();
  for (const row of tempDeductionRows) {
    const report = reports.find((item) => Number(item.source_temp_id) === Number(row.temp_report_id));
    if (!report) continue;
    const id = Number(report.id);
    if (!tempDeductionByReport.has(id)) tempDeductionByReport.set(id, []);
    tempDeductionByReport.get(id).push({
      deduction_type_id: Number(row.deduction_type_id),
      deduction_type_code: row.deduction_code,
      deduction_name: row.deduction_name,
      hours: Number(row.hours) || 0
    });
  }
  const tempDefectByReport = new Map();
  for (const row of tempDefectRows) {
    const report = reports.find((item) => Number(item.source_temp_id) === Number(row.temp_report_id));
    if (!report) continue;
    const id = Number(report.id);
    if (!tempDefectByReport.has(id)) tempDefectByReport.set(id, []);
    tempDefectByReport.get(id).push({
      defect_type_id: Number(row.defect_type_id),
      defect_type_code: row.defect_code,
      defect_name: row.defect_name,
      quantity: Number(row.quantity) || 0
    });
  }

  const machineDefectsByLine = groupMachineDefects(machineDefectRows, 'machine_line_id');
  const eventDefectsByEvent = groupMachineDefects(eventDefectRows, 'machine_event_id');
  const machineLinesByReport = new Map();
  for (const line of machineLineRows) {
    const reportId = Number(line.report_id);
    if (!machineLinesByReport.has(reportId)) machineLinesByReport.set(reportId, []);
    machineLinesByReport.get(reportId).push(line);
  }

  const eventByReport = new Map();
  for (const line of machineLineRows) {
    const reportId = Number(line.report_id);
    const eventId = Number(line.machine_event_id);
    if (!eventId) continue;
    if (!eventByReport.has(reportId)) eventByReport.set(reportId, []);
    eventByReport.get(reportId).push(eventId);
  }
  const eventIds = [...new Set([...eventByReport.values()].flat())].filter(Boolean);
  let eventRows = [];
  if (eventIds.length) {
    const p = eventIds.map(() => '?').join(',');
    eventRows = await query(
      `SELECT id,process_id,machine_id,machine_code,product_code,work_date,shift,status,machine_time_hours,maximum_output,standard_output
         FROM machine_production_events
        WHERE id IN (${p})`,
      eventIds
    );
  }
  const eventMap = new Map(eventRows.map((row) => [Number(row.id), row]));

  for (const [code, data] of Object.entries(processData)) {
    const process = processes.find((row) => String(row.process_code).toUpperCase() === code);
    data.processId = process ? Number(process.id) : null;
    data.processName = process?.process_name || code;
    data.reports = reports
      .filter((row) => String(row.process_code).toUpperCase() === code)
      .map((report) => {
        const reportId = Number(report.id);
        const machineLines = hydrateMachineLineDefects(machineLinesByReport.get(reportId) || [], machineDefectsByLine, eventDefectsByEvent);
        const tempDeductions = tempDeductionByReport.get(reportId) || [];
        const tempDefects = tempDefectByReport.get(reportId) || [];
        const persistedDeductions = deductionByReport.get(reportId) || [];
        const persistedDefects = defectByReport.get(reportId) || [];
        const eventLines = (eventByReport.get(reportId) || []).map((id) => eventMap.get(id)).filter(Boolean);
        let deductions = tempDeductions.length ? tempDeductions : persistedDeductions;
        let machineAccounting = null;
        if (code === 'GC' && String(report.operation_mode || '').toUpperCase() === 'MACHINE') {
          const seenEvents = new Set();
          let grossHours = 0;
          let deductionHours = 0;
          const machineDeductions = [];
          const seenDeductionKeys = new Set();
          machineLines.forEach((line, lineIndex) => {
            const eventId = Number(line.machine_event_id) || 0;
            const event = eventId ? eventMap.get(eventId) : null;
            if (event) {
              if (!seenEvents.has(eventId)) {
                seenEvents.add(eventId);
                grossHours += Math.max(0, Number(event.machine_time_hours) || 0);
              }
            } else {
              grossHours += Math.max(0, Number(line.machine_time_hours) || 0);
            }
            const lineDeductionHours = Math.max(0, Number(line.deduction_time_hours) || 0);
            const lineDeductions = (() => {
              try {
                const parsed = typeof line.deductions_json === 'string' ? JSON.parse(line.deductions_json) : line.deductions_json;
                return Array.isArray(parsed) ? parsed : [];
              } catch (_error) {
                return [];
              }
            })();
            const deductionKey = eventId ? 'EVENT:' + eventId : 'LINE:' + (Number(line.id) || lineIndex);
            if (!seenDeductionKeys.has(deductionKey)) {
              seenDeductionKeys.add(deductionKey);
              deductionHours += lineDeductionHours;
              for (const item of lineDeductions) {
                const hours = Math.max(0, Number(item?.hours) || 0);
                if (!hours) continue;
                const key = Number(item?.deduction_type_id) || String(item?.deduction_code || item?.deduction_name || '');
                const existing = machineDeductions.find((entry) => String(entry.deduction_type_id || entry.deduction_type_code || entry.deduction_name) === String(key));
                if (existing) existing.hours += hours;
                else machineDeductions.push({
                  deduction_type_id: Number(item?.deduction_type_id) || undefined,
                  deduction_type_code: String(item?.deduction_code || '').trim(),
                  deduction_name: String(item?.deduction_name || '').trim(),
                  hours
                });
              }
            }
          });
          machineAccounting = {
            source: eventLines.length ? 'MACHINE_EVENT' : 'MACHINE_LINE',
            grossHours,
            deductionHours,
            netHours: Math.max(0, grossHours - deductionHours)
          };
          deductions = machineDeductions;
        }
        return {
          ...report,
          deductions,
          defects: tempDefects.length ? tempDefects : persistedDefects,
          machineLines,
          eventLines,
          machineAccounting
        };
      });
    data.physicalMachineEvents = physicalMachineEvents.filter((row) => String(row.process_id) === String(data.processId));
    data.deductionTypes = deductionTypes.filter((row) => String(row.process_id) === String(data.processId));
    data.defectTypes = defectTypes.filter((row) => String(row.process_id) === String(data.processId));
  }

  return { processData, processIds, scope };
}

module.exports = { loadBulkCompanyReports, PROCESS_CODES };