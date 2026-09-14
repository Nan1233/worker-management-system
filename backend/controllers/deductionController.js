const Deduction = require("../models/deductionModel");
const { masterDataCache, TTL } = require("../utils/masterDataCache");

exports.getDeductionsByProcess = async (req, res) => {
  try {
    const processId = Number(req.params.id);
    if (!Number.isInteger(processId) || processId <= 0) {
      return res.status(400).json({ success: false, message: "process_id không hợp lệ" });
    }

    const isCVK = processId === 60006;

    // CVK master data is self-healed from TiDB on every request. Do not allow
    // a stale isolate cache to hide a repaired catalogue.
    const cacheKey = `deductions:v3:${processId}`;
    let data;
    if (isCVK) {
      data = await Deduction.getByProcess(processId);
      masterDataCache.delete(cacheKey);
    } else {
      data = masterDataCache.get(cacheKey);
      if (!data) {
        data = await Deduction.getByProcess(processId);
        masterDataCache.set(cacheKey, data, TTL.deductions);
      }
    }

    console.info("[KTC][DEDUCTION_API]", JSON.stringify({
      requestedProcessId: processId,
      isCVK,
      returned: Array.isArray(data) ? data.length : 0,
    }));

    return res.json({ success: true, data });
  } catch (error) {
    console.error("GET DEDUCTIONS ERROR:", error);
    return res.status(500).json({ success: false, message: "Không thể xử lý loại trừ giờ" });
  }
};
