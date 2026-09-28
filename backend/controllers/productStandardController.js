const productStandardModel = require("../models/productStandardModel");
const machineModel = require("../models/machineModel");
const { TTL, getOrLoadMasterData } = require("../utils/masterDataCache");
const db = require("../config/db");

const query = (sql, params = []) => db.promise().query(sql, params);

const GC_NO_STANDARD_LONG_CODES = new Set(["XUATNHAP", "KTCD", "TAIPP"]);

const loadGcProductStandardsDirect = async (processId, processCode) => {
  const where = processCode
    ? `UPPER(TRIM(p.process_code)) = UPPER(TRIM(?))`
    : `p.id = ?`;
  const param = processCode || processId;

  const [rows] = await query(`
    SELECT
        ps.id,
        ps.process_id,
        p.process_code,
        CASE
          WHEN UPPER(TRIM(ps.product_code)) IN ('XUATNHAP','KTCD','TAIPP') THEN 'LONG'
          WHEN UPPER(TRIM(COALESCE(pa.alias_code, ''))) LIKE 'C%' THEN 'CUT'
          ELSE COALESCE(ps.work_type, 'LONG')
        END AS work_type,
        ps.product_code,
        COALESCE(pa.alias_code, ps.encoding_code) AS alias_code,
        ps.encoding_code,
        ps.standard_output,
        COALESCE(ps.exclude_kqd_from_tt, 0) AS exclude_kqd_from_tt,
        EXISTS(
          SELECT 1 FROM product_machine_standards pms
          WHERE pms.process_id = ps.process_id
            AND pms.product_code = ps.product_code
            AND pms.is_active = 1
        ) AS has_machine_specific_standard,
        COALESCE((
          SELECT GROUP_CONCAT(DISTINCT m.machine_code ORDER BY m.machine_code SEPARATOR ',')
          FROM product_machine_standards pms2
          JOIN machines m
            ON m.id = pms2.machine_id
           AND m.process_id = pms2.process_id
           AND m.status = 'active'
          WHERE pms2.process_id = ps.process_id
            AND pms2.product_code = ps.product_code
            AND pms2.is_active = 1
        ), '') AS eligible_machine_codes
    FROM product_standards ps
    JOIN processes p ON p.id = ps.process_id
    LEFT JOIN product_aliases pa
      ON pa.process_id = ps.process_id
     AND UPPER(TRIM(pa.product_code)) = UPPER(TRIM(ps.product_code))
     AND pa.status = 'active'
    WHERE ${where}
      AND p.status = 'active'
      AND ps.status = 'active'
      AND (
        ps.standard_output > 0
        OR UPPER(TRIM(ps.product_code)) IN ('XUATNHAP','KTCD','TAIPP')
      )
    ORDER BY ps.product_code ASC, alias_code ASC, ps.id ASC
  `, [param]);

  return Array.isArray(rows) ? rows : [];
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

    const resolvedProcessCode = processCode || String((await query(
      "SELECT process_code FROM processes WHERE id = ? LIMIT 1",
      [processId]
    ))[0]?.[0]?.process_code || '').trim().toUpperCase();

    // GC is read directly from product_standards so zero-standard Long Tay
    // work items cannot be lost by alias/standard filters in the generic model.
    // Only the three explicitly configured no-standard jobs are allowed at 0.
    const cacheKey = resolvedProcessCode === 'GC'
      ? `product-standards:v6:gc:${processId > 0 ? processId : resolvedProcessCode}`
      : processCode
        ? `product-standards:v6:code:${processCode}`
        : `product-standards:v6:id:${processId}`;

    const data = await getOrLoadMasterData(
      cacheKey,
      TTL.productStandards,
      async () => {
        if (resolvedProcessCode === 'GC') {
          return loadGcProductStandardsDirect(processId, processCode || null);
        }
        return processCode
          ? productStandardModel.findByProcessCode(processCode)
          : productStandardModel.findByProcess(processId);
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