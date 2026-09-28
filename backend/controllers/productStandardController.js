const productStandardModel = require("../models/productStandardModel");
const machineModel = require("../models/machineModel");
const { TTL, getOrLoadMasterData } = require("../utils/masterDataCache");
const db = require("../config/db");

const query = (sql, params = []) => db.promise().query(sql, params);

const GC_NO_STANDARD_LONG_CODES = new Set(["XUATNHAP", "KTCD", "TAIPP"]);

const loadGcNoStandardLongCodes = async () => {
  const [rows] = await query(`
    SELECT
        ps.id,
        ps.process_id,
        p.process_code,
        ps.work_type,
        ps.product_code,
        COALESCE(pa.alias_code, ps.encoding_code) AS alias_code,
        ps.encoding_code,
        ps.standard_output,
        COALESCE(ps.exclude_kqd_from_tt, 0) AS exclude_kqd_from_tt,
        0 AS has_machine_specific_standard,
        '' AS eligible_machine_codes
    FROM product_standards ps
    JOIN processes p ON p.id = ps.process_id
    LEFT JOIN product_aliases pa
      ON pa.process_id = ps.process_id
     AND UPPER(TRIM(pa.product_code)) = UPPER(TRIM(ps.product_code))
     AND pa.status = 'active'
    WHERE p.status = 'active'
      AND UPPER(TRIM(p.process_code)) = 'GC'
      AND UPPER(TRIM(ps.work_type)) = 'LONG'
      AND UPPER(TRIM(ps.product_code)) IN ('XUATNHAP', 'KTCD', 'TAIPP')
      AND ps.status = 'active'
    ORDER BY ps.product_code ASC, ps.id ASC
  `);
  return Array.isArray(rows) ? rows : [];
};

const ensureGcNoStandardLongCodes = async (data) => {
  const rows = Array.isArray(data) ? [...data] : [];
  if (!rows.length && !rows.some?.((row) => String(row?.process_code || '').trim().toUpperCase() === 'GC')) return rows;
  const hasGc = rows.some((row) => String(row?.process_code || '').trim().toUpperCase() === 'GC');
  if (!hasGc) return rows;

  const required = await loadGcNoStandardLongCodes();
  const existing = new Set(rows.map((row) => String(row?.product_code || '').trim().toUpperCase()).filter(Boolean));
  for (const row of required) {
    const code = String(row.product_code || '').trim().toUpperCase();
    if (GC_NO_STANDARD_LONG_CODES.has(code) && !existing.has(code)) {
      rows.push(row);
      existing.add(code);
    }
  }
  return rows;
};

exports.getProductStandards = async (req, res) => {
  try {
    const processCode = String(req.query.process_code || '').trim().toUpperCase();
    const processId = Number(req.query.process_id);

    if (!processCode && (!Number.isInteger(processId) || processId <= 0)) {
      return res.status(400).json({ success: false, message: "process_code hoặc process_id không hợp lệ" });
    }
    if (processCode && !/^[A-Z0-9_-]{1,20}$/.test(processCode)) {
      return res.status(400).json({ success: false, message: "process_code không hợp lệ" });
    }

    // v4: keep a dedicated cache namespace and explicitly re-read the three
    // GC Long Tay zero-standard work codes from DB. These are valid master
    // data but must not be hidden by the normal positive-standard filter.
    const cacheKey = processCode
      ? `product-standards:v4:code:${processCode}`
      : `product-standards:v4:id:${processId}`;
    const data = await getOrLoadMasterData(
      cacheKey,
      TTL.productStandards,
      async () => {
        const baseRows = processCode
          ? await productStandardModel.findByProcessCode(processCode)
          : await productStandardModel.findByProcess(processId);
        return String(processCode || '').trim().toUpperCase() === 'GC'
          ? ensureGcNoStandardLongCodes(baseRows)
          : baseRows;
      }
    );

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("GET PRODUCT STANDARDS ERROR:", error);
    return res.status(500).json({ success: false, message: "Không thể lấy danh sách sản phẩm" });
  }
};

exports.resolveProductStandard = async (req, res) => {
  try {
    const processId = Number(req.query.process_id);
    const machineCode = String(req.query.machine_code || '').trim();
    const productCode = String(req.query.product_code || '').trim();
    const workDate = String(req.query.work_date || '').trim();

    if (!Number.isInteger(processId) || processId <= 0 || !productCode || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
      return res.status(400).json({ success: false, message: 'Thiếu process_id, product_code hoặc work_date hợp lệ' });
    }

    await Promise.all([
      getOrLoadMasterData(`machines:${processId}`, TTL.machines, () => machineModel.findByProcess(processId)),
      getOrLoadMasterData(`product-standards:${processId}`, TTL.productStandards, () => productStandardModel.findByProcess(processId))
    ]);

    if (machineCode) {
      const [machineRows] = await query(
        `SELECT id, machine_code
           FROM machines
          WHERE process_id=? AND status='active' AND UPPER(TRIM(machine_code))=UPPER(TRIM(?))
          LIMIT 2`,
        [processId, machineCode]
      );

      if (machineRows.length === 1) {
        const machine = machineRows[0];
        const [aliasRows] = await query(
          `SELECT product_code
             FROM product_aliases
            WHERE process_id=? AND status='active' AND UPPER(TRIM(alias_code))=UPPER(TRIM(?))
            ORDER BY id
            LIMIT 1`,
          [processId, productCode]
        );
        const canonicalProduct = String(aliasRows[0]?.product_code || productCode).trim();

        const [machineStandardRows] = await query(
          `SELECT
              pms.id AS machine_standard_id,
              pms.product_code,
              pms.standard_output,
              pms.calculated_output_per_hour,
              pms.standard_time_seconds,
              pms.effective_from,
              pms.effective_to,
              pms.is_active,
              ps.id AS product_standard_id,
              COALESCE(ps.exclude_kqd_from_tt,0) AS exclude_kqd_from_tt
             FROM product_machine_standards pms
             LEFT JOIN product_standards ps
               ON ps.process_id=pms.process_id
              AND UPPER(TRIM(ps.product_code))=UPPER(TRIM(pms.product_code))
             WHERE pms.process_id=?
              AND UPPER(TRIM(pms.product_code))=UPPER(TRIM(?))
              AND pms.machine_id=?
              AND (pms.effective_from IS NULL OR pms.effective_from<=?)
              AND (pms.effective_to IS NULL OR pms.effective_to>=?)
             ORDER BY CASE WHEN pms.is_active=1 THEN 0 ELSE 1 END,
                      COALESCE(pms.effective_from,'1000-01-01') DESC,
                      pms.id DESC
             LIMIT 2`,
          [processId, canonicalProduct, Number(machine.id), workDate, workDate]
        );

        if (machineStandardRows.length === 1) {
          const row = machineStandardRows[0];
          const output = Number(row.calculated_output_per_hour ?? row.standard_output);
          if (Number.isFinite(output) && output > 0) {
            return res.status(200).json({
              success: true,
              data: {
                product_standard_id: Number(row.product_standard_id || 0),
                process_id: processId,
                product_code: String(row.product_code || canonicalProduct),
                alias_code: productCode.toUpperCase() !== String(row.product_code || canonicalProduct).toUpperCase() ? productCode : null,
                machine_id: Number(machine.id),
                machine_code: machine.machine_code,
                standard_time_seconds: Number(row.standard_time_seconds) > 0 ? Number(row.standard_time_seconds) : null,
                machine_standard_output: output,
                default_standard_output: Number(row.standard_output) > 0 ? Number(row.standard_output) : null,
                resolved_output_per_hour: output,
                standard_source: Number(row.is_active) === 1 ? 'MACHINE' : 'MACHINE_HISTORICAL',
                machine_standard_id: Number(row.machine_standard_id),
                exclude_kqd_from_tt: Number(row.exclude_kqd_from_tt || 0)
              }
            });
          }
        }
      }
    }

    const data = await productStandardModel.resolveByMachineAndProduct(processId, machineCode, productCode, workDate);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy định mức cho máy và sản phẩm đã chọn' });
    }

    const resolved = Number(data.resolved_output_per_hour || 0);
    return res.status(200).json({
      success: true,
      data: {
        ...data,
        resolved_output_per_hour: resolved,
        standard_time_seconds: data.standard_time_seconds == null ? null : Number(data.standard_time_seconds)
      }
    });
  } catch (error) {
    console.error('RESOLVE PRODUCT STANDARD ERROR:', error);
    return res.status(error.status || 500).json({ success: false, code: error.code || undefined, message: error.isPublic ? error.message : 'Không thể tra định mức theo máy và sản phẩm' });
  }
};