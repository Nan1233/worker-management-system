const GC_AUTOMATIC_MACHINE_NUMBERS = Object.freeze([
  1, 2, 10, 11, 4, 3, 9, 8, 25, 26, 14, 17, 23, 24, 16
]);

const GC_SHARED_MACHINE_NUMBERS = Object.freeze([5, 6, 7, 11]);

// Business rule:
// - Cắt/Lồng (GC): 1 worker tối đa 4 máy; 1 máy tối đa 2 workers.
// - Mài (MAI): 1 worker tối đa 4 máy; 1 máy tối đa 2 workers.
// - Các công đoạn khác giữ capacity theo DB, mặc định 1 người/máy.
const MULTI_MACHINE_PROCESS_CODES = new Set(["GC", "MAI"]);
const MAX_MACHINES_PER_WORKER = 4;
const DEFAULT_SHARED_WORKERS_PER_MACHINE = 4;

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
    : (GC_SHARED_MACHINE_NUMBERS.includes(machineNumber)
      ? DEFAULT_SHARED_WORKERS_PER_MACHINE
      : 1);

  const outputBasis = String(
    dbRow?.output_basis ||
    ((automatic || GC_SHARED_MACHINE_NUMBERS.includes(machineNumber))
      ? "MACHINE"
      : "PRODUCT")
  ).toUpperCase();

  return {
    machineNumber,
    automatic,
    maxWorkers: Math.max(1, maxWorkers || 1),
    outputBasis
  };
};

const getProcessMachineRule = (processCode, machineCode, dbRow = null) => {
  const code = String(processCode || "").trim().toUpperCase();

  if (MULTI_MACHINE_PROCESS_CODES.has(code)) {
    return {
      maxMachinesPerWorker: MAX_MACHINES_PER_WORKER,
      maxWorkersPerMachine: DEFAULT_SHARED_WORKERS_PER_MACHINE,
      automatic: dbRow?.is_automatic != null
        ? Number(dbRow.is_automatic) === 1
        : code === "GC" ? GC_AUTOMATIC_MACHINE_NUMBERS.includes(canonicalMachineNumber(machineCode)) : false,
      outputBasis: String(dbRow?.output_basis || "PRODUCT").toUpperCase()
    };
  }

  return {
    maxMachinesPerWorker: 1,
    maxWorkersPerMachine: Number(dbRow?.max_workers_per_machine || 1) || 1,
    automatic: Number(dbRow?.is_automatic || 0) === 1,
    outputBasis: String(dbRow?.output_basis || "PRODUCT").toUpperCase()
  };
};

const getDb = () => require("../config/db");

const loadMachineRows = async (processId, machineCodes) => {
  if (!machineCodes.length) return [];
  const db = getDb();
  const placeholders = machineCodes.map(() => "?").join(",");
  const [rows] = await db.promise().query(
    `SELECT id, process_id, machine_code,
            COALESCE(is_automatic,0) is_automatic,
            COALESCE(max_workers_per_machine,1) max_workers_per_machine,
            COALESCE(output_basis,'PRODUCT') output_basis
       FROM machines
      WHERE process_id = ? AND status = 'active'
        AND UPPER(TRIM(machine_code)) IN (${placeholders})`,
    [
      Number(processId),
      ...machineCodes.map((code) => String(code).trim().toUpperCase())
    ]
  );
  return rows;
};

const validateFactoryMachineRules = async ({
  processCode,
  processId,
  machineLines
}) => {
  const code = String(processCode || "").trim().toUpperCase();
  const lines = Array.isArray(machineLines)
    ? machineLines.filter((line) => String(line?.machine_code || "").trim())
    : [];

  if (!lines.length) return { valid: true, errors: {}, rules: [] };

  const rows = await loadMachineRows(
    processId,
    lines.map((line) => line.machine_code)
  );

  const rowByCode = new Map(
    rows.map((row) => [String(row.machine_code).trim().toUpperCase(), row])
  );

  const errors = {};
  const rules = lines.map((line) => {
    const machineCode = String(line.machine_code || "").trim();
    const row = rowByCode.get(machineCode.toUpperCase()) || null;
    const rule = getProcessMachineRule(code, machineCode, row);
    return {
      machine_code: machineCode,
      ...rule
    };
  });

  if (MULTI_MACHINE_PROCESS_CODES.has(code)) {
    if (lines.length > MAX_MACHINES_PER_WORKER) {
      errors.machine_lines =
        `Công đoạn ${code} chỉ cho phép một công nhân chạy tối đa ${MAX_MACHINES_PER_WORKER} máy cùng lúc.`;
    }
  } else if (lines.length > 1) {
    errors.machine_lines =
      `Công đoạn ${code} chỉ được 1 người/1 máy.`;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    rules
  };
};

const executorQuery = (executor, sql, params = []) =>
  new Promise((resolve, reject) => {
    executor.query(sql, params, (error, rows) =>
      error ? reject(error) : resolve(rows)
    );
  });

const validateMachineWorkerCapacity = async ({
  processCode,
  processId,
  machineLines,
  workerId,
  workDate,
  shift,
  excludeTempReportId = null
}) => {
  const code = String(processCode || "").trim().toUpperCase();
  const lines = Array.isArray(machineLines)
    ? machineLines.filter((line) => String(line?.machine_code || "").trim())
    : [];

  if (!lines.length || !workerId || !workDate || !shift) {
    return { valid: true, errors: {} };
  }

  const uniqueCodes = [...new Set(
    lines.map((line) => String(line.machine_code).trim().toUpperCase())
  )];

  if (MULTI_MACHINE_PROCESS_CODES.has(code) &&
      uniqueCodes.length > MAX_MACHINES_PER_WORKER) {
    return {
      valid: false,
      errors: {
        machine_lines: `Một công nhân chỉ được chạy tối đa ${MAX_MACHINES_PER_WORKER} máy trong công đoạn ${code}.`
      }
    };
  }

  const rows = await loadMachineRows(processId, uniqueCodes);
  const rowByCode = new Map(
    rows.map((row) => [String(row.machine_code).trim().toUpperCase(), row])
  );

  const errors = {};

  for (const machineCode of uniqueCodes) {
    const row = rowByCode.get(machineCode);
    const rule = getProcessMachineRule(code, machineCode, row);

    const db = getDb();
    const tempExclude = excludeTempReportId ? " AND prt.id <> ?" : "";
    const tempParams = [
      Number(processId),
      String(workDate).slice(0, 10),
      String(shift).trim(),
      machineCode
    ];

    if (excludeTempReportId) {
      tempParams.push(Number(excludeTempReportId));
    }

    const [usageRows] = await db.promise().query(
      `SELECT DISTINCT worker_id FROM (
         SELECT prt.worker_id
           FROM production_reports_temp prt
           JOIN production_temp_machine_lines ml
             ON ml.temp_report_id = prt.id
          WHERE prt.process_id = ?
            AND prt.work_date = ?
            AND prt.shift = ?
            AND UPPER(TRIM(ml.machine_code)) = UPPER(?)
            AND prt.status IN ('pending','approved')
            ${tempExclude}
         UNION
         SELECT pr.worker_id
           FROM production_reports pr
           JOIN production_report_machine_lines ml2
             ON ml2.report_id = pr.id
          WHERE pr.process_id = ?
            AND pr.work_date = ?
            AND pr.shift = ?
            AND UPPER(TRIM(ml2.machine_code)) = UPPER(?)
       ) used`,
      [
        ...tempParams,
        Number(processId),
        String(workDate).slice(0, 10),
        String(shift).trim(),
        machineCode
      ]
    );

    const workers = new Set(
      (usageRows || [])
        .map((item) => Number(item.worker_id))
        .filter(Boolean)
    );

    workers.add(Number(workerId));

    if (workers.size > rule.maxWorkersPerMachine) {
      errors.machine_lines =
        `Máy ${machineCode} chỉ cho phép tối đa ${rule.maxWorkersPerMachine} người trong cùng ngày/ca.`;
      break;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
};

const validateMachineWorkerCapacityLocked = async ({
  executor,
  processCode,
  processId,
  machineLines,
  workerId,
  workDate,
  shift,
  excludeTempReportId = null
}) => {
  const code = String(processCode || "").trim().toUpperCase();
  const lines = Array.isArray(machineLines)
    ? machineLines.filter((line) => String(line?.machine_code || "").trim())
    : [];

  if (!executor || !lines.length || !workerId || !workDate || !shift) {
    return { valid: true, errors: {} };
  }

  const uniqueCodes = [...new Set(
    lines.map((line) => String(line.machine_code).trim().toUpperCase())
  )];

  if (MULTI_MACHINE_PROCESS_CODES.has(code) &&
      uniqueCodes.length > MAX_MACHINES_PER_WORKER) {
    return {
      valid: false,
      errors: {
        machine_lines: `Một công nhân chỉ được chạy tối đa ${MAX_MACHINES_PER_WORKER} máy trong công đoạn ${code}.`
      }
    };
  }

  const placeholders = uniqueCodes.map(() => "?").join(",");
  const machineRows = await executorQuery(
    executor,
    `SELECT id, process_id, machine_code,
            COALESCE(is_automatic,0) is_automatic,
            COALESCE(max_workers_per_machine,1) max_workers_per_machine,
            COALESCE(output_basis,'PRODUCT') output_basis
       FROM machines
      WHERE process_id = ?
        AND status = 'active'
        AND UPPER(TRIM(machine_code)) IN (${placeholders})
      ORDER BY id
      FOR UPDATE`,
    [Number(processId), ...uniqueCodes]
  );

  const rowByCode = new Map(
    machineRows.map((row) => [String(row.machine_code).trim().toUpperCase(), row])
  );

  const errors = {};

  for (const machineCode of uniqueCodes) {
    const row = rowByCode.get(machineCode);
    if (!row) continue;

    const rule = getProcessMachineRule(code, machineCode, row);

    const tempExclude = excludeTempReportId ? " AND prt.id <> ?" : "";
    const tempParams = [
      Number(processId),
      String(workDate).slice(0, 10),
      String(shift).trim(),
      machineCode
    ];

    if (excludeTempReportId) {
      tempParams.push(Number(excludeTempReportId));
    }

    const usage = await executorQuery(
      executor,
      `SELECT DISTINCT worker_id FROM (
         SELECT prt.worker_id
           FROM production_reports_temp prt
           JOIN production_temp_machine_lines ml
             ON ml.temp_report_id = prt.id
          WHERE prt.process_id = ?
            AND prt.work_date = ?
            AND prt.shift = ?
            AND UPPER(TRIM(ml.machine_code)) = UPPER(?)
            AND prt.status IN ('pending','approved')
            ${tempExclude}
         UNION
         SELECT pr.worker_id
           FROM production_reports pr
           JOIN production_report_machine_lines ml2
             ON ml2.report_id = pr.id
          WHERE pr.process_id = ?
            AND pr.work_date = ?
            AND pr.shift = ?
            AND UPPER(TRIM(ml2.machine_code)) = UPPER(?)
       ) used`,
      [
        ...tempParams,
        Number(processId),
        String(workDate).slice(0, 10),
        String(shift).trim(),
        machineCode
      ]
    );

    const workers = new Set(
      usage.map((item) => Number(item.worker_id)).filter(Boolean)
    );

    workers.add(Number(workerId));

    if (workers.size > rule.maxWorkersPerMachine) {
      errors.machine_lines =
        `Máy ${machineCode} chỉ cho phép tối đa ${rule.maxWorkersPerMachine} người trong cùng ngày/ca.`;
      break;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
};

module.exports = {
  GC_AUTOMATIC_MACHINE_NUMBERS,
  GC_SHARED_MACHINE_NUMBERS,
  MULTI_MACHINE_PROCESS_CODES,
  MAX_MACHINES_PER_WORKER,
  DEFAULT_SHARED_WORKERS_PER_MACHINE,
  canonicalMachineNumber,
  getGcMachineRule,
  getProcessMachineRule,
  validateFactoryMachineRules,
  validateMachineWorkerCapacity,
  validateMachineWorkerCapacityLocked
};
