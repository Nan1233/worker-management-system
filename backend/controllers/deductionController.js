const Deduction = require("../models/deductionModel");
const { masterDataCache, TTL } = require("../utils/masterDataCache");

exports.getDeductionsByProcess = async (req, res) => {
  try {
    const processId = Number(req.params.id);
    if (!Number.isInteger(processId) || processId <= 0) {
      return res.status(400).json({ success: false, message: "process_id không hợp lệ" });
    }

    const isCVK = processId === 60006 || processId === 30002;
    const [processRows] = await require("../config/db").promise().query(
      "SELECT UPPER(TRIM(COALESCE(process_code, ''))) AS process_code FROM processes WHERE id = ? LIMIT 1",
      [processId],
    );
    const processCode = String(processRows?.[0]?.process_code || "").trim().toUpperCase();
    const cacheKey = `deductions:v6:${processId}`;
    let data;

    // GC/CVK have self-healing canonical catalogues. Other processes must read
    // the active process-scoped DB rows directly, so changes made by admins are
    // visible immediately and a stale isolate cache cannot hide Trừ H options.
    if (isCVK || processCode === "GC") {
      masterDataCache.deleteByPrefix(cacheKey);
      data = await Deduction.getByProcess(processId);
    } else {
      data = await Deduction.getByProcess(processId);
    }

    console.info("[KTC][DEDUCTION_API]", JSON.stringify({
      requestedProcessId: processId,
      isCVK,
      returned: Array.isArray(data) ? data.length : 0,
    }));

    // Diagnostic only: lets the live deployment be verified from the browser
    // Network tab (Response Headers) without reading the payload.
    res.set("X-KTC-Deduction-Count", String(Array.isArray(data) ? data.length : 0));
    res.set("X-KTC-Deduction-Catalogue", "process-active-v2");
    return res.json({ success: true, data });
  } catch (error) {
    console.error("GET DEDUCTIONS ERROR:", error);
    return res.status(500).json({ success: false, message: "Không thể xử lý loại trừ giờ" });
  }
};
