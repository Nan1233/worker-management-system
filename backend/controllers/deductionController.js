const Deduction = require("../models/deductionModel");
const { masterDataCache, TTL } = require("../utils/masterDataCache");

exports.getDeductionsByProcess = async (req, res) => {
  try {
    const processId = Number(req.params.id);
    if (!Number.isInteger(processId) || processId <= 0) {
      return res.status(400).json({ success: false, message: "process_id không hợp lệ" });
    }

    const cacheKey = `deductions:${processId}`;
    let data = masterDataCache.get(cacheKey);
    if (!data) {
      data = await Deduction.getByProcess(processId);
      masterDataCache.set(cacheKey, data, TTL.deductions);
    }

    return res.json({ success: true, data });
  } catch (error) {
    console.error("GET DEDUCTIONS ERROR:", error);
    return res.status(500).json({ success: false, message: "Không thể xử lý loại trừ giờ" });
  }
};
