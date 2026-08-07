const productStandardModel = require("../models/productStandardModel");
const { TTL, getOrLoadMasterData } = require("../utils/masterDataCache");

exports.getProductStandards = async (req, res) => {
  try {
    const processId = Number(req.query.process_id);

    if (!Number.isInteger(processId) || processId <= 0) {
      return res.status(400).json({ success: false, message: "process_id không hợp lệ" });
    }

    const cacheKey = `product-standards:${processId}`;
    const data = await getOrLoadMasterData(
      cacheKey,
      TTL.productStandards,
      () => productStandardModel.findByProcess(processId)
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

    if (!Number.isInteger(processId) || processId <= 0 || !machineCode || !productCode) {
      return res.status(400).json({ success: false, message: 'Thiếu process_id, machine_code hoặc product_code' });
    }

    const data = await productStandardModel.resolveByMachineAndProduct(processId, machineCode, productCode);
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
    return res.status(500).json({ success: false, message: 'Không thể tra định mức theo máy và sản phẩm' });
  }
};
