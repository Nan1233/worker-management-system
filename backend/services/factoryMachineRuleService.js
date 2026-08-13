const GC_AUTOMATIC_MACHINE_NUMBERS = Object.freeze([1, 2, 10, 11, 4, 3, 9, 8, 25, 26, 14, 17, 23, 24, 16]);
const GC_SHARED_MACHINE_NUMBERS = Object.freeze([5, 6, 7, 11]);

const canonicalMachineNumber = (value) => {
  const raw = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
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
  const outputBasis = String(dbRow?.output_basis || ((automatic || GC_SHARED_MACHINE_NUMBERS.includes(machineNumber)) ? "MACHINE" : "PRODUCT")).toUpperCase();
  return { machineNumber, automatic, maxWorkers: Math.max(1, maxWorkers || 1), outputBasis };
};

const getDb = () => require("../config/db");

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
  const lines = Array.isArray(machineLines) ? machineLines.filter((line) => String(line?.machine_code || '').trim()) : [];
  if (!lines.length) return { valid: true, errors: {}, rules: [] };
  const rows = await loadMachineRows(processId, lines.map((line) => line.machine_code));
  const rowByCode = new Map(rows.map((row) => [String(row.machine_code).trim().toUpperCase(), row]));
  const errors = {};
  const rules = lines.map((line) => {
    const code = String(line.machine_code || '').trim();
    const row = rowByCode.get(code.toUpperCase()) || null;
    const rule = processCode === 'GC' ? getGcMachineRule(code, row) : { automatic: false, maxWorkers: 1, outputBasis: 'PRODUCT' };
    return { machine_code: code, ...rule };
  });

  if (processCode === 'GC' && lines.length > 1 && rules.some((rule) => !rule.automatic)) {
    errors.machine_lines = 'Gia công chỉ được chạy nhiều máy khi tất cả máy đã chọn là máy tự động. Máy thường chỉ 1 máy/người.';
  }
  if (processCode === 'GC' && lines.length > 4) {
    errors.machine_lines = 'Một công nhân chỉ được chạy tối đa 4 máy tự động cùng lúc.';
  }
  if (['DO', 'EP', 'CAN', 'K1', 'K2'].includes(processCode) && lines.length > 1) {
    errors.machine_lines = `${processCode === 'DO' ? 'Đo' : processCode === 'EP' ? 'Ép' : processCode === 'CAN' ? 'Cán' : 'Kiểm'} chỉ được 1 người/1 máy.`;
  }
  if (['K1', 'K2'].includes(processCode) && lines.length === 1) {
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

const validateMachineWorkerCapacity = async ({ processCode, processId, machineLines, workerId, workDate, shift, excludeTempReportId = null }) => {
  const lines = Array.isArray(machineLines) ? machineLines.filter((line) => String(line?.machine_code || '').trim()) : [];
  if (!lines.length || !workerId || !workDate || !shift) return { valid: true, errors: {} };
  const rows = await loadMachineRows(processId, lines.map((line) => line.machine_code));
  const rowByCode = new Map(rows.map((row) => [String(row.machine_code).trim().toUpperCase(), row]));
  const errors = {};

  for (let index = 0; index < lines.length; index += 1) {
    const code = String(lines[index].machine_code || '').trim();
    const row = rowByCode.get(code.toUpperCase()) || null;
    const rule = processCode === 'GC'
      ? getGcMachineRule(code, row)
      : { maxWorkers: Number(row?.max_workers_per_machine || 1) || 1 };
    const params = [Number(processId), String(workDate).slice(0, 10), String(shift).trim(), code];
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
        ? [...params, Number(processId), String(workDate).slice(0, 10), String(shift).trim(), code]
        : [...params, Number(processId), String(workDate).slice(0, 10), String(shift).trim(), code]
    );
    const workers = new Set((usageRows || []).map((item) => Number(item.worker_id)).filter(Boolean));
    workers.add(Number(workerId));
    if (workers.size > rule.maxWorkers) {
      errors[`machine_lines.${index}.machine_code`] = `Máy ${code} chỉ cho phép tối đa ${rule.maxWorkers} người trong cùng ngày/ca.`;
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
};


const executorQuery = (executor, sql, params = []) => new Promise((resolve, reject) => {
  executor.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});

const validateMachineWorkerCapacityLocked = async ({ executor, processCode, processId, machineLines, workerId, workDate, shift, excludeTempReportId = null }) => {
  const lines = Array.isArray(machineLines) ? machineLines.filter((line) => String(line?.machine_code || '').trim()) : [];
  if (!executor || !lines.length || !workerId || !workDate || !shift) return { valid: true, errors: {} };
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
  for (let index=0; index<lines.length; index+=1) {
    const code = String(lines[index].machine_code || '').trim();
    const row = rowByCode.get(code.toUpperCase());
    if (!row) continue;
    const rule = processCode === 'GC' ? getGcMachineRule(code, row) : { maxWorkers:Number(row.max_workers_per_machine||1)||1 };
    const tempExclude = excludeTempReportId ? ' AND prt.id<>?' : '';
    const tempParams = [Number(processId), String(workDate).slice(0,10), String(shift).trim(), code];
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
      [...tempParams, Number(processId), String(workDate).slice(0,10), String(shift).trim(), code]
    );
    const workers = new Set(usage.map((item)=>Number(item.worker_id)).filter(Boolean));
    workers.add(Number(workerId));
    if (workers.size > rule.maxWorkers) errors[`machine_lines.${index}.machine_code`] = `Máy ${code} chỉ cho phép tối đa ${rule.maxWorkers} người trong cùng ngày/ca.`;
  }
  return { valid:Object.keys(errors).length===0, errors };
};

module.exports = {
  GC_AUTOMATIC_MACHINE_NUMBERS,
  GC_SHARED_MACHINE_NUMBERS,
  canonicalMachineNumber,
  getGcMachineRule,
  validateFactoryMachineRules,
  validateMachineWorkerCapacity,
  validateMachineWorkerCapacityLocked
};
