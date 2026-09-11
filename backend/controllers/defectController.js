const Defect = require("../models/defectModel");
const { TTL, getOrLoadMasterData } = require("../utils/masterDataCache");

exports.getDefectsByProcess = async (req, res) => {
  try {
    const processId = Number(req.params.id);
    if (!Number.isInteger(processId) || processId <= 0) {
      return res.status(400).json({ success: false, message: "process_id không hợp lệ" });
    }

    // GC defect master was corrected by migration 040. Use a versioned cache key
    // so an already-warm worker isolate cannot keep serving the pre-040 NG list.
    const cacheKey = processId === 60006
      ? "defects:60006:v7"
      : `defects:${processId}`;
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
