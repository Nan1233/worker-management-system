const productStandardModel = require("../models/productStandardModel");
const machineModel = require("../models/machineModel");
const { TTL, getOrLoadMasterData } = require("../utils/masterDataCache");
const db = require("../config/db");

const query = (sql, params = []) => db.promise().query(sql, params);

const GC_NO_STANDARD_LONG_CODES = new Set(["XUATNHAP", "KTCD", "TAIPP"]);

// Cache-key versions deliberately invalidate stale master data after external DB updates.
const MACHINE_CACHE_VERSION = "v3";
const PRODUCT_STANDARD_CACHE_VERSION = "v9";

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
          -- Shop-floor rule: every GC product_code beginning with C belongs to Cắt.
          -- even when an older master row was incorrectly tagged as Lồng.
          WHEN UPPER(TRIM(COALESCE(ps.product_code, ''))) LIKE 'C%' THEN 'CUT'
          -- Explicit legacy jobs remain Long Tay exceptions; other GC rows follow
          -- the persisted product_standards.work_type value.
          WHEN UPPER(TRIM(ps.product_code)) IN ('XUATNHAP','KTCD','TAIPP') THEN 'LONG'
          WHEN UPPER(TRIM(COALESCE(ps.work_type, ''))) IN ('LỒNG','LONG','LONG TAY') THEN 'LONG'
          WHEN UPPER(TRIM(COALESCE(ps.work_type, ''))) IN ('CẮT','CUT','CAT') THEN 'CUT'
          ELSE NULL
        END AS work_type,
        ps.product_code,
        ps.standard_output,
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
    WHERE ${where}
      AND p.status = 'active'
      AND ps.status = 'active'
      AND (
        ps.standard_output > 0
        OR UPPER(TRIM(ps.product_code)) IN ('XUATNHAP','KTCD','TAIPP')
      )
    ORDER BY ps.product_code ASC, ps.id ASC
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

    // A process_id request already identifies the canonical process. Avoid an
    // extra SELECT process_code round-trip before loading its product standards.
    // GC is process 1 and keeps its dedicated query for zero-standard Long Tay
    // work items; all other process IDs use the normal process-scoped model.
    const isGcRequest = processCode === 'GC' || (!processCode && processId === 1);
    const cacheKey = isGcRequest
      ? `product-standards:${PRODUCT_STANDARD_CACHE_VERSION}:gc:${processId > 0 ? processId : processCode}`
      : processCode
        ? `product-standards:${PRODUCT_STANDARD_CACHE_VERSION}:code:${processCode}`
        : `product-standards:${PRODUCT_STANDARD_CACHE_VERSION}:id:${processId}`;

    const data = await getOrLoadMasterData(
      cacheKey,
      TTL.productStandards,
      async () => {
        if (isGcRequest) {
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

    if (processId === 1 && !machineCode) {
      return res.status(422).json({ success: false, code: 'GC_WORK_TYPE_UNRESOLVED', message: 'Cần chọn máy GC thuộc nhóm C1–C12 hoặc ML1–ML20 để xác định loại công việc' });
    }

    await Promise.all([
      getOrLoadMasterData(`machines:${MACHINE_CACHE_VERSION}:${processId}`, TTL.machines, () => machineModel.findByProcess(processId)),
      getOrLoadMasterData(`product-standards:${PRODUCT_STANDARD_CACHE_VERSION}:resolve:${processId}`, TTL.productStandards, () => productStandardModel.findByProcess(processId))
    ]);

    const data = await productStandardModel.resolveByMachineAndProduct(processId, machineCode, productCode, workDate);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy định mức cho máy và sản phẩm đã chọn' });
    }

    const resolved = Number(data.resolved_output_per_hour);
    if (!Number.isFinite(resolved) || resolved <= 0) {
      return res.status(422).json({ success: false, code: 'INVALID_STANDARD_VALUE', message: 'Không có định mức hợp lệ cho sản phẩm, công đoạn và máy đã chọn' });
    }
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
