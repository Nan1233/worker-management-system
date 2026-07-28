const Defect = require("../models/defectModel");
const { masterDataCache, TTL } = require("../utils/masterDataCache");

exports.getDefectsByProcess = async (req, res) => {
  try {
    const processId = Number(req.params.id);
    if (!Number.isInteger(processId) || processId <= 0) {
      return res.status(400).json({ success: false, message: "process_id không hợp lệ" });
    }

    const cacheKey = `defects:${processId}`;
    let data = masterDataCache.get(cacheKey);
    if (!data) {
      data = await Defect.getByProcess(processId);
      masterDataCache.set(cacheKey, data, TTL.defects);
    }

    return res.json({ success: true, data });
  } catch (error) {
    console.error("GET DEFECTS ERROR:", error);
    return res.status(500).json({ success: false, message: "Không thể xử lý loại lỗi" });
  }
};
