const GC_AUTOMATIC_MACHINE_NUMBERS = Object.freeze([1, 2, 10, 11, 4, 3, 9, 8, 25, 26, 14, 17, 23, 24, 16]);
const GC_SHARED_MACHINE_NUMBERS = Object.freeze([5, 6, 7, 11]);
const SHARED_FACTORY_PROCESS_CODES = Object.freeze(['GC', 'MAI']);
const MAX_MACHINES_PER_WORKER = 4;
const MAX_WORKERS_PER_SHARED_MACHINE = 2;

const canonicalMachineNumber = (value) => {
  const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return null;
  const patterns = [
    /^(?:MÁY|MAY|MACHINE|M)[-_]?(\d{1,2})$/i,
    /^(\d{1,2})$/
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) return Number(match[1]);
  }
  return null;
};

const getGcMachineRule = (machineCode, dbRow = null) => {
  const machineNumber = canonicalMachineNumber(machineCode);
  const automatic = dbRow?.is_automatic != null
    ? Number(dbRow.is_automatic) === 1
    : GC_AUTOMATIC_MACHINE_NUMBERS.includes(machineNumber);
  const maxWorkers = dbRow?.max_workers_per_machine != null
    ? Number(dbRow.max_workers_per_machine)
    : (GC_SHARED_MACHINE_NUMBERS.includes(machineNumber) ? 4 : 1);
  const outputBasis = String(dbRow?.output_basis || ((automatic || GC_SHARED_MACHINE_NUMBERS.includes(machineNumber)) ? 'MACHINE' : 'PRODUCT')).toUpperCase();
  return { machineNumber, automatic, maxWorkers: Math.max(1, maxWorkers || 1), outputBasis };
};

const getSharedProcessRule = (processCode, machineCode, dbRow = null) => {
  if (!SHARED_FACTORY_PROCESS_CODES.includes(String(processCode || '').trim().toUpperCase())) return null;
  return {
    processCode: String(processCode).trim().toUpperCase(),
    machineNumber: canonicalMachineNumber(machineCode),
    maxMachinesPerWorker: MAX_MACHINES_PER_WORKER,
    maxWorkersPerMachine: MAX_WORKERS_PER_SHARED_MACHINE,
    automatic: Number(dbRow?.is_automatic || 0) === 1,
    outputBasis: String(dbRow?.output_basis || 'PRODUCT').toUpperCase()
  };
};

const getDb = () => require('../config/db');

const loadMachineRows = async (processId, machineCodes) => {
  if (!machineCodes.length) return [];
  const db = getDb();
  const placeholders = machineCodes.map(() => '?').join(',');
  const [rows] = await db.promise().query(
    `SELECT id, process_id, machine_code, COALESCE(is_automatic,0) is_automatic,
            COALESCE(max_workers_per_machine,1) max_workers_per_machine,
            COALESCE(output_basis,'PRODUCT') output_basis
       FROM machines
      WHERE process_id = ? AND status = 'active'
        AND UPPER(TRIM(machine_code)) IN (${placeholders})`,
    [Number(processId), ...machineCodes.map((code) => String(code).trim().toUpperCase())]
  );
  return rows;
};

const validateFactoryMachineRules = async ({ processCode, processId, machineLines }) => {
  const code = String(processCode || '').trim().toUpperCase();
  const lines = Array.isArray(machineLines) ? machineLines.filter((line) => String(line?.machine_code || '').trim()) : [];
  if (!lines.length) return { valid: true, errors: {}, rules: [] };
  const rows = await loadMachineRows(processId, lines.map((line) => line.machine_code));
  const rowByCode = new Map(rows.map((row) => [String(row.machine_code).trim().toUpperCase(), row]));
  const errors = {};
  const rules = lines.map((line) => {
    const machineCode = String(line.machine_code || '').trim();
    const row = rowByCode.get(machineCode.toUpperCase()) || null;
    const shared = getSharedProcessRule(code, machineCode, row);
    if (shared) return { machine_code: machineCode, ...shared };
    const rule = code === 'GC' ? getGcMachineRule(machineCode, row) : { automatic: false, maxWorkers: 1, outputBasis: 'PRODUCT' };
    return { machine_code: machineCode, ...rule };
  });

  const uniqueCodes = new Set(lines.map((line) => String(line.machine_code || '').trim().toUpperCase()));
  if (['GC', 'MAI'].includes(code) && uniqueCodes.size > MAX_MACHINES_PER_WORKER) {
    errors.machine_lines = `Công đoạn ${code} cho phép một người chạy tối đa ${MAX_MACHINES_PER_WORKER} máy cùng lúc.`;
  }
  if (code === 'GC' && lines.length > 1 && rules.some((rule) => !rule.automatic && !SHARED_FACTORY_PROCESS_CODES.includes(code))) {
    errors.machine_lines = 'Gia công chỉ được chạy nhiều máy khi tất cả máy đã chọn là máy tự động. Máy thường chỉ 1 máy/người.';
  }
  if (code === 'GC' && lines.length > 4) {
    errors.machine_lines = 'Một công nhân chỉ được chạy tối đa 4 máy tự động cùng lúc.';
  }
  if (['DO', 'EP', 'CAN', 'K1', 'K2'].includes(code) && lines.length > 1) {
    errors.machine_lines = `${code === 'DO' ? 'Đo' : code === 'EP' ? 'Ép' : code === 'CAN' ? 'Cán' : 'Kiểm'} chỉ được 1 người/1 máy.`;
  }
  if (['K1', 'K2'].includes(code) && lines.length === 1) {
    const db = getDb();
    const [countRows] = await db.promise().query(
      `SELECT COUNT(*) AS total FROM machines WHERE process_id = ? AND status = 'active'`,
      [Number(processId)]
    );
    if (Number(countRows?.[0]?.total || 0) !== 1) {
      errors.machine_lines = 'Công đoạn Kiểm phải được cấu hình đúng duy nhất 1 máy kiểm đang hoạt động trong danh mục máy.';
    }
  }
  return { valid: Object.keys(errors).length === 0, errors, rules };
};

const executorQuery = (executor, sql, params = []) => new Promise((resolve, reject) => {
  executor.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});

const capacityRuleFor = (processCode, row) => {
  const code = String(processCode || '').trim().toUpperCase();
  if (SHARED_FACTORY_PROCESS_CODES.includes(code)) {
    return { maxWorkersPerMachine: MAX_WORKERS_PER_SHARED_MACHINE, maxMachinesPerWorker: MAX_MACHINES_PER_WORKER };
  }
  if (code === 'GC') {
    return { maxWorkersPerMachine: Number(row?.max_workers_per_machine || 1) || 1, maxMachinesPerWorker: null };
  }
  return { maxWorkersPerMachine: Number(row?.max_workers_per_machine || 1) || 1, maxMachinesPerWorker: null };
};

const validateMachineWorkerCapacity = async ({ processCode, processId, machineLines, workerId, workDate, shift, excludeTempReportId = null }) => {
  const lines = Array.isArray(machineLines) ? machineLines.filter((line) => String(line?.machine_code || '').trim()) : [];
  if (!lines.length || !workerId || !workDate || !shift) return { valid: true, errors: {} };
  const rows = await loadMachineRows(processId, lines.map((line) => line.machine_code));
  const rowByCode = new Map(rows.map((row) => [String(row.machine_code).trim().toUpperCase(), row]));
  const errors = {};
  const code = String(processCode || '').trim().toUpperCase();

  if (SHARED_FACTORY_PROCESS_CODES.includes(code)) {
    const uniqueRequestedMachines = new Set(lines.map((line) => String(line.machine_code).trim().toUpperCase()));
    if (uniqueRequestedMachines.size > MAX_MACHINES_PER_WORKER) {
      errors.machine_lines = `Công đoạn ${code} cho phép một người chạy tối đa ${MAX_MACHINES_PER_WORKER} máy cùng lúc.`;
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const machineCode = String(lines[index].machine_code || '').trim();
    const row = rowByCode.get(machineCode.toUpperCase()) || null;
    const rule = capacityRuleFor(code, row);
    const params = [Number(processId), String(workDate).slice(0, 10), String(shift).trim(), machineCode];
    const excludeSql = excludeTempReportId ? ' AND prt.id <> ?' : '';
    if (excludeTempReportId) params.push(Number(excludeTempReportId));
    const db = getDb();
    const [usageRows] = await db.promise().query(
      `SELECT DISTINCT worker_id FROM (
         SELECT prt.worker_id
           FROM production_reports_temp prt
           JOIN production_temp_machine_lines ml ON ml.temp_report_id = prt.id
          WHERE prt.process_id = ? AND prt.work_date = ? AND prt.shift = ?
            AND UPPER(TRIM(ml.machine_code)) = UPPER(?)
            AND prt.status IN ('pending','approved')${excludeSql}
         UNION
         SELECT pr.worker_id
           FROM production_reports pr
           JOIN production_report_machine_lines ml2 ON ml2.report_id = pr.id
          WHERE pr.process_id = ? AND pr.work_date = ? AND pr.shift = ?
            AND UPPER(TRIM(ml2.machine_code)) = UPPER(?)
       ) used`,
      excludeTempReportId
        ? [...params, Number(processId), String(workDate).slice(0, 10), String(shift).trim(), machineCode]
        : [...params, Number(processId), String(workDate).slice(0, 10), String(shift).trim(), machineCode]
    );
    const workers = new Set((usageRows || []).map((item) => Number(item.worker_id)).filter(Boolean));
    workers.add(Number(workerId));
    if (workers.size > rule.maxWorkersPerMachine) {
      errors[`machine_lines.${index}.machine_code`] = `Máy ${machineCode} chỉ cho phép tối đa ${rule.maxWorkersPerMachine} người trong cùng ngày/ca.`;
    }
  }

  if (SHARED_FACTORY_PROCESS_CODES.includes(code) && Object.keys(errors).length === 0) {
    const db = getDb();
    const excludeSql = excludeTempReportId ? ' AND prt.id <> ?' : '';
    const params = [Number(processId), Number(workerId), String(workDate).slice(0, 10), String(shift).trim()];
    if (excludeTempReportId) params.push(Number(excludeTempReportId));
    const [machineUsage] = await db.promise().query(
      `SELECT DISTINCT machine_code FROM (
         SELECT ml.machine_code
           FROM production_reports_temp prt
           JOIN production_temp_machine_lines ml ON ml.temp_report_id=prt.id
          WHERE prt.process_id=? AND prt.worker_id=? AND prt.work_date=? AND prt.shift=?
            AND prt.status IN ('pending','approved')${excludeSql}
         UNION
         SELECT ml2.machine_code
           FROM production_reports pr
           JOIN production_report_machine_lines ml2 ON ml2.report_id=pr.id
          WHERE pr.process_id=? AND pr.worker_id=? AND pr.work_date=? AND pr.shift=?
       ) used`,
      excludeTempReportId
        ? [...params, Number(processId), Number(workerId), String(workDate).slice(0, 10), String(shift).trim()]
        : [...params, Number(processId), Number(workerId), String(workDate).slice(0, 10), String(shift).trim()]
    );
    const allMachines = new Set((machineUsage || []).map((row) => String(row.machine_code).trim().toUpperCase()));
    for (const line of lines) allMachines.add(String(line.machine_code).trim().toUpperCase());
    if (allMachines.size > MAX_MACHINES_PER_WORKER) {
      errors.machine_lines = `Công đoạn ${code}: một người chỉ được làm tối đa ${MAX_MACHINES_PER_WORKER} máy cùng lúc.`;
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
};

const validateMachineWorkerCapacityLocked = async ({ executor, processCode, processId, machineLines, workerId, workDate, shift, excludeTempReportId = null }) => {
  const lines = Array.isArray(machineLines) ? machineLines.filter((line) => String(line?.machine_code || '').trim()) : [];
  if (!executor || !lines.length || !workerId || !workDate || !shift) return { valid: true, errors: {} };
  const code = String(processCode || '').trim().toUpperCase();
  const uniqueCodes = [...new Set(lines.map((line) => String(line.machine_code).trim().toUpperCase()))];
  const placeholders = uniqueCodes.map(() => '?').join(',');
  const machineRows = await executorQuery(executor,
    `SELECT id, process_id, machine_code, COALESCE(is_automatic,0) is_automatic,
            COALESCE(max_workers_per_machine,1) max_workers_per_machine,
            COALESCE(output_basis,'PRODUCT') output_basis
       FROM machines
      WHERE process_id=? AND status='active' AND UPPER(TRIM(machine_code)) IN (${placeholders})
      ORDER BY id FOR UPDATE`,
    [Number(processId), ...uniqueCodes]
  );
  const rowByCode = new Map(machineRows.map((row) => [String(row.machine_code).trim().toUpperCase(), row]));
  const errors = {};

  if (SHARED_FACTORY_PROCESS_CODES.includes(code) && uniqueCodes.length > MAX_MACHINES_PER_WORKER) {
    errors.machine_lines = `Công đoạn ${code} cho phép một người chạy tối đa ${MAX_MACHINES_PER_WORKER} máy cùng lúc.`;
  }

  for (let index=0; index<lines.length; index+=1) {
    const machineCode = String(lines[index].machine_code || '').trim();
    const row = rowByCode.get(machineCode.toUpperCase());
    if (!row) continue;
    const rule = capacityRuleFor(code, row);
    const tempExclude = excludeTempReportId ? ' AND prt.id<>?' : '';
    const tempParams = [Number(processId), String(workDate).slice(0,10), String(shift).trim(), machineCode];
    if (excludeTempReportId) tempParams.push(Number(excludeTempReportId));
    const usage = await executorQuery(executor,
      `SELECT DISTINCT worker_id FROM (
         SELECT prt.worker_id FROM production_reports_temp prt
         JOIN production_temp_machine_lines ml ON ml.temp_report_id=prt.id
         WHERE prt.process_id=? AND prt.work_date=? AND prt.shift=?
           AND UPPER(TRIM(ml.machine_code))=UPPER(?) AND prt.status IN ('pending','approved')${tempExclude}
         UNION
         SELECT pr.worker_id FROM production_reports pr
         JOIN production_report_machine_lines ml2 ON ml2.report_id=pr.id
         WHERE pr.process_id=? AND pr.work_date=? AND pr.shift=?
           AND UPPER(TRIM(ml2.machine_code))=UPPER(?)
       ) used`,
      [...tempParams, Number(processId), String(workDate).slice(0,10), String(shift).trim(), machineCode]
    );
    const workers = new Set(usage.map((item)=>Number(item.worker_id)).filter(Boolean));
    workers.add(Number(workerId));
    if (workers.size > rule.maxWorkersPerMachine) errors[`machine_lines.${index}.machine_code`] = `Máy ${machineCode} chỉ cho phép tối đa ${rule.maxWorkersPerMachine} người trong cùng ngày/ca.`;
  }

  if (SHARED_FACTORY_PROCESS_CODES.includes(code) && Object.keys(errors).length === 0) {
    const tempExclude = excludeTempReportId ? ' AND prt.id<>?' : '';
    const tempParams = [Number(processId), Number(workerId), String(workDate).slice(0,10), String(shift).trim()];
    if (excludeTempReportId) tempParams.push(Number(excludeTempReportId));
    const usage = await executorQuery(executor,
      `SELECT DISTINCT machine_code FROM (
         SELECT ml.machine_code FROM production_reports_temp prt
         JOIN production_temp_machine_lines ml ON ml.temp_report_id=prt.id
         WHERE prt.process_id=? AND prt.worker_id=? AND prt.work_date=? AND prt.shift=?
           AND prt.status IN ('pending','approved')${tempExclude}
         UNION
         SELECT ml2.machine_code FROM production_reports pr
         JOIN production_report_machine_lines ml2 ON ml2.report_id=pr.id
         WHERE pr.process_id=? AND pr.worker_id=? AND pr.work_date=? AND pr.shift=?
       ) used`,
      [...tempParams, Number(processId), Number(workerId), String(workDate).slice(0,10), String(shift).trim()]
    );
    const allMachines = new Set(usage.map((row)=>String(row.machine_code).trim().toUpperCase()));
    uniqueCodes.forEach((machineCode)=>allMachines.add(machineCode));
    if (allMachines.size > MAX_MACHINES_PER_WORKER) errors.machine_lines = `Công đoạn ${code}: một người chỉ được làm tối đa ${MAX_MACHINES_PER_WORKER} máy cùng lúc.`;
  }
  return { valid:Object.keys(errors).length===0, errors };
};

module.exports = {
  GC_AUTOMATIC_MACHINE_NUMBERS,
  GC_SHARED_MACHINE_NUMBERS,
  SHARED_FACTORY_PROCESS_CODES,
  MAX_MACHINES_PER_WORKER,
  MAX_WORKERS_PER_SHARED_MACHINE,
  canonicalMachineNumber,
  getGcMachineRule,
  getSharedProcessRule,
  validateFactoryMachineRules,
  validateMachineWorkerCapacity,
  validateMachineWorkerCapacityLocked
};
