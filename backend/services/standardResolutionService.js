const defaultQuery = async (sql, params = []) => {
  const db = require('../config/db');
  const [rows] = await db.promise().query(sql, params);
  return rows;
};

function businessError(code, message, details = null) {
  const error = new Error(message);
  error.status = 422;
  error.code = code;
  error.isPublic = true;
  if (details) error.details = details;
  return error;
}

function normalizeWorkDate(value) {
  const text = value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
    : String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw businessError('INVALID_WORK_DATE', 'Ngày làm việc không hợp lệ');
  }
  return text;
}

function positiveDecimal(value, code = 'INVALID_STANDARD_VALUE') {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw businessError(code, 'Định mức phải là số dương hợp lệ');
  }
  return number;
}

function sameDecimal(a, b, tolerance = 0.000001) {
  return Math.abs(Number(a) - Number(b)) <= tolerance;
}

function assertEffectiveOnDate(row, date, label) {
  const from = row?.effective_from ? String(row.effective_from).slice(0, 10) : null;
  const to = row?.effective_to ? String(row.effective_to).slice(0, 10) : null;
  if (from && from > date) {
    throw businessError('HISTORICAL_STANDARD_NOT_FOUND', `${label} chưa có hiệu lực tại ngày ${date}`, {
      effective_from: from, effective_to: to
    });
  }
  if (to && to < date) {
    throw businessError('HISTORICAL_STANDARD_NOT_FOUND', `${label} đã hết hiệu lực tại ngày ${date}`, {
      effective_from: from, effective_to: to
    });
  }
}

function createStandardResolver({ query = defaultQuery } = {}) {
  const productCache = new Map();
  const standardCache = new Map();

  async function resolveProduct({ processId, productCode, workDate, standardVersionId = null }) {
    const pid = Number(processId);
    const product = String(productCode || '').trim();
    const date = normalizeWorkDate(workDate);

    if (pid === 60006 && !product) {
      return {
        processId: pid, productCode: null, productStandardId: null,
        standardVersionId: null, machineStandardId: null, standardOutput: 0,
        standardTimeSeconds: null, excludeKqdFromTt: 0, effectiveFrom: null,
        effectiveTo: null, source: 'NON_PRODUCT_WORK', workDate: date,
        historicalVersionAvailable: false, nonProductWork: true
      };
    }

    if (!Number.isInteger(pid) || pid <= 0 || !product) {
      throw businessError('INVALID_STANDARD_LOOKUP', 'Thiếu công đoạn hoặc sản phẩm để tra định mức');
    }

    const requestedVersionId = Number(standardVersionId) || null;
    const cacheKey = `${pid}|${product}|${date}|${requestedVersionId || ''}`;
    if (productCache.has(cacheKey)) return productCache.get(cacheKey);

    const productRows = await query(
      `SELECT id AS product_standard_id, product_code, standard_output, exclude_kqd_from_tt
       FROM product_standards
       WHERE process_id=? AND product_code=? AND status='active'
       LIMIT 2`,
      [pid, product]
    );
    if (productRows.length !== 1) {
      throw businessError('HISTORICAL_STANDARD_NOT_FOUND', `Không tìm thấy sản phẩm ${product} đang hoạt động trong công đoạn`);
    }

    // Approval must validate against the immutable historical version saved on the
    // report, not re-select a different version merely because the master table was
    // edited after the report was created. This is the important distinction between
    // "resolve by work_date" for new reports and "verify the saved snapshot" for old ones.
    if (requestedVersionId) {
      const versionRows = await query(
        `SELECT id, process_id, product_code, standard_output, exclude_kqd_from_tt,
                version_no, effective_from, effective_to, status
           FROM product_standard_versions
          WHERE id=? AND process_id=? AND product_code=?
          LIMIT 1`,
        [requestedVersionId, pid, product]
      );
      if (versionRows.length !== 1) {
        throw businessError('HISTORICAL_STANDARD_NOT_FOUND', `Không tìm thấy định mức lịch sử #${requestedVersionId} cho ${product}`, {
          process_id: pid, product_code: product, standard_version_id: requestedVersionId, work_date: date
        });
      }
      const version = versionRows[0];
      assertEffectiveOnDate(version, date, `Định mức lịch sử #${requestedVersionId}`);
      const resolvedSnapshot = {
        processId: pid, productCode: productRows[0].product_code,
        productStandardId: Number(productRows[0].product_standard_id),
        standardVersionId: Number(version.id), machineStandardId: null,
        standardOutput: positiveDecimal(version.standard_output), standardTimeSeconds: null,
        excludeKqdFromTt: Number(version.exclude_kqd_from_tt || 0) === 1 ? 1 : 0,
        effectiveFrom: version.effective_from ? String(version.effective_from).slice(0, 10) : null,
        effectiveTo: version.effective_to ? String(version.effective_to).slice(0, 10) : null,
        source: 'PRODUCT_VERSION_SNAPSHOT', workDate: date, historicalVersionAvailable: true,
        snapshotVersionId: Number(version.id), snapshotStatus: version.status || null
      };
      productCache.set(cacheKey, resolvedSnapshot);
      return resolvedSnapshot;
    }

    const versions = await query(
      `SELECT id, process_id, product_code, standard_output, exclude_kqd_from_tt,
              version_no, effective_from, effective_to
       FROM product_standard_versions
       WHERE process_id=? AND product_code=? AND status='active'
         AND effective_from <= ?
         AND (effective_to IS NULL OR effective_to >= ?)
       ORDER BY effective_from, version_no, id`,
      [pid, product, date, date]
    );

    if (versions.length === 0) {
      const legacyStandardOutput = Number(productRows[0].standard_output);
      if (!Number.isFinite(legacyStandardOutput) || legacyStandardOutput <= 0) {
        throw businessError('HISTORICAL_STANDARD_NOT_FOUND', `Không có định mức lịch sử cho ${product} tại ngày ${date}`, {
          process_id: pid, product_code: product, work_date: date
        });
      }
      const resolvedLegacy = {
        processId: pid, productCode: productRows[0].product_code,
        productStandardId: Number(productRows[0].product_standard_id),
        standardVersionId: null, machineStandardId: null,
        standardOutput: legacyStandardOutput, standardTimeSeconds: null,
        excludeKqdFromTt: Number(productRows[0].exclude_kqd_from_tt || 0) === 1 ? 1 : 0,
        effectiveFrom: null, effectiveTo: null, source: 'LEGACY_PRODUCT_STANDARD',
        workDate: date, historicalVersionAvailable: false
      };
      productCache.set(cacheKey, resolvedLegacy);
      return resolvedLegacy;
    }

    if (versions.length > 1) {
      throw businessError('STANDARD_EFFECTIVE_RANGE_CONFLICT', `Có nhiều định mức cùng hiệu lực cho ${product} tại ngày ${date}`, {
        process_id: pid, product_code: product, work_date: date,
        version_ids: versions.map((row) => Number(row.id))
      });
    }

    const version = versions[0];
    const resolvedProduct = {
      processId: pid, productCode: productRows[0].product_code,
      productStandardId: Number(productRows[0].product_standard_id), standardVersionId: Number(version.id), machineStandardId: null,
      standardOutput: positiveDecimal(version.standard_output), standardTimeSeconds: null,
      excludeKqdFromTt: Number(version.exclude_kqd_from_tt || 0) === 1 ? 1 : 0,
      effectiveFrom: String(version.effective_from).slice(0, 10),
      effectiveTo: version.effective_to ? String(version.effective_to).slice(0, 10) : null,
      source: 'PRODUCT_VERSION', workDate: date, historicalVersionAvailable: true
    };
    productCache.set(cacheKey, resolvedProduct);
    return resolvedProduct;
  }

  async function resolveStandard({ processId, productCode, machineId = null, machineCode = null, workDate, standardVersionId = null, machineStandardId = null }) {
    const requestedMachineId = Number(machineId) || null;
    const requestedMachineCode = String(machineCode || '').trim();
    const requestedVersionId = Number(standardVersionId) || null;
    const requestedMachineStandardId = Number(machineStandardId) || null;
    const standardKey = `${Number(processId)}|${String(productCode || '').trim()}|${normalizeWorkDate(workDate)}|${requestedMachineId || ''}|${requestedMachineCode}|v${requestedVersionId || ''}|ms${requestedMachineStandardId || ''}`;
    if (standardCache.has(standardKey)) return standardCache.get(standardKey);

    const product = await resolveProduct({ processId, productCode, workDate, standardVersionId: requestedVersionId });
    if (!requestedMachineId && !requestedMachineCode && !requestedMachineStandardId) {
      standardCache.set(standardKey, product);
      return product;
    }

    const machineRows = await query(
      `SELECT id, machine_code FROM machines
       WHERE process_id=? AND status='active'
         AND (? IS NULL OR id=?) AND (?='' OR machine_code=?) LIMIT 2`,
      [product.processId, requestedMachineId || (requestedMachineStandardId ? null : null), requestedMachineId || (requestedMachineStandardId ? null : null), requestedMachineCode, requestedMachineCode]
    );
    if (machineRows.length !== 1) {
      throw businessError('MACHINE_NOT_FOUND', 'Máy không tồn tại hoặc không thuộc công đoạn');
    }
    const machine = machineRows[0];

    if (requestedMachineStandardId) {
      const snapshotRows = await query(
        `SELECT id, process_id, product_code, machine_id, standard_output,
                calculated_output_per_hour, standard_time_seconds,
                effective_from, effective_to, is_active
           FROM product_machine_standards
          WHERE id=? AND process_id=? AND product_code=? AND machine_id=?
          LIMIT 1`,
        [requestedMachineStandardId, product.processId, product.productCode, Number(machine.id)]
      );
      if (snapshotRows.length !== 1) {
        throw businessError('HISTORICAL_STANDARD_NOT_FOUND', `Không tìm thấy định mức máy lịch sử #${requestedMachineStandardId}`, {
          process_id: product.processId, product_code: product.productCode,
          machine_id: Number(machine.id), machine_standard_id: requestedMachineStandardId,
          work_date: product.workDate
        });
      }
      const row = snapshotRows[0];
      assertEffectiveOnDate(row, product.workDate, `Định mức máy lịch sử #${requestedMachineStandardId}`);
      const resolvedMachineSnapshot = {
        ...product,
        machineId: Number(machine.id), machineCode: machine.machine_code,
        machineStandardId: Number(row.id),
        standardOutput: positiveDecimal(row.calculated_output_per_hour ?? row.standard_output),
        standardTimeSeconds: Number(row.standard_time_seconds) > 0 ? Number(row.standard_time_seconds) : null,
        source: 'MACHINE_SNAPSHOT',
        machineEffectiveFrom: row.effective_from ? String(row.effective_from).slice(0, 10) : null,
        machineEffectiveTo: row.effective_to ? String(row.effective_to).slice(0, 10) : null,
        snapshotMachineStandardId: Number(row.id),
        snapshotMachineActive: Number(row.is_active || 0)
      };
      standardCache.set(standardKey, resolvedMachineSnapshot);
      return resolvedMachineSnapshot;
    }

    const applicable = await query(
      `SELECT id, standard_output, calculated_output_per_hour, standard_time_seconds,
              effective_from, effective_to
       FROM product_machine_standards
       WHERE process_id=? AND product_code=? AND machine_id=? AND is_active=1
         AND (effective_from IS NULL OR effective_from <= ?)
         AND (effective_to IS NULL OR effective_to >= ?)
       ORDER BY COALESCE(effective_from,'1000-01-01'), id`,
      [product.processId, product.productCode, Number(machine.id), product.workDate, product.workDate]
    );
    if (applicable.length > 1) {
      throw businessError('STANDARD_EFFECTIVE_RANGE_CONFLICT', `Có nhiều định mức máy cùng hiệu lực cho ${product.productCode} / ${machine.machine_code}`, {
        process_id: product.processId, product_code: product.productCode,
        machine_id: Number(machine.id), work_date: product.workDate,
        machine_standard_ids: applicable.map((row) => Number(row.id))
      });
    }
    if (applicable.length === 1) {
      const row = applicable[0];
      const resolvedMachine = {
        ...product, machineId: Number(machine.id), machineCode: machine.machine_code,
        machineStandardId: Number(row.id),
        standardOutput: positiveDecimal(row.calculated_output_per_hour ?? row.standard_output),
        standardTimeSeconds: Number(row.standard_time_seconds) > 0 ? Number(row.standard_time_seconds) : null,
        source: 'MACHINE',
        machineEffectiveFrom: row.effective_from ? String(row.effective_from).slice(0, 10) : null,
        machineEffectiveTo: row.effective_to ? String(row.effective_to).slice(0, 10) : null
      };
      standardCache.set(standardKey, resolvedMachine);
      return resolvedMachine;
    }

    const resolvedFallback = {
      ...product, machineId: Number(machine.id), machineCode: machine.machine_code,
      machineStandardId: null, source: `${product.source}_MACHINE_FALLBACK`
    };
    standardCache.set(standardKey, resolvedFallback);
    return resolvedFallback;
  }

  async function validateProductVersionRange({ processId, productCode, effectiveFrom, effectiveTo = null, excludeVersionId = null }) {
    const from = normalizeWorkDate(effectiveFrom);
    const to = effectiveTo ? normalizeWorkDate(effectiveTo) : null;
    if (to && to < from) throw businessError('INVALID_STANDARD_EFFECTIVE_RANGE', 'Ngày kết thúc định mức phải từ ngày bắt đầu trở đi');
    const rows = await query(
      `SELECT id FROM product_standard_versions
       WHERE process_id=? AND product_code=? AND status='active'
         AND (? IS NULL OR id<>?)
         AND effective_from <= COALESCE(?, '9999-12-31')
         AND (effective_to IS NULL OR effective_to >= ?)
       LIMIT 2`,
      [Number(processId), String(productCode || '').trim(), excludeVersionId ? Number(excludeVersionId) : null, excludeVersionId ? Number(excludeVersionId) : null, to, from]
    );
    if (rows.length) {
      throw businessError('STANDARD_EFFECTIVE_RANGE_CONFLICT', 'Khoảng hiệu lực định mức bị chồng lấn', { conflicting_version_ids: rows.map((row) => Number(row.id)) });
    }
    return true;
  }

  return { resolveProduct, resolveStandard, validateProductVersionRange };
}

function assertStandardSnapshotConsistency({ resolved, standardOutput, standardVersionId, machineStandardId = null }) {
  const outputMatches = Boolean(resolved) && sameDecimal(resolved.standardOutput, standardOutput);
  const versionMatches = Number(resolved?.standardVersionId || 0) === Number(standardVersionId || 0);
  const machineMatches = Number(resolved?.machineStandardId || 0) === Number(machineStandardId || 0);

  const legacyProductSnapshot = outputMatches
    && versionMatches
    && Number(machineStandardId || 0) === 0
    && Number(resolved?.machineStandardId || 0) > 0;

  const legacyUnversionedSnapshot = outputMatches
    && Number(standardVersionId || 0) === 0
    && Number(machineStandardId || 0) === 0
    && Number(resolved?.machineStandardId || 0) === 0;

  if (!resolved || !outputMatches || (!versionMatches || !machineMatches) && !legacyProductSnapshot && !legacyUnversionedSnapshot) {
    throw businessError('STANDARD_SNAPSHOT_MISMATCH', 'Định mức đã lưu không khớp nguồn định mức lịch sử', {
      saved_standard_output: standardOutput ?? null,
      saved_standard_version_id: standardVersionId ?? null,
      saved_machine_standard_id: machineStandardId ?? null,
      expected_standard_output: resolved?.standardOutput ?? null,
      expected_standard_version_id: resolved?.standardVersionId ?? null,
      expected_machine_standard_id: resolved?.machineStandardId ?? null,
      expected_source: resolved?.source ?? null
    });
  }
  return true;
}

const runtimeResolver = createStandardResolver();
module.exports = {
  ...runtimeResolver,
  createStandardResolver,
  assertStandardSnapshotConsistency,
  normalizeWorkDate,
  businessError
};
