const productStandardModel = require("../models/productStandardModel");
const { masterDataCache, TTL } = require("../utils/masterDataCache");

exports.getProductStandards = async (req, res) => {
  try {
    const processId = Number(req.query.process_id);

    if (!Number.isInteger(processId) || processId <= 0) {
      return res.status(400).json({ success: false, message: "process_id không hợp lệ" });
    }

    const operationType = String(req.query.operation_type || "").toUpperCase();
    const operationMode = String(req.query.operation_mode || "").toUpperCase();
    const machineId = Number(req.query.machine_id) || 0;
    const cacheKey = `product-standards:${processId}:${operationType}:${operationMode}:${machineId}`;
    let data = masterDataCache.get(cacheKey);

    if (!data) {
      data = await productStandardModel.findByProcess(processId, { operationType, operationMode, machineId });
      masterDataCache.set(cacheKey, data, TTL.productStandards);
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("GET PRODUCT STANDARDS ERROR:", error);
    return res.status(500).json({ success: false, message: "Không thể lấy danh sách sản phẩm" });
  }
};
