const Defect = require("../models/defectModel");
const { TTL, getOrLoadMasterData } = require("../utils/masterDataCache");

exports.getDefectsByProcess = async (req, res) => {
  try {
    const processId = Number(req.params.id);
    if (!Number.isInteger(processId) || processId <= 0) {
      return res.status(400).json({ success: false, message: "process_id không hợp lệ" });
    }

    const cacheKey = `defects:${processId}`;
    const data = await getOrLoadMasterData(
      cacheKey,
      TTL.defects,
      () => Defect.getByProcess(processId)
    );

    return res.json({ success: true, data });
  } catch (error) {
    console.error("GET DEFECTS ERROR:", error);
    return res.status(500).json({ success: false, message: "Không thể xử lý loại lỗi" });
  }
};
